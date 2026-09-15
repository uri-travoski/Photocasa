pub mod db;
pub mod models;
pub mod scanner;
pub mod thumbnailer;
pub mod watcher;
pub mod commands;

use std::path::Path;
use std::sync::{Arc, Mutex};
use db::DbManager;
use watcher::FolderWatcherManager;
use tauri::Manager;
use commands::{
    add_folder, add_to_album, create_album, export_collage, export_photo,
    get_albums, get_folders, get_photo, get_photo_data_url, get_photos, remove_folder, rescan_all,
    rescan_folder, rotate_photo, save_adjustments, set_rating, toggle_favorite, AppState,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db = DbManager::init().expect("Failed to initialize SQLite database");
    let watcher = FolderWatcherManager::new();

    let watcher_arc = Arc::new(Mutex::new(watcher));

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            db: db.clone(),
            watcher: watcher_arc.clone(),
        })
        .setup(move |app| {
            // Allow thumbnail cache directory in asset protocol scope
            let cache_dir = dirs::cache_dir().unwrap_or_default().join("photocasa");
            let _ = app.asset_protocol_scope().allow_directory(&cache_dir, true);
            let _ = app.asset_protocol_scope().allow_directory(thumbnailer::get_cache_dir(), true);

            // Start watcher and allow existing folders
            {
                let mut w = watcher_arc.lock().unwrap();
                let _ = w.start(app.handle().clone(), db.clone());

                // Watch and allow already registered folders
                if let Ok(folders) = db.get_folders() {
                    for f in folders {
                        let _ = app.asset_protocol_scope().allow_directory(Path::new(&f.path), true);
                        if f.scan_mode == "always" {
                            let _ = w.watch_path(Path::new(&f.path));
                        }
                    }
                }
            }

            #[cfg(target_os = "linux")]
            register_linux_desktop_entries();

            if let Some(win) = app.get_webview_window("main") {
                if let Ok(img) = image::load_from_memory(include_bytes!("../icons/128x128.png")) {
                    let rgba = img.into_rgba8();
                    let (w, h) = (rgba.width(), rgba.height());
                    let icon = tauri::image::Image::new_owned(rgba.into_raw(), w, h);
                    let _ = win.set_icon(icon);
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_folders,
            add_folder,
            remove_folder,
            rescan_folder,
            rescan_all,
            get_photos,
            get_photo,
            get_photo_data_url,
            toggle_favorite,
            set_rating,
            save_adjustments,
            rotate_photo,
            create_album,
            get_albums,
            add_to_album,
            export_photo,
            export_collage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(target_os = "linux")]
fn register_linux_desktop_entries() {
    let icon_128_bytes = include_bytes!("../icons/128x128.png");
    let icon_256_bytes = include_bytes!("../icons/128x128@2x.png");

    let mut home_paths = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        home_paths.push(std::path::PathBuf::from(home));
    }
    let host_home = std::path::PathBuf::from("/home/owner");
    if host_home.exists() && !home_paths.contains(&host_home) {
        home_paths.push(host_home);
    }

    for base_home in home_paths {
        let app_dir = base_home.join(".local/share/applications");
        let icon_dir_128 = base_home.join(".local/share/icons/hicolor/128x128/apps");
        let icon_dir_256 = base_home.join(".local/share/icons/hicolor/256x256/apps");

        let _ = std::fs::create_dir_all(&app_dir);
        let _ = std::fs::create_dir_all(&icon_dir_128);
        let _ = std::fs::create_dir_all(&icon_dir_256);

        for name in &["photocasa", "app", "com.photocasa.app"] {
            let _ = std::fs::write(icon_dir_128.join(format!("{}.png", name)), icon_128_bytes);
            let _ = std::fs::write(icon_dir_256.join(format!("{}.png", name)), icon_256_bytes);
        }

        let desktop_content = |wm_class: &str| format!(
            "[Desktop Entry]\n\
            Name=Photocasa\n\
            Comment=Photo Library & Editor\n\
            Exec=app\n\
            Icon=photocasa\n\
            Terminal=false\n\
            Type=Application\n\
            Categories=Graphics;Photography;\n\
            StartupWMClass={}\n\
            StartupNotify=true\n",
            wm_class
        );

        let _ = std::fs::write(app_dir.join("photocasa.desktop"), desktop_content("photocasa"));
        let _ = std::fs::write(app_dir.join("app.desktop"), desktop_content("app"));
        let _ = std::fs::write(app_dir.join("com.photocasa.app.desktop"), desktop_content("com.photocasa.app"));
    }
}
