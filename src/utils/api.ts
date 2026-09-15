import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import type { Album, ExportOptions, Photo, PhotoAdjustments, PhotoFilter, WatchedFolder } from '../types';

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

// Fallback mock data for web browser preview / testing
let mockFolders: WatchedFolder[] = [
  { id: 1, path: '/home/user/Pictures/Vacation2026', scan_mode: 'always', photo_count: 6, last_scanned_at: new Date().toISOString() },
  { id: 2, path: '/home/user/Pictures/Portraits', scan_mode: 'always', photo_count: 4, last_scanned_at: new Date().toISOString() },
];

let mockPhotos: Photo[] = [
  {
    id: 1,
    folder_id: 1,
    path: '/home/user/Pictures/Vacation2026/beach_sunset.jpg',
    filename: 'beach_sunset.jpg',
    file_size: 3420000,
    modified_at: '2026-09-14T18:30:00Z',
    date_taken: '2026-09-14T18:30:00',
    width: 1920,
    height: 1080,
    camera_make: 'Sony',
    camera_model: 'ILCE-7M4',
    iso: 100,
    focal_length: 35,
    f_number: 2.8,
    exposure_time: '1/500s',
    rating: 5,
    is_favorite: true,
    orientation: 1,
    thumbnail_path: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
    hash: 'mock1',
  },
  {
    id: 2,
    folder_id: 1,
    path: '/home/user/Pictures/Vacation2026/mountain_lake.jpg',
    filename: 'mountain_lake.jpg',
    file_size: 4210000,
    modified_at: '2026-09-14T14:15:00Z',
    date_taken: '2026-09-14T14:15:00',
    width: 1920,
    height: 1280,
    camera_make: 'Sony',
    camera_model: 'ILCE-7M4',
    iso: 200,
    focal_length: 50,
    f_number: 4.0,
    exposure_time: '1/1000s',
    rating: 4,
    is_favorite: false,
    orientation: 1,
    thumbnail_path: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80',
    hash: 'mock2',
  },
  {
    id: 3,
    folder_id: 1,
    path: '/home/user/Pictures/Vacation2026/forest_trail.jpg',
    filename: 'forest_trail.jpg',
    file_size: 2950000,
    modified_at: '2026-09-13T10:20:00Z',
    date_taken: '2026-09-13T10:20:00',
    width: 1200,
    height: 1600,
    camera_make: 'Fujifilm',
    camera_model: 'X-T5',
    iso: 400,
    focal_length: 23,
    f_number: 2.0,
    exposure_time: '1/250s',
    rating: 3,
    is_favorite: true,
    orientation: 1,
    thumbnail_path: 'https://images.unsplash.com/photo-1448375240586-882707db888b?w=800&q=80',
    hash: 'mock3',
  },
  {
    id: 4,
    folder_id: 2,
    path: '/home/user/Pictures/Portraits/golden_hour.jpg',
    filename: 'golden_hour.jpg',
    file_size: 5120000,
    modified_at: '2026-09-12T17:45:00Z',
    date_taken: '2026-09-12T17:45:00',
    width: 1200,
    height: 1800,
    camera_make: 'Canon',
    camera_model: 'EOS R5',
    iso: 160,
    focal_length: 85,
    f_number: 1.4,
    exposure_time: '1/1250s',
    rating: 5,
    is_favorite: true,
    orientation: 1,
    thumbnail_path: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&q=80',
    hash: 'mock4',
  },
  {
    id: 5,
    folder_id: 2,
    path: '/home/user/Pictures/Portraits/urban_look.jpg',
    filename: 'urban_look.jpg',
    file_size: 3880000,
    modified_at: '2026-09-10T16:00:00Z',
    date_taken: '2026-09-10T16:00:00',
    width: 1920,
    height: 1280,
    camera_make: 'Canon',
    camera_model: 'EOS R5',
    iso: 320,
    focal_length: 50,
    f_number: 1.8,
    exposure_time: '1/800s',
    rating: 4,
    is_favorite: false,
    orientation: 1,
    thumbnail_path: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&q=80',
    hash: 'mock5',
  },
  {
    id: 6,
    folder_id: 1,
    path: '/home/user/Pictures/Vacation2026/coastal_cliffs.jpg',
    filename: 'coastal_cliffs.jpg',
    file_size: 6100000,
    modified_at: '2026-08-28T11:10:00Z',
    date_taken: '2026-08-28T11:10:00',
    width: 2000,
    height: 1333,
    camera_make: 'Sony',
    camera_model: 'ILCE-7M4',
    iso: 100,
    focal_length: 24,
    f_number: 8.0,
    exposure_time: '1/320s',
    rating: 4,
    is_favorite: false,
    orientation: 1,
    thumbnail_path: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=800&q=80',
    hash: 'mock6',
  }
];

