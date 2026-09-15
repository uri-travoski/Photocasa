use std::fs::{self, File};
use std::io::BufReader;
use std::path::{Path, PathBuf};
use chrono::{DateTime, Local, NaiveDateTime};
use exif::{In, Reader, Tag, Value};
use rayon::prelude::*;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use crate::db::DbManager;
use crate::models::{Photo, ScanProgress};
use crate::thumbnailer::{compute_photo_hash, ensure_thumbnail};

const SUPPORTED_EXTENSIONS: &[&str] = &[
    "jpg", "jpeg", "png", "webp", "gif", "bmp", "tiff", "tif"
];

pub struct ExifData {
    pub date_taken: Option<String>,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub iso: Option<u32>,
    pub focal_length: Option<f32>,
    pub f_number: Option<f32>,
    pub exposure_time: Option<String>,
    pub orientation: u32,
    pub width: Option<u32>,
    pub height: Option<u32>,
}

pub fn extract_exif(path: &Path) -> ExifData {
    let mut data = ExifData {
        date_taken: None,
        camera_make: None,
        camera_model: None,
        iso: None,
        focal_length: None,
        f_number: None,
        exposure_time: None,
        orientation: 1,
        width: None,
        height: None,
    };

    let file = match File::open(path) {
        Ok(f) => f,
        Err(_) => return data,
    };

    let mut bufreader = BufReader::new(file);
    let exif = match Reader::new().read_from_container(&mut bufreader) {
        Ok(e) => e,
        Err(_) => return data,
    };

    // Camera Make & Model
    if let Some(f) = exif.get_field(Tag::Make, In::PRIMARY) {
        data.camera_make = Some(f.display_value().to_string().trim_matches('"').to_string());
    }
    if let Some(f) = exif.get_field(Tag::Model, In::PRIMARY) {
        data.camera_model = Some(f.display_value().to_string().trim_matches('"').to_string());
    }

    // Orientation
    if let Some(f) = exif.get_field(Tag::Orientation, In::PRIMARY) {
        if let Some(val) = f.value.get_uint(0) {
            data.orientation = val;
        }
    }

    // Date Taken (DateTimeOriginal preferred, fallback DateTime)
    let date_field = exif.get_field(Tag::DateTimeOriginal, In::PRIMARY)
        .or_else(|| exif.get_field(Tag::DateTime, In::PRIMARY));

    if let Some(f) = date_field {
        let raw = f.display_value().to_string().trim_matches('"').to_string();
        // Standard EXIF format: "YYYY:MM:DD HH:MM:SS"
        if let Ok(naive) = NaiveDateTime::parse_from_str(&raw, "%Y:%m:%d %H:%M:%S") {
            data.date_taken = Some(naive.format("%Y-%m-%dT%H:%M:%S").to_string());
        }
    }

    // ISO
    if let Some(f) = exif.get_field(Tag::PhotographicSensitivity, In::PRIMARY) {
        if let Some(val) = f.value.get_uint(0) {
            data.iso = Some(val);
        }
    }

    // F-Number
    if let Some(f) = exif.get_field(Tag::FNumber, In::PRIMARY) {
        if let Value::Rational(ref r) = f.value {
            if let Some(rat) = r.first() {
                if rat.denom != 0 {
                    data.f_number = Some(rat.num as f32 / rat.denom as f32);
                }
            }
        }
    }

    // Exposure Time
    if let Some(f) = exif.get_field(Tag::ExposureTime, In::PRIMARY) {
        data.exposure_time = Some(f.display_value().to_string());
    }

    // Focal Length
    if let Some(f) = exif.get_field(Tag::FocalLength, In::PRIMARY) {
        if let Value::Rational(ref r) = f.value {
            if let Some(rat) = r.first() {
                if rat.denom != 0 {
                    data.focal_length = Some(rat.num as f32 / rat.denom as f32);
                }
            }
        }
    }

    data
}

pub fn scan_folder_recursive(
    app: &AppHandle,
    db: &DbManager,
    folder_id: i64,
    folder_path: &Path,
) -> Result<usize, String> {
    if !folder_path.exists() {
        return Err(format!("Folder path does not exist: {:?}", folder_path));
    }

    // Discover image files
    let mut candidate_paths: Vec<PathBuf> = Vec::new();
    for entry in WalkDir::new(folder_path).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                if SUPPORTED_EXTENSIONS.contains(&ext.to_lowercase().as_str()) {
                    candidate_paths.push(entry.path().to_path_buf());
                }
            }
        }
    }

    let total = candidate_paths.len();
    let folder_str = folder_path.to_string_lossy().to_string();

    let _ = app.emit("scan-progress", ScanProgress {
        status: "indexing".to_string(),
        folder_path: folder_str.clone(),
        current: 0,
        total,
        current_file: "".to_string(),
    });

    // Process files in parallel batches
    let processed_photos: Vec<Photo> = candidate_paths
        .par_iter()
        .filter_map(|path| {
            let metadata = fs::metadata(path).ok()?;
            let file_size = metadata.len();
            let modified = metadata.modified().ok()?;
            let modified_dt: DateTime<Local> = modified.into();
            let modified_at = modified_dt.to_rfc3339();
            let modified_secs = modified_dt.timestamp();

            let filename = path.file_name()?.to_string_lossy().to_string();
            let hash = compute_photo_hash(path, file_size, modified_secs);

            let exif = extract_exif(path);
            let date_taken = exif.date_taken.unwrap_or_else(|| modified_dt.format("%Y-%m-%dT%H:%M:%S").to_string());
            let orientation = exif.orientation;

            // Generate thumbnail
            let thumb_path = match ensure_thumbnail(path, &hash, orientation) {
                Ok(tp) => tp,
                Err(e) => {
                    log::warn!("Failed thumbnail for {:?}: {}", path, e);
                    return None;
                }
            };

            // Detect image dimensions using fast header reader or thumbnail
            let (width, height) = match image::image_dimensions(path) {
                Ok((w, h)) => {
                    if orientation == 6 || orientation == 8 || orientation == 5 || orientation == 7 {
                        (h, w)
                    } else {
                        (w, h)
                    }
                }
                Err(_) => (800, 600),
            };

            Some(Photo {
                id: 0,
                folder_id,
                path: path.to_string_lossy().to_string(),
                filename,
                file_size: file_size as i64,
                modified_at,
                date_taken,
                width,
                height,
                camera_make: exif.camera_make,
                camera_model: exif.camera_model,
                iso: exif.iso,
                focal_length: exif.focal_length,
                f_number: exif.f_number,
                exposure_time: exif.exposure_time,
                rating: 0,
                is_favorite: false,
                orientation,
                thumbnail_path: thumb_path,
                hash,
                adjustments: None,
            })
        })
        .collect();

    // Insert into DB
    let count = processed_photos.len();
    for photo in &processed_photos {
        let _ = db.upsert_photo(photo);
    }
    let _ = db.update_folder_scanned(folder_id);

    let _ = app.emit("scan-progress", ScanProgress {
        status: "complete".to_string(),
        folder_path: folder_str,
        current: count,
        total,
        current_file: "".to_string(),
    });

    Ok(count)
}
