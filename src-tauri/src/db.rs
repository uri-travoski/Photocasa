use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use rusqlite::{params, Connection, Result};
use crate::models::{Album, Photo, PhotoAdjustments, PhotoFilter, WatchedFolder};

#[derive(Clone)]
pub struct DbManager {
    conn: Arc<Mutex<Connection>>,
}

impl DbManager {
    pub fn init() -> Result<Self> {
        let db_dir = dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("photocasa");
        let _ = fs::create_dir_all(&db_dir);
        let db_path = db_dir.join("photocasa.db");

        let conn = Connection::open(db_path)?;
        conn.execute_batch(
            "
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,
                scan_mode TEXT NOT NULL DEFAULT 'always',
                last_scanned_at TEXT
            );

            CREATE TABLE IF NOT EXISTS photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                folder_id INTEGER NOT NULL,
                path TEXT NOT NULL UNIQUE,
                filename TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                modified_at TEXT NOT NULL,
                date_taken TEXT NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                camera_make TEXT,
                camera_model TEXT,
                iso INTEGER,
                focal_length REAL,
                f_number REAL,
                exposure_time TEXT,
                rating INTEGER NOT NULL DEFAULT 0,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                orientation INTEGER NOT NULL DEFAULT 1,
                thumbnail_path TEXT NOT NULL,
                hash TEXT NOT NULL,
                adjustments_json TEXT,
                FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS albums (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS album_photos (
                album_id INTEGER NOT NULL,
                photo_id INTEGER NOT NULL,
                added_at TEXT NOT NULL,
                PRIMARY KEY (album_id, photo_id),
                FOREIGN KEY(album_id) REFERENCES albums(id) ON DELETE CASCADE,
                FOREIGN KEY(photo_id) REFERENCES photos(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_photos_date_taken ON photos(date_taken DESC);
            CREATE INDEX IF NOT EXISTS idx_photos_folder ON photos(folder_id);
            CREATE INDEX IF NOT EXISTS idx_photos_favorite ON photos(is_favorite);
            CREATE INDEX IF NOT EXISTS idx_photos_rating ON photos(rating);
            CREATE INDEX IF NOT EXISTS idx_photos_path ON photos(path);
            "
        )?;

        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
        })
    }