let mockAlbums: Album[] = [
  { id: 1, name: 'Best of Summer', created_at: '2026-09-01T00:00:00Z', photo_count: 3, cover_photo_path: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80' },
  { id: 2, name: 'Portraits & Studio', created_at: '2026-09-05T00:00:00Z', photo_count: 2, cover_photo_path: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&q=80' },
];

export function getPhotoSrc(photo: Photo, fullResolution = false): string {
  const target = fullResolution ? photo.path : (photo.thumbnail_path || photo.path);
  if (!target) return '';
  // If target is web URL or base64 data URL, return directly!
  if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('data:')) {
    return target;
  }
  if (!isTauri) {
    return target;
  }
  return convertFileSrc(target);
}

export async function apiGetPhotoDataUrl(photoId: number, preview = false): Promise<string> {
  if (isTauri) {
    try {
      return await invoke<string>('get_photo_data_url', { photoId, preview });
    } catch (e) {
      console.warn('Failed get_photo_data_url', e);
    }
  }
  const photo = mockPhotos.find(p => p.id === photoId);
  return photo ? getPhotoSrc(photo, preview) : '';
}

export async function apiGetFolders(): Promise<WatchedFolder[]> {
  if (isTauri) {
    return await invoke<WatchedFolder[]>('get_folders');
  }
  return [...mockFolders];
}

export async function apiAddFolder(path: string, scanMode: 'always' | 'once' = 'always'): Promise<number> {
  if (isTauri) {
    return await invoke<number>('add_folder', { path, scanMode });
  }
  const id = Date.now();
  mockFolders.push({ id, path, scan_mode: scanMode, photo_count: 0, last_scanned_at: new Date().toISOString() });
  return id;
}

export async function apiRemoveFolder(folderId: number): Promise<void> {
  if (isTauri) {
    await invoke('remove_folder', { folderId });
    return;
  }
  mockFolders = mockFolders.filter(f => f.id !== folderId);
  mockPhotos = mockPhotos.filter(p => p.folder_id !== folderId);
}

export async function apiRescanFolder(folderId: number): Promise<number> {
  if (isTauri) {
    return await invoke<number>('rescan_folder', { folderId });
  }
  return mockPhotos.filter(p => p.folder_id === folderId).length;
}

export async function apiRescanAll(): Promise<void> {
  if (isTauri) {
    await invoke('rescan_all');
  }
}

export async function apiGetPhotos(filter?: PhotoFilter): Promise<Photo[]> {
  if (isTauri) {
    return await invoke<Photo[]>('get_photos', { filter });
  }
  let list = [...mockPhotos];
  if (filter?.folder_id) list = list.filter(p => p.folder_id === filter.folder_id);
  if (filter?.only_favorites) list = list.filter(p => p.is_favorite);
  if (filter?.min_rating) list = list.filter(p => p.rating >= (filter.min_rating || 0));
  if (filter?.search_query) {
    const q = filter.search_query.toLowerCase();
    list = list.filter(p => p.filename.toLowerCase().includes(q) || p.path.toLowerCase().includes(q));
  }
  if (filter?.year_month) {
    list = list.filter(p => p.date_taken.startsWith(filter.year_month!));
  }
  return list;
}

export async function apiGetPhoto(photoId: number): Promise<Photo | null> {
  if (isTauri) {
    return await invoke<Photo | null>('get_photo', { photoId });
  }
  return mockPhotos.find(p => p.id === photoId) || null;
}

export async function apiToggleFavorite(photoId: number): Promise<boolean> {
  if (isTauri) {
    return await invoke<boolean>('toggle_favorite', { photoId });
  }
  const photo = mockPhotos.find(p => p.id === photoId);
  if (photo) {
    photo.is_favorite = !photo.is_favorite;
    return photo.is_favorite;
  }
  return false;
}

export async function apiSetRating(photoId: number, rating: number): Promise<void> {
  if (isTauri) {
    await invoke('set_rating', { photoId, rating });
    return;
  }
  const photo = mockPhotos.find(p => p.id === photoId);
  if (photo) photo.rating = rating;
}

export async function apiSaveAdjustments(
  photoId: number,
  adjustments: PhotoAdjustments,
  thumbnailDataBase64?: string
): Promise<Photo | null> {
  if (isTauri) {
    return await invoke<Photo>('save_adjustments', {
      photoId,
      adjustments,
      thumbnailDataBase64: thumbnailDataBase64 || null,
    });
  }
  const photo = mockPhotos.find((p) => p.id === photoId);
  if (photo) {
    photo.adjustments = adjustments;
    if (thumbnailDataBase64) {
      photo.thumbnail_path = thumbnailDataBase64;
    }
    return { ...photo };
  }
  return null;
}

export async function apiRotatePhoto(
  photoId: number,
  newOrientation: number
): Promise<Photo | null> {
  if (isTauri) {
    return await invoke<Photo>('rotate_photo', {
      photoId,
      newOrientation,
    });
  }
  const photo = mockPhotos.find((p) => p.id === photoId);
  if (photo) {
    photo.orientation = newOrientation;
    return { ...photo };
  }
  return null;
}

export async function apiGetAlbums(): Promise<Album[]> {
  if (isTauri) {
    return await invoke<Album[]>('get_albums');
  }
  return [...mockAlbums];
}

export async function apiCreateAlbum(name: string): Promise<number> {
  if (isTauri) {
    return await invoke<number>('create_album', { name });
  }
  const id = Date.now();
  mockAlbums.push({ id, name, created_at: new Date().toISOString(), photo_count: 0 });
  return id;
}

export async function apiExportPhoto(photoId: number, options: ExportOptions): Promise<string> {
  const targetPath = options.targetPath || options.target_path || '';
  const payload = {
    targetPath,
    format: options.format,
    quality: options.quality,
    maxWidth: options.maxWidth ?? options.max_width,
    maxHeight: options.maxHeight ?? options.max_height,
    customImageData: options.customImageData ?? options.custom_image_data,
  };
  if (isTauri) {
    return await invoke<string>('export_photo', { photoId, options: payload });
  }
  return targetPath;
}

export async function apiExportCollage(imageDataBase64: string, targetPath: string): Promise<string> {
  if (isTauri) {
    return await invoke<string>('export_collage', { imageDataBase64, targetPath });
  }
  return targetPath;
}
