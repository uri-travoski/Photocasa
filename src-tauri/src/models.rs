use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WatchedFolder {
    pub id: i64,
    pub path: string_alias::String,
    pub scan_mode: String,
    pub last_scanned_at: Option<String>,
    pub photo_count: i64,
}

mod string_alias {
    pub type String = std::string::String;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhotoAdjustments {
    pub exposure: f32,       // -100.0 to 100.0
    pub contrast: f32,       // -100.0 to 100.0
    pub highlights: f32,     // -100.0 to 100.0
    pub shadows: f32,        // -100.0 to 100.0
    pub warmth: f32,         // -100.0 to 100.0
    pub tint: f32,           // -100.0 to 100.0
    pub saturation: f32,     // -100.0 to 100.0
    pub sepia: f32,          // 0.0 to 100.0
    pub black_and_white: bool,
    pub vignette: f32,       // 0.0 to 100.0
    pub grain: f32,          // 0.0 to 100.0
    pub glow: f32,           // 0.0 to 100.0
    pub straighten: f32,     // -45.0 to 45.0 degrees
    pub crop: Option<CropRect>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CropRect {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Photo {
    pub id: i64,
    pub folder_id: i64,
    pub path: String,
    pub filename: String,
    pub file_size: i64,
    pub modified_at: String,
    pub date_taken: String,
    pub width: u32,
    pub height: u32,
    pub camera_make: Option<String>,
    pub camera_model: Option<String>,
    pub iso: Option<u32>,
    pub focal_length: Option<f32>,
    pub f_number: Option<f32>,
    pub exposure_time: Option<String>,
    pub rating: i32,
    pub is_favorite: bool,
    pub orientation: u32,
    pub thumbnail_path: String,
    pub hash: String,
    pub adjustments: Option<PhotoAdjustments>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PhotoFilter {
    pub folder_id: Option<i64>,
    pub album_id: Option<i64>,
    pub only_favorites: bool,
    pub min_rating: Option<i32>,
    pub search_query: Option<String>,
    pub year_month: Option<String>, // e.g. "2026-09"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Album {
    pub id: i64,
    pub name: String,
    pub created_at: String,
    pub photo_count: i64,
    pub cover_photo_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanProgress {
    pub status: String,
    pub folder_path: String,
    pub current: usize,
    pub total: usize,
    pub current_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub target_path: String,
    pub format: String, // "jpeg", "png", "webp"
    pub quality: u8,    // 1-100
    pub max_width: Option<u32>,
    pub max_height: Option<u32>,
    pub custom_image_data: Option<String>,
}
