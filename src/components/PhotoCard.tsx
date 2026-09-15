import React, { useState, useEffect } from 'react';
import { Star, Check, Maximize2, Sliders } from 'lucide-react';
import type { Photo } from '../types';
import { getPhotoSrc, apiGetPhotoDataUrl } from '../utils/api';
import { formatDate } from '../utils/formatters';
import { isPhotoEdited } from '../utils/canvasRenderer';

interface PhotoCardProps {
  photo: Photo;
  isSelected: boolean;
  onToggleSelect: (photoId: number) => void;
  onToggleFavorite: (photoId: number) => void;
  onOpenViewer: (photo: Photo) => void;
  onOpenEditor: (photo: Photo) => void;
  thumbnailSize: number;
}

export const PhotoCard: React.FC<PhotoCardProps> = ({
  photo,
  isSelected,
  onToggleSelect,
  onToggleFavorite,
  onOpenViewer,
  onOpenEditor,
  thumbnailSize,
}) => {
  const [imgSrc, setImgSrc] = useState<string>(getPhotoSrc(photo));

  useEffect(() => {
    setImgSrc(getPhotoSrc(photo));
  }, [photo]);

  const handleImageError = async () => {
    try {
      const dataUrl = await apiGetPhotoDataUrl(photo.id);
      if (dataUrl) setImgSrc(dataUrl);
    } catch {
      // ignore
    }
  };

  return (
    <div
      style={{ width: `${thumbnailSize}px`, height: `${thumbnailSize}px` }}
      onClick={() => onToggleSelect(photo.id)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpenViewer(photo);
      }}
      className={`group relative rounded-lg overflow-hidden bg-[#f4f5f7] border cursor-pointer select-none transition-all duration-150 ${
        isSelected
          ? 'ring-2 ring-[#e65100] border-[#e65100] shadow-md shadow-[#e65100]/20'
          : 'border-[#d8dbe0] hover:border-[#e65100] hover:shadow-md'
      }`}
    >
      {/* Thumbnail Image */}
      <img
        src={imgSrc}
        alt={photo.filename}
        loading="lazy"
        decoding="async"
        onError={handleImageError}
        className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
      />

      {/* Top Overlay Bar */}
      <div className="absolute top-0 left-0 right-0 p-1.5 flex items-center justify-between bg-gradient-to-b from-black/65 via-black/25 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Selection Checkbox */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(photo.id);
          }}
          className={`w-5 h-5 rounded flex items-center justify-center transition-all ${
            isSelected
              ? 'bg-[#e65100] text-white'
              : 'bg-black/50 border border-white/40 hover:bg-black/80 text-transparent hover:text-white/60'
          }`}
        >
          <Check className="w-3.5 h-3.5" />
        </button>

        {/* Favorite Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(photo.id);
          }}
          title={photo.is_favorite ? 'Remove Star' : 'Star Photo'}
          className="p-1 rounded-full hover:bg-black/40 text-[#e65100] transition-transform active:scale-125"
        >
          <Star
            className={`w-4 h-4 ${photo.is_favorite ? 'fill-[#e65100]' : 'stroke-white/80 fill-transparent'}`}
          />
        </button>
      </div>

      {/* Selected Indicator Badge (Always visible if selected) */}
      {isSelected && (
        <div className="absolute top-1.5 left-1.5 w-5 h-5 rounded bg-[#e65100] text-white flex items-center justify-center shadow-sm z-10">
          <Check className="w-3.5 h-3.5" />
        </div>
      )}

      {/* Edited Badge (Always visible if photo has adjustments) */}
      {isPhotoEdited(photo) && (
        <div
          className={`absolute top-1.5 z-10 pointer-events-none transition-all duration-150 ${
            isSelected ? 'left-8' : 'left-1.5 group-hover:left-8'
          }`}
        >
          <span className="bg-[#fff0e6]/95 backdrop-blur-xs text-[#e65100] border border-[#e65100]/60 text-[9px] font-bold px-1.5 py-0.5 rounded shadow-xs tracking-wider uppercase flex items-center gap-1">
            Edited
          </span>
        </div>
      )}

      {/* Favorite Star (Always visible if favorited and not selected) */}
      {photo.is_favorite && !isSelected && (
        <div className="absolute top-1.5 right-1.5 p-1 text-[#e65100] drop-shadow">
          <Star className="w-4 h-4 fill-[#e65100]" />
        </div>
      )}

      {/* Bottom Overlay Info & Quick Actions */}
      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between">
        <div className="truncate pr-2">
          <p className="text-[11.5px] font-medium text-white truncate drop-shadow-sm">{photo.filename}</p>
          <p className="text-[10.5px] text-zinc-300 drop-shadow-sm">
            {formatDate(photo.date_taken)} • {photo.width}×{photo.height}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenEditor(photo);
            }}
            title="Edit Photo"
            className="p-1.5 rounded-md bg-black/60 hover:bg-[#e65100] text-white transition-colors"
          >
            <Sliders className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenViewer(photo);
            }}
            title="View Fullscreen"
            className="p-1.5 rounded-md bg-black/60 hover:bg-[#e65100] text-white transition-colors"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};
