use std::fs::File;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use image::{imageops::FilterType, GenericImageView, ImageFormat};
use tauri::{AppHandle, Manager, State};

use crate::db::DbManager;
use crate::models::{
    Album, ExportOptions, Photo, PhotoAdjustments, PhotoFilter, WatchedFolder
};
use crate::scanner::scan_folder_recursive;
use crate::thumbnailer::{apply_orientation, get_cache_dir};
use crate::watcher::FolderWatcherManager;

pub struct AppState {
    pub db: DbManager,
    pub watcher: Arc<Mutex<FolderWatcherManager>>,
}

#[tauri::command]
pub async fn get_folders(state: State<'_, AppState>) -> Result<Vec<WatchedFolder>, String> {
    state.db.get_folders().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    scan_mode: String,
) -> Result<i64, String> {
    let p = Path::new(&path);
    if !p.exists() || !p.is_dir() {
        return Err("Invalid directory path".to_string());
    }

    // Allow folder in asset protocol scope
    let _ = app.asset_protocol_scope().allow_directory(p, true);

    let folder_id = state.db.add_folder(&path, &scan_mode).map_err(|e| e.to_string())?;

    if scan_mode == "always" {
        let mut watcher = state.watcher.lock().unwrap();
        let _ = watcher.watch_path(p);
    }

    // Run initial scan in background thread
    let db = state.db.clone();
    let app_clone = app.clone();
    let path_buf = p.to_path_buf();
    std::thread::spawn(move || {
        let _ = scan_folder_recursive(&app_clone, &db, folder_id, &path_buf);
    });

    Ok(folder_id)
}

