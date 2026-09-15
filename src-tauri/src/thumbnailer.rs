use std::fs;
use std::path::{Path, PathBuf};
use image::{imageops::FilterType, DynamicImage, ImageFormat};
use sha2::{Digest, Sha256};

pub fn get_cache_dir() -> PathBuf {
    let base_dir = dirs::cache_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("photocasa")
        .join("thumbnails");
    let _ = fs::create_dir_all(&base_dir);
    base_dir
}

pub fn compute_photo_hash(path: &Path, file_size: u64, modified_secs: i64) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.to_string_lossy().as_bytes());
    hasher.update(file_size.to_le_bytes());
    hasher.update(modified_secs.to_le_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)
}

pub fn apply_orientation(img: DynamicImage, orientation: u32) -> DynamicImage {
    match orientation {
        3 => img.rotate180(),
        6 => img.rotate90(),
        8 => img.rotate270(),
        2 => img.fliph(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        7 => img.rotate270().fliph(),
        _ => img,
    }
}

pub fn ensure_thumbnail(
    path: &Path,
    hash: &str,
    orientation: u32,
) -> Result<String, String> {
    let cache_dir = get_cache_dir();
    let thumb_file = cache_dir.join(format!("{}.jpg", hash));

    if thumb_file.exists() {
        return Ok(thumb_file.to_string_lossy().to_string());
    }

    // Decode image
    let img = image::open(path).map_err(|e| format!("Failed to open image {:?}: {}", path, e))?;
    
    // Apply EXIF orientation
    let oriented = apply_orientation(img, orientation);

    // Resize for thumbnail (max 360x360 for high-DPI displays)
    let thumb = oriented.resize(360, 360, FilterType::Triangle);

    // Save as JPEG (universally supported in all webviews without codecs)
    thumb
        .save_with_format(&thumb_file, ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to save thumbnail {:?}: {}", thumb_file, e))?;

    Ok(thumb_file.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    #[test]
    fn test_compute_photo_hash() {
        let path = Path::new("/test/path/photo.jpg");
        let hash1 = compute_photo_hash(path, 1024, 1600000000);
        let hash2 = compute_photo_hash(path, 1024, 1600000000);
        let hash3 = compute_photo_hash(path, 2048, 1600000000);

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
    }

    #[test]
    fn test_apply_orientation() {
        let raw = RgbaImage::from_pixel(100, 50, Rgba([255, 0, 0, 255]));
        let img = DynamicImage::ImageRgba8(raw);

        // Orientation 6 is 90 deg rotation, so dimensions swap: 100x50 -> 50x100
        let oriented = apply_orientation(img, 6);
        assert_eq!(oriented.width(), 50);
        assert_eq!(oriented.height(), 100);
    }
}

