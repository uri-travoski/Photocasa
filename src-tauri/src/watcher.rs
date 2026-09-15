use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::time::Duration;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::db::DbManager;

#[derive(Clone, Serialize)]
pub struct PhotoFileEvent {
    pub kind: String, // "created", "modified", "deleted"
    pub path: String,
}

pub struct FolderWatcherManager {
    watcher: Option<RecommendedWatcher>,
    watched_paths: HashSet<PathBuf>,
}

impl FolderWatcherManager {
    pub fn new() -> Self {
        Self {
            watcher: None,
            watched_paths: HashSet::new(),
        }
    }

    pub fn start(&mut self, app: AppHandle, db: DbManager) -> Result<(), String> {
        let (tx, rx) = crossbeam_channel::unbounded();

        let watcher = RecommendedWatcher::new(
            move |res: notify::Result<Event>| {
                if let Ok(event) = res {
                    let _ = tx.send(event);
                }
            },
            Config::default().with_poll_interval(Duration::from_secs(2)),
        )
        .map_err(|e| e.to_string())?;

        self.watcher = Some(watcher);

        // Spawn background listener thread
        let app_handle = app.clone();
        let db_handle = db.clone();
        std::thread::spawn(move || {
            while let Ok(event) = rx.recv() {
                match event.kind {
                    EventKind::Create(_) | EventKind::Modify(_) => {
                        for path in event.paths {
                            if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                                let ext_lower = ext.to_lowercase();
                                if ["jpg", "jpeg", "png", "webp", "gif", "bmp"].contains(&ext_lower.as_str()) {
                                    // Trigger quick rescan or event
                                    let _ = app_handle.emit("photo-event", PhotoFileEvent {
                                        kind: "updated".to_string(),
                                        path: path.to_string_lossy().to_string(),
                                    });
                                }
                            }
                        }
                    }
                    EventKind::Remove(_) => {
                        for path in event.paths {
                            let path_str = path.to_string_lossy().to_string();
                            let _ = db_handle.delete_photo_by_path(&path_str);
                            let _ = app_handle.emit("photo-event", PhotoFileEvent {
                                kind: "deleted".to_string(),
                                path: path_str,
                            });
                        }
                    }
                    _ => {}
                }
            }
        });

        Ok(())
    }

    pub fn watch_path(&mut self, path: &Path) -> Result<(), String> {
        if let Some(ref mut watcher) = self.watcher {
            if !self.watched_paths.contains(path) {
                watcher
                    .watch(path, RecursiveMode::Recursive)
                    .map_err(|e| e.to_string())?;
                self.watched_paths.insert(path.to_path_buf());
            }
        }
        Ok(())
    }

    pub fn unwatch_path(&mut self, path: &Path) -> Result<(), String> {
        if let Some(ref mut watcher) = self.watcher {
            if self.watched_paths.contains(path) {
                let _ = watcher.unwatch(path);
                self.watched_paths.remove(path);
            }
        }
        Ok(())
    }
}