    pub fn get_folders(&self) -> Result<Vec<WatchedFolder>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT f.id, f.path, f.scan_mode, f.last_scanned_at, COUNT(p.id) AS photo_count
             FROM folders f
             LEFT JOIN photos p ON p.folder_id = f.id
             GROUP BY f.id
             ORDER BY f.path ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(WatchedFolder {
                id: row.get(0)?,
                path: row.get(1)?,
                scan_mode: row.get(2)?,
                last_scanned_at: row.get(3)?,
                photo_count: row.get(4)?,
            })
        })?;

        let mut folders = Vec::new();
        for folder in rows {
            folders.push(folder?);
        }
        Ok(folders)
    }

    pub fn add_folder(&self, path: &str, scan_mode: &str) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO folders (path, scan_mode) VALUES (?1, ?2)
             ON CONFLICT(path) DO UPDATE SET scan_mode = ?2",
            params![path, scan_mode],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn update_folder_scanned(&self, folder_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE folders SET last_scanned_at = ?1 WHERE id = ?2",
            params![now, folder_id],
        )?;
        Ok(())
    }

    pub fn remove_folder(&self, folder_id: i64) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM folders WHERE id = ?1", params![folder_id])?;
        Ok(())
    }

    pub fn upsert_photo(&self, photo: &Photo) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let adj_json = photo.adjustments.as_ref().map(|a| serde_json::to_string(a).unwrap_or_default());
        
        conn.execute(
            "INSERT INTO photos (
                folder_id, path, filename, file_size, modified_at, date_taken,
                width, height, camera_make, camera_model, iso, focal_length,
                f_number, exposure_time, rating, is_favorite, orientation,
                thumbnail_path, hash, adjustments_json
            ) VALUES (
                ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20
            ) ON CONFLICT(path) DO UPDATE SET
                file_size = excluded.file_size,
                modified_at = excluded.modified_at,
                date_taken = excluded.date_taken,
                width = excluded.width,
                height = excluded.height,
                camera_make = excluded.camera_make,
                camera_model = excluded.camera_model,
                iso = excluded.iso,
                focal_length = excluded.focal_length,
                f_number = excluded.f_number,
                exposure_time = excluded.exposure_time,
                orientation = excluded.orientation,
                thumbnail_path = excluded.thumbnail_path,
                hash = excluded.hash",
            params![
                photo.folder_id,
                photo.path,
                photo.filename,
                photo.file_size,
                photo.modified_at,
                photo.date_taken,
                photo.width,
                photo.height,
                photo.camera_make,
                photo.camera_model,
                photo.iso,
                photo.focal_length,
                photo.f_number,
                photo.exposure_time,
                photo.rating,
                if photo.is_favorite { 1 } else { 0 },
                photo.orientation,
                photo.thumbnail_path,
                photo.hash,
                adj_json,
            ],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn delete_photo_by_path(&self, path: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM photos WHERE path = ?1", params![path])?;
        Ok(())
    }

    pub fn get_photos(&self, filter: &PhotoFilter) -> Result<Vec<Photo>> {
        let conn = self.conn.lock().unwrap();
        let mut query = String::from(
            "SELECT p.id, p.folder_id, p.path, p.filename, p.file_size, p.modified_at, p.date_taken,
                    p.width, p.height, p.camera_make, p.camera_model, p.iso, p.focal_length,
                    p.f_number, p.exposure_time, p.rating, p.is_favorite, p.orientation,
                    p.thumbnail_path, p.hash, p.adjustments_json
             FROM photos p"
        );

        let mut conditions = Vec::new();
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        if let Some(album_id) = filter.album_id {
            query.push_str(" INNER JOIN album_photos ap ON ap.photo_id = p.id AND ap.album_id = ?");
            params_vec.push(Box::new(album_id));
        }

        if let Some(folder_id) = filter.folder_id {
            conditions.push("p.folder_id = ?");
            params_vec.push(Box::new(folder_id));
        }

        if filter.only_favorites {
            conditions.push("p.is_favorite = 1");
        }

        if let Some(min_r) = filter.min_rating {
            conditions.push("p.rating >= ?");
            params_vec.push(Box::new(min_r));
        }

        if let Some(ref q) = filter.search_query {
            conditions.push("(p.filename LIKE ? OR p.path LIKE ?)");
            params_vec.push(Box::new(format!("%{}%", q)));
            params_vec.push(Box::new(format!("%{}%", q)));
        }

        if let Some(ref ym) = filter.year_month {
            conditions.push("p.date_taken LIKE ?");
            params_vec.push(Box::new(format!("{}%", ym)));
        }

        if !conditions.is_empty() {
            query.push_str(" WHERE ");
            query.push_str(&conditions.join(" AND "));
        }

        query.push_str(" ORDER BY p.date_taken DESC, p.id DESC");

        let mut stmt = conn.prepare(&query)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|b| b.as_ref()).collect();

        let rows = stmt.query_map(param_refs.as_slice(), |row| {
            let adj_json: Option<String> = row.get(20)?;
            let adjustments: Option<PhotoAdjustments> = adj_json
                .and_then(|j| serde_json::from_str(&j).ok());

            Ok(Photo {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                path: row.get(2)?,
                filename: row.get(3)?,
                file_size: row.get(4)?,
                modified_at: row.get(5)?,
                date_taken: row.get(6)?,
                width: row.get(7)?,
                height: row.get(8)?,
                camera_make: row.get(9)?,
                camera_model: row.get(10)?,
                iso: row.get(11)?,
                focal_length: row.get(12)?,
                f_number: row.get(13)?,
                exposure_time: row.get(14)?,
                rating: row.get(15)?,
                is_favorite: row.get::<_, i32>(16)? == 1,
                orientation: row.get(17)?,
                thumbnail_path: row.get(18)?,
                hash: row.get(19)?,
                adjustments,
            })
        })?;

        let mut photos = Vec::new();
        for p in rows {
            photos.push(p?);
        }
        Ok(photos)
    }

    pub fn get_photo_by_id(&self, photo_id: i64) -> Result<Option<Photo>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, folder_id, path, filename, file_size, modified_at, date_taken,
                    width, height, camera_make, camera_model, iso, focal_length,
                    f_number, exposure_time, rating, is_favorite, orientation,
                    thumbnail_path, hash, adjustments_json
             FROM photos WHERE id = ?1"
        )?;

        let mut rows = stmt.query_map(params![photo_id], |row| {
            let adj_json: Option<String> = row.get(20)?;
            let adjustments: Option<PhotoAdjustments> = adj_json
                .and_then(|j| serde_json::from_str(&j).ok());

            Ok(Photo {
                id: row.get(0)?,
                folder_id: row.get(1)?,
                path: row.get(2)?,
                filename: row.get(3)?,
                file_size: row.get(4)?,
                modified_at: row.get(5)?,
                date_taken: row.get(6)?,
                width: row.get(7)?,
                height: row.get(8)?,
                camera_make: row.get(9)?,
                camera_model: row.get(10)?,
                iso: row.get(11)?,
                focal_length: row.get(12)?,
                f_number: row.get(13)?,
                exposure_time: row.get(14)?,
                rating: row.get(15)?,
                is_favorite: row.get::<_, i32>(16)? == 1,
                orientation: row.get(17)?,
                thumbnail_path: row.get(18)?,
                hash: row.get(19)?,
                adjustments,
            })
        })?;

        if let Some(res) = rows.next() {
            Ok(Some(res?))
        } else {
            Ok(None)
        }
    }

    pub fn toggle_favorite(&self, photo_id: i64) -> Result<bool> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE photos SET is_favorite = (CASE WHEN is_favorite = 1 THEN 0 ELSE 1 END) WHERE id = ?1",
            params![photo_id],
        )?;
        let mut stmt = conn.prepare("SELECT is_favorite FROM photos WHERE id = ?1")?;
        let is_fav: i32 = stmt.query_row(params![photo_id], |r| r.get(0))?;
        Ok(is_fav == 1)
    }

    pub fn set_rating(&self, photo_id: i64, rating: i32) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE photos SET rating = ?1 WHERE id = ?2",
            params![rating, photo_id],
        )?;
        Ok(())
    }

    pub fn save_adjustments(&self, photo_id: i64, adjustments: &PhotoAdjustments) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let adj_json = serde_json::to_string(adjustments).unwrap_or_default();
        conn.execute(
            "UPDATE photos SET adjustments_json = ?1 WHERE id = ?2",
            params![adj_json, photo_id],
        )?;
        Ok(())
    }

    pub fn save_adjustments_and_thumb(
        &self,
        photo_id: i64,
        adjustments: &PhotoAdjustments,
        thumb_path: &str,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let adj_json = serde_json::to_string(adjustments).unwrap_or_default();
        conn.execute(
            "UPDATE photos SET adjustments_json = ?1, thumbnail_path = ?2 WHERE id = ?3",
            params![adj_json, thumb_path, photo_id],
        )?;
        Ok(())
    }

    pub fn update_photo_orientation_and_thumb(
        &self,
        photo_id: i64,
        orientation: u32,
        thumb_path: &str,
    ) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE photos SET orientation = ?1, thumbnail_path = ?2 WHERE id = ?3",
            params![orientation, thumb_path, photo_id],
        )?;
        Ok(())
    }

    pub fn create_album(&self, name: &str) -> Result<i64> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO albums (name, created_at) VALUES (?1, ?2)",
            params![name, now],
        )?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_albums(&self) -> Result<Vec<Album>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT a.id, a.name, a.created_at, COUNT(ap.photo_id) AS photo_count,
                    (SELECT p.thumbnail_path FROM photos p
                     JOIN album_photos ap2 ON ap2.photo_id = p.id
                     WHERE ap2.album_id = a.id
                     ORDER BY ap2.added_at DESC LIMIT 1) AS cover
             FROM albums a
             LEFT JOIN album_photos ap ON ap.album_id = a.id
             GROUP BY a.id
             ORDER BY a.name ASC"
        )?;

        let rows = stmt.query_map([], |row| {
            Ok(Album {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
                photo_count: row.get(3)?,
                cover_photo_path: row.get(4)?,
            })
        })?;

        let mut albums = Vec::new();
        for a in rows {
            albums.push(a?);
        }
        Ok(albums)
    }

    pub fn add_to_album(&self, album_id: i64, photo_ids: &[i64]) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        for &pid in photo_ids {
            let _ = conn.execute(
                "INSERT OR IGNORE INTO album_photos (album_id, photo_id, added_at) VALUES (?1, ?2, ?3)",
                params![album_id, pid, now],
            );
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_in_memory_crud() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE folders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT NOT NULL UNIQUE,
                scan_mode TEXT NOT NULL DEFAULT 'always',
                last_scanned_at TEXT
            );

            CREATE TABLE photos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                folder_id INTEGER NOT NULL,
                path TEXT NOT NULL UNIQUE,
                filename TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                modified_at TEXT NOT NULL,
                date_taken TEXT NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                camera_make TEXT,
                camera_model TEXT,
                iso INTEGER,
                focal_length REAL,
                f_number REAL,
                exposure_time TEXT,
                rating INTEGER NOT NULL DEFAULT 0,
                is_favorite INTEGER NOT NULL DEFAULT 0,
                orientation INTEGER NOT NULL DEFAULT 1,
                thumbnail_path TEXT NOT NULL,
                hash TEXT NOT NULL,
                adjustments_json TEXT
            );

            CREATE TABLE albums (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );

            CREATE TABLE album_photos (
                album_id INTEGER NOT NULL,
                photo_id INTEGER NOT NULL,
                added_at TEXT NOT NULL,
                PRIMARY KEY (album_id, photo_id)
            );
            "
        ).unwrap();

        let db = DbManager {
            conn: Arc::new(Mutex::new(conn)),
        };

        // 1. Add folder
        let folder_id = db.add_folder("/test/pictures", "always").unwrap();
        assert!(folder_id > 0);

        let folders = db.get_folders().unwrap();
        assert_eq!(folders.len(), 1);
        assert_eq!(folders[0].path, "/test/pictures");

        // 2. Insert photo
        let photo = Photo {
            id: 0,
            folder_id,
            path: "/test/pictures/img1.jpg".to_string(),
            filename: "img1.jpg".to_string(),
            file_size: 1024,
            modified_at: "2026-09-15T00:00:00Z".to_string(),
            date_taken: "2026-09-15T00:00:00".to_string(),
            width: 1920,
            height: 1080,
            camera_make: Some("Sony".to_string()),
            camera_model: Some("A7IV".to_string()),
            iso: Some(100),
            focal_length: Some(35.0),
            f_number: Some(2.8),
            exposure_time: Some("1/250".to_string()),
            rating: 4,
            is_favorite: false,
            orientation: 1,
            thumbnail_path: "/test/thumb.webp".to_string(),
            hash: "testhash".to_string(),
            adjustments: None,
        };
        let photo_id = db.upsert_photo(&photo).unwrap();
        assert!(photo_id > 0);

        // 3. Query photos
        let photos = db.get_photos(&PhotoFilter::default()).unwrap();
        assert_eq!(photos.len(), 1);
        assert_eq!(photos[0].filename, "img1.jpg");

        // 4. Toggle favorite
        let is_fav = db.toggle_favorite(photo_id).unwrap();
        assert!(is_fav);

        // 5. Save non-destructive adjustments
        let adj = PhotoAdjustments {
            exposure: 10.0,
            contrast: 15.0,
            highlights: 0.0,
            shadows: 0.0,
            warmth: 5.0,
            tint: 0.0,
            saturation: 10.0,
            sepia: 0.0,
            black_and_white: false,
            vignette: 20.0,
            grain: 0.0,
            glow: 0.0,
            straighten: 2.5,
            crop: None,
        };
        db.save_adjustments(photo_id, &adj).unwrap();

        let p_updated = db.get_photo_by_id(photo_id).unwrap().unwrap();
        assert!(p_updated.adjustments.is_some());
        assert_eq!(p_updated.adjustments.unwrap().contrast, 15.0);

        // 5b. Save adjustments with updated thumbnail
        db.save_adjustments_and_thumb(photo_id, &adj, "/test/thumb_edited.jpg").unwrap();
        let p_thumb = db.get_photo_by_id(photo_id).unwrap().unwrap();
        assert_eq!(p_thumb.thumbnail_path, "/test/thumb_edited.jpg");

        // 5c. Rotate photo orientation and thumbnail
        db.update_photo_orientation_and_thumb(photo_id, 6, "/test/thumb_rot.jpg").unwrap();
        let p_rot = db.get_photo_by_id(photo_id).unwrap().unwrap();
        assert_eq!(p_rot.orientation, 6);
        assert_eq!(p_rot.thumbnail_path, "/test/thumb_rot.jpg");

        // 6. Albums
        let album_id = db.create_album("Vacation 2026").unwrap();
        db.add_to_album(album_id, &[photo_id]).unwrap();
        let albums = db.get_albums().unwrap();
        assert_eq!(albums.len(), 1);
        assert_eq!(albums[0].name, "Vacation 2026");
        assert_eq!(albums[0].photo_count, 1);
    }
}

