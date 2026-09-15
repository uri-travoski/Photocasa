export interface WatchedFolder {
  id: number;
  path: string;
  scan_mode: 'always' | 'once';
  last_scanned_at?: string;
  photo_count?: number;
}

export interface PhotoAdjustments {
  exposure: number;     // -100 to 100 (0 default)
  contrast: number;     // -100 to 100 (0 default)
  highlights: number;   // -100 to 100 (0 default)
  shadows: number;      // -100 to 100 (0 default)
  warmth: number;       // -100 to 100 (0 default)
  tint: number;         // -100 to 100 (0 default)
  saturation: number;   // -100 to 100 (0 default)
  sepia: number;        // 0 to 100 (0 default)
  blackAndWhite: boolean; // false default
  vignette: number;     // 0 to 100 (0 default)
  grain: number;        // 0 to 100 (0 default)
  glow: number;         // 0 to 100 (0 default)
  straighten: number;   // -45 to 45 degrees
  crop?: {
    x: number;          // normalized 0..1
    y: number;          // normalized 0..1
    width: number;      // normalized 0..1
    height: number;     // normalized 0..1
  };
}

export interface Photo {
  id: number;
  folder_id: number;
  path: string;
  filename: string;
  file_size: number;
  modified_at: string;
  date_taken: string;
  width: number;
  height: number;
  camera_make?: string;
  camera_model?: string;
  iso?: number;
  focal_length?: number;
  f_number?: number;
  exposure_time?: string;
  rating: number;
  is_favorite: boolean;
  orientation: number;
  thumbnail_path: string;
  hash: string;
  adjustments?: PhotoAdjustments;
}

export interface Album {
  id: number;
  name: string;
  created_at: string;
  photo_count: number;
  cover_photo_path?: string;
}

export interface PhotoGroup {
  dateKey: string; // "2026-09-15"
  displayDate: string; // "September 15, 2026"
  photos: Photo[];
}

export type CollageType = 'pile' | 'mosaic' | 'grid';

export interface PhotoTextItem {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  backgroundColor: string;
  fontFamily: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

export interface PhotoArrowItem {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  width: number;
}

export interface PicturePileItem {
  id: string;
  photoId: number;
  photo: Photo;
  x: number;
  y: number;
  rotation: number; // degrees
  scale: number;
  zIndex: number;
}

export interface CollageConfig {
  type: CollageType;
  width: number;
  height: number;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  shadowBlur: number;
  gutter: number; // For mosaic / grid
  blendMode?: GlobalCompositeOperation;
  pileItems: PicturePileItem[];
}

export interface PhotoFilter {
  folder_id?: number;
  album_id?: number;
  only_favorites?: boolean;
  min_rating?: number;
  search_query?: string;
  year_month?: string;
}

export interface ScanProgress {
  status: string;
  folder_path: string;
  current: number;
  total: number;
  current_file: string;
}

export interface ExportOptions {
  targetPath?: string;
  target_path?: string;
  format: string;
  quality: number;
  maxWidth?: number;
  max_width?: number;
  maxHeight?: number;
  max_height?: number;
  customImageData?: string;
  custom_image_data?: string;
}

