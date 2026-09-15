import React, { useMemo } from 'react';
import type { Photo, PhotoGroup } from '../types';
import { PhotoCard } from './PhotoCard';
import { formatDate } from '../utils/formatters';
import { CheckSquare, Calendar, ImageOff } from 'lucide-react';

interface PhotoGridProps {
  photos: Photo[];
  selectedIds: Set<number>;
  onToggleSelect: (photoId: number) => void;
  onSelectMultiple: (photoIds: number[]) => void;
  onToggleFavorite: (photoId: number) => void;
  onOpenViewer: (photo: Photo) => void;
  onOpenEditor: (photo: Photo) => void;
  thumbnailSize: number;
  onOpenFolderManager: () => void;
}

export const PhotoGrid: React.FC<PhotoGridProps> = ({
  photos,
  selectedIds,
  onToggleSelect,
  onSelectMultiple,
  onToggleFavorite,
  onOpenViewer,
  onOpenEditor,
  thumbnailSize,
  onOpenFolderManager,
}) => {
  // Group photos chronologically by date
  const groups = useMemo<PhotoGroup[]>(() => {
    const map = new Map<string, Photo[]>();

    for (const photo of photos) {
      const dateKey = photo.date_taken.slice(0, 10); // "YYYY-MM-DD"
      if (!map.has(dateKey)) {
        map.set(dateKey, []);
      }
      map.get(dateKey)!.push(photo);
    }

    const result: PhotoGroup[] = [];
    for (const [dateKey, groupPhotos] of map.entries()) {
      result.push({
        dateKey,
        displayDate: formatDate(dateKey),
        photos: groupPhotos,
      });
    }

    // Sort newest date first
    result.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
    return result;
  }, [photos]);

  if (photos.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-white border border-[#dcdcdc] flex items-center justify-center text-[#8a9199] mb-4 shadow-sm">
          <ImageOff className="w-8 h-8" />
        </div>
        <h3 className="text-base font-semibold text-[#2e3436]">No photos found</h3>
        <p className="text-xs text-[#5e656d] max-w-sm mt-1 mb-4">
          Add folders to watch, or adjust your search and filter criteria. Photocasa never alters your original files.
        </p>
        <button
          onClick={onOpenFolderManager}
          className="px-4 py-2 rounded-lg bg-[#e65100] hover:bg-[#d84315] text-white text-xs font-semibold shadow-md shadow-[#e65100]/20 transition-all active:scale-95"
        >
          Add Watched Folder
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      {groups.map((group) => {
        const allGroupSelected = group.photos.every((p) => selectedIds.has(p.id));
        const handleSelectGroup = () => {
          if (allGroupSelected) {
            // Deselect group
            const next = group.photos.map((p) => p.id);
            onSelectMultiple(next);
          } else {
            // Select all in group
            const next = group.photos.map((p) => p.id);
            onSelectMultiple(next);
          }
        };

        return (
          <section key={group.dateKey} className="space-y-3 cv-auto">
            {/* Sticky Group Header */}
            <div className="sticky top-0 z-10 py-1.5 px-3 rounded-lg bg-white/90 backdrop-blur-md border border-[#dcdcdc] flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-[#e65100]" />
                <h2 className="text-xs font-semibold text-[#2e3436]">{group.displayDate}</h2>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[#f0f2f5] text-[#5e656d] border border-[#dcdcdc]">
                  {group.photos.length} {group.photos.length === 1 ? 'photo' : 'photos'}
                </span>
              </div>

              <button
                onClick={handleSelectGroup}
                className="flex items-center gap-1 text-[11px] text-[#5e656d] hover:text-[#e65100] transition-colors"
              >
                <CheckSquare className="w-3 h-3" />
                <span>{allGroupSelected ? 'Deselect date' : 'Select date'}</span>
              </button>
            </div>

            {/* Photo Cards Grid */}
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${thumbnailSize}px, 1fr))`,
              }}
            >
              {group.photos.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  isSelected={selectedIds.has(photo.id)}
                  onToggleSelect={onToggleSelect}
                  onToggleFavorite={onToggleFavorite}
                  onOpenViewer={onOpenViewer}
                  onOpenEditor={onOpenEditor}
                  thumbnailSize={thumbnailSize}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
};