#[tauri::command]
pub async fn remove_folder(
    state: State<'_, AppState>,
    folder_id: i64,
) -> Result<(), String> {
    // Unwatch if needed
    if let Ok(folders) = state.db.get_folders() {
        if let Some(f) = folders.iter().find(|x| x.id == folder_id) {
            let mut watcher = state.watcher.lock().unwrap();
            let _ = watcher.unwatch_path(Path::new(&f.path));
        }
    }
    state.db.remove_folder(folder_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn rescan_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    folder_id: i64,
) -> Result<usize, String> {
    let folders = state.db.get_folders().map_err(|e| e.to_string())?;
    let folder = folders.into_iter().find(|f| f.id == folder_id)
        .ok_or_else(|| "Folder not found".to_string())?;

    let db = state.db.clone();
    let path = PathBuf::from(&folder.path);
    let app_handle = app.clone();
    
    let count = scan_folder_recursive(&app_handle, &db, folder_id, &path)?;
    Ok(count)
}

#[tauri::command]
pub async fn rescan_all(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let folders = state.db.get_folders().map_err(|e| e.to_string())?;
    let db = state.db.clone();
    let app_handle = app.clone();

    std::thread::spawn(move || {
        for f in folders {
            let _ = scan_folder_recursive(&app_handle, &db, f.id, Path::new(&f.path));
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn get_photos(
    state: State<'_, AppState>,
    filter: Option<PhotoFilter>,
) -> Result<Vec<Photo>, String> {
    let f = filter.unwrap_or_default();
    state.db.get_photos(&f).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_photo(
    state: State<'_, AppState>,
    photo_id: i64,
) -> Result<Option<Photo>, String> {
    state.db.get_photo_by_id(photo_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_photo_data_url(
    state: State<'_, AppState>,
    photo_id: i64,
    preview: bool,
) -> Result<String, String> {
    let photo = state.db.get_photo_by_id(photo_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Photo not found".to_string())?;

    let target_path = if preview {
        PathBuf::from(&photo.path)
    } else {
        let p = PathBuf::from(&photo.thumbnail_path);
        if p.exists() {
            p
        } else {
            PathBuf::from(&photo.path)
        }
    };

    let bytes = std::fs::read(&target_path)
        .or_else(|_| std::fs::read(&photo.path))
        .map_err(|e| format!("Failed to read image file: {}", e))?;

    let b64 = BASE64.encode(&bytes);
    let mime = if photo.path.to_lowercase().ends_with(".png") {
        "image/png"
    } else {
        "image/jpeg"
    };

    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
pub async fn toggle_favorite(
    state: State<'_, AppState>,
    photo_id: i64,
) -> Result<bool, String> {
    state.db.toggle_favorite(photo_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn set_rating(
    state: State<'_, AppState>,
    photo_id: i64,
    rating: i32,
) -> Result<(), String> {
    state.db.set_rating(photo_id, rating).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_adjustments(
    state: State<'_, AppState>,
    photo_id: i64,
    adjustments: PhotoAdjustments,
    thumbnail_data_base64: Option<String>,
) -> Result<Photo, String> {
    let photo = state
        .db
        .get_photo_by_id(photo_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Photo not found".to_string())?;

    let cache_dir = get_cache_dir();
    let timestamp = chrono::Utc::now().timestamp_millis();
    let new_thumb_file = cache_dir.join(format!("{}_{}.jpg", photo.hash, timestamp));

    if let Some(ref b64_str) = thumbnail_data_base64 {
        let raw_b64 = if let Some(idx) = b64_str.find(',') {
            &b64_str[idx + 1..]
        } else {
            b64_str.as_str()
        };
        let bytes = BASE64
            .decode(raw_b64)
            .map_err(|e| format!("Failed to decode thumbnail base64: {}", e))?;
        std::fs::write(&new_thumb_file, &bytes)
            .map_err(|e| format!("Failed to write thumbnail: {}", e))?;
    } else {
        let path = Path::new(&photo.path);
        let mut loaded = image::open(path)
            .map_err(|e| format!("Failed to open image: {}", e))?;
        loaded = apply_orientation(loaded, photo.orientation);

        if let Some(ref crop) = adjustments.crop {
            let (w, h) = loaded.dimensions();
            let x = ((crop.x * w as f32) as u32).min(w.saturating_sub(1));
            let y = ((crop.y * h as f32) as u32).min(h.saturating_sub(1));
            let cw = ((crop.width * w as f32) as u32).max(1).min(w - x);
            let ch = ((crop.height * h as f32) as u32).max(1).min(h - y);
            loaded = loaded.crop_imm(x, y, cw, ch);
        }
        if adjustments.exposure != 0.0 {
            loaded = loaded.brighten((adjustments.exposure * 1.5) as i32);
        }
        if adjustments.contrast != 0.0 {
            loaded = loaded.adjust_contrast(adjustments.contrast);
        }
        if adjustments.black_and_white {
            loaded = loaded.grayscale();
        }

        let thumb = loaded.resize(360, 360, FilterType::Triangle);
        thumb
            .save_with_format(&new_thumb_file, ImageFormat::Jpeg)
            .map_err(|e| format!("Failed to save thumbnail: {}", e))?;
    }

    let new_thumb_path = new_thumb_file.to_string_lossy().to_string();

    state
        .db
        .save_adjustments_and_thumb(photo_id, &adjustments, &new_thumb_path)
        .map_err(|e| e.to_string())?;

    let mut updated = photo;
    updated.adjustments = Some(adjustments);
    updated.thumbnail_path = new_thumb_path;
    Ok(updated)
}

#[tauri::command]
pub async fn rotate_photo(
    state: State<'_, AppState>,
    photo_id: i64,
    new_orientation: u32,
) -> Result<Photo, String> {
    let photo = state
        .db
        .get_photo_by_id(photo_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Photo not found".to_string())?;

    let cache_dir = get_cache_dir();
    let timestamp = chrono::Utc::now().timestamp_millis();
    let new_thumb_file = cache_dir.join(format!("{}_{}.jpg", photo.hash, timestamp));

    let path = Path::new(&photo.path);
    let mut loaded = image::open(path)
        .map_err(|e| format!("Failed to open image: {}", e))?;
    loaded = apply_orientation(loaded, new_orientation);

    if let Some(ref adj) = photo.adjustments {
        if let Some(ref crop) = adj.crop {
            let (w, h) = loaded.dimensions();
            let x = ((crop.x * w as f32) as u32).min(w.saturating_sub(1));
            let y = ((crop.y * h as f32) as u32).min(h.saturating_sub(1));
            let cw = ((crop.width * w as f32) as u32).max(1).min(w - x);
            let ch = ((crop.height * h as f32) as u32).max(1).min(h - y);
            loaded = loaded.crop_imm(x, y, cw, ch);
        }
        if adj.exposure != 0.0 {
            loaded = loaded.brighten((adj.exposure * 1.5) as i32);
        }
        if adj.contrast != 0.0 {
            loaded = loaded.adjust_contrast(adj.contrast);
        }
        if adj.black_and_white {
            loaded = loaded.grayscale();
        }
    }

    let thumb = loaded.resize(360, 360, FilterType::Triangle);
    thumb
        .save_with_format(&new_thumb_file, ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to save thumbnail: {}", e))?;

    let new_thumb_path = new_thumb_file.to_string_lossy().to_string();

    state
        .db
        .update_photo_orientation_and_thumb(photo_id, new_orientation, &new_thumb_path)
        .map_err(|e| e.to_string())?;

    let mut updated = photo;
    updated.orientation = new_orientation;
    updated.thumbnail_path = new_thumb_path;
    Ok(updated)
}

#[tauri::command]
pub async fn create_album(
    state: State<'_, AppState>,
    name: String,
) -> Result<i64, String> {
    state.db.create_album(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_albums(
    state: State<'_, AppState>,
) -> Result<Vec<Album>, String> {
    state.db.get_albums().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_to_album(
    state: State<'_, AppState>,
    album_id: i64,
    photo_ids: Vec<i64>,
) -> Result<(), String> {
    state.db.add_to_album(album_id, &photo_ids).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_photo(
    state: State<'_, AppState>,
    photo_id: i64,
    options: ExportOptions,
) -> Result<String, String> {
    let mut img = if let Some(ref custom_data) = options.custom_image_data {
        let raw_b64 = if let Some(idx) = custom_data.find(',') {
            &custom_data[idx + 1..]
        } else {
            custom_data.as_str()
        };
        let bytes = BASE64.decode(raw_b64)
            .map_err(|e| format!("Failed to decode custom image base64: {}", e))?;
        image::load_from_memory(&bytes)
            .map_err(|e| format!("Failed to parse image from memory: {}", e))?
    } else {
        let photo = state.db.get_photo_by_id(photo_id)
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Photo not found".to_string())?;

        let mut loaded = image::open(&photo.path)
            .map_err(|e| format!("Failed to open image: {}", e))?;

        // Apply orientation
        loaded = apply_orientation(loaded, photo.orientation);

        // Apply adjustments if present
        if let Some(ref adj) = photo.adjustments {
            // Crop
            if let Some(ref crop) = adj.crop {
                let (w, h) = loaded.dimensions();
                let x = ((crop.x * w as f32) as u32).min(w.saturating_sub(1));
                let y = ((crop.y * h as f32) as u32).min(h.saturating_sub(1));
                let cw = ((crop.width * w as f32) as u32).max(1).min(w - x);
                let ch = ((crop.height * h as f32) as u32).max(1).min(h - y);
                loaded = loaded.crop_imm(x, y, cw, ch);
            }

            // Exposure
            if adj.exposure != 0.0 {
                loaded = loaded.brighten((adj.exposure * 1.5) as i32);
            }

            // Contrast
            if adj.contrast != 0.0 {
                loaded = loaded.adjust_contrast(adj.contrast);
            }

            // B&W or Sepia
            if adj.black_and_white {
                loaded = loaded.grayscale();
            }
        }
        loaded
    };

    // Resize if requested
    if let (Some(max_w), Some(max_h)) = (options.max_width, options.max_height) {
        if img.width() > max_w || img.height() > max_h {
            img = img.resize(max_w, max_h, FilterType::Lanczos3);
        }
    }

    // Determine format
    let target_path = Path::new(&options.target_path);
    let format = match options.format.to_lowercase().as_str() {
        "png" => ImageFormat::Png,
        "webp" => ImageFormat::WebP,
        _ => ImageFormat::Jpeg,
    };

    img.save_with_format(target_path, format)
        .map_err(|e| format!("Failed to save exported photo: {}", e))?;

    Ok(options.target_path)
}

#[tauri::command]
pub async fn export_collage(
    image_data_base64: String,
    target_path: String,
) -> Result<String, String> {
    // Strip prefix like "data:image/png;base64," if present
    let raw_b64 = if let Some(idx) = image_data_base64.find(',') {
        &image_data_base64[idx + 1..]
    } else {
        &image_data_base64
    };

    let bytes = BASE64.decode(raw_b64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let mut file = File::create(&target_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;

    file.write_all(&bytes)
        .map_err(|e| format!("Failed to write collage bytes: {}", e))?;

    Ok(target_path)
}
