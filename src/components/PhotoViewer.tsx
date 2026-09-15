import React, { useEffect, useState, useRef } from 'react';
import { 
  X, ChevronLeft, ChevronRight, Star, RotateCw, RotateCcw, 
  ZoomIn, ZoomOut, Info, Sliders, Download
} from 'lucide-react';
import type { Photo } from '../types';
import { getPhotoSrc, apiGetPhotoDataUrl, apiRotatePhoto } from '../utils/api';
import { formatDate, formatDateTime, formatBytes, formatAperture, formatExposure, formatFocalLength } from '../utils/formatters';
import { isPhotoEdited, renderAdjustedCanvas, computeNewOrientation } from '../utils/canvasRenderer';

interface PhotoViewerProps {
  photo: Photo;
  photos: Photo[];
  onClose: () => void;
  onOpenEditor: (photo: Photo) => void;
  onToggleFavorite: (photoId: number) => void;
  onExportPhoto: (photo: Photo, customImageDataUrl?: string) => void;
  onPhotoUpdated?: (photo: Photo) => void;
}

export const PhotoViewer: React.FC<PhotoViewerProps> = ({
  photo,
  photos,
  onClose,
  onOpenEditor,
  onToggleFavorite,
  onExportPhoto,
  onPhotoUpdated,
}) => {
  const [activePhoto, setActivePhoto] = useState<Photo>(photo);
  const currentIndex = photos.findIndex((p) => p.id === activePhoto.id);
  const [mainImgSrc, setMainImgSrc] = useState<string>(getPhotoSrc(photo, true));
  const [zoom, setZoom] = useState<number>(1);
  const [showInfo, setShowInfo] = useState<boolean>(false);
  const [rotation, setRotation] = useState<number>(0);
  const [pendingRotation, setPendingRotation] = useState<number>(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filmstripRef = useRef<HTMLDivElement>(null);

  const isEdited = isPhotoEdited(activePhoto);

  useEffect(() => {
    setActivePhoto(photo);
    setMainImgSrc(getPhotoSrc(photo, true));
    setZoom(1);
    setRotation(0);
    setPendingRotation(0);
  }, [photo]);

  // Update image source whenever activePhoto changes
  useEffect(() => {
    setMainImgSrc(getPhotoSrc(activePhoto, true));
  }, [activePhoto]);

  // Scroll active thumbnail into view in filmstrip
  useEffect(() => {
    if (filmstripRef.current) {
      const activeBtn = filmstripRef.current.querySelector('[data-active="true"]');
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      }
    }
  }, [activePhoto.id]);

  // Render adjusted canvas when activePhoto has edits
  useEffect(() => {
    if (!isEdited) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = getPhotoSrc(activePhoto, true);
    img.onload = () => {
      if (canvasRef.current) {
        renderAdjustedCanvas(canvasRef.current, img, activePhoto.adjustments, undefined, undefined, null, null, true);
      }
    };
  }, [activePhoto, isEdited]);

  const handleMainError = async () => {
    try {
      const dataUrl = await apiGetPhotoDataUrl(activePhoto.id, true);
      if (dataUrl) setMainImgSrc(dataUrl);
    } catch {
      // ignore
    }
  };

  const handleRotate = (delta: number) => {
    setRotation((r) => (r + delta + 360) % 360);
    setPendingRotation((r) => (r + delta + 360) % 360);
  };

  const commitPendingRotation = async (targetPhoto: Photo, rotDelta: number) => {
    if (rotDelta % 360 === 0) return;
    const newOrientation = computeNewOrientation(targetPhoto.orientation, rotDelta);
    try {
      const updated = await apiRotatePhoto(targetPhoto.id, newOrientation);
      if (updated) {
        if (onPhotoUpdated) onPhotoUpdated(updated);
        setActivePhoto(updated);
      }
    } catch (e) {
      console.error('Failed to rotate photo:', e);
    }
  };

  const handleClose = async () => {
    if (pendingRotation % 360 !== 0) {
      await commitPendingRotation(activePhoto, pendingRotation);
    }
    onClose();
  };

  const handleNext = async () => {
    if (photos.length === 0) return;
    if (pendingRotation % 360 !== 0) {
      await commitPendingRotation(activePhoto, pendingRotation);
    }
    const nextIdx = (currentIndex + 1) % photos.length;
    setActivePhoto(photos[nextIdx]);
    setZoom(1);
    setRotation(0);
    setPendingRotation(0);
  };

  const handlePrev = async () => {
    if (photos.length === 0) return;
    if (pendingRotation % 360 !== 0) {
      await commitPendingRotation(activePhoto, pendingRotation);
    }
    const prevIdx = (currentIndex - 1 + photos.length) % photos.length;
    setActivePhoto(photos[prevIdx]);
    setZoom(1);
    setRotation(0);
    setPendingRotation(0);
  };

  const handleOpenEditor = async () => {
    if (pendingRotation % 360 !== 0) {
      await commitPendingRotation(activePhoto, pendingRotation);
    }
    onOpenEditor(activePhoto);
  };

  const handleExport = () => {
    let customDataUrl: string | undefined = undefined;
    if (isEdited && canvasRef.current) {
      customDataUrl = canvasRef.current.toDataURL('image/jpeg', 0.95);
    }
    onExportPhoto(activePhoto, customDataUrl);
  };

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'ArrowRight' || e.key === ' ') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === '*' || e.key === 'f') {
        onToggleFavorite(activePhoto.id);
        setActivePhoto((prev) => ({ ...prev, is_favorite: !prev.is_favorite }));
      } else if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleRotate(90);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activePhoto, photos, pendingRotation]);

  const toggleZoom100 = () => {
    setZoom((z) => (z === 1 ? 2.5 : 1));
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#18191e] flex flex-col select-none animate-in fade-in duration-200">
      {/* Top Navigation Bar */}
      <header className="h-12 px-4 bg-white/95 backdrop-blur-md border-b border-[#dcdcdc] flex items-center justify-between text-xs z-20 text-[#2e3436]">
        <div className="flex items-center gap-3">
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg bg-[#f0f2f5] hover:bg-[#e4e6eb] text-[#2e3436] border border-[#dcdcdc] transition-colors"
            title="Back to Library (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex flex-col">
            <span className="font-semibold text-[#2e3436] truncate max-w-xs">{activePhoto.filename}</span>
            <span className="text-[10px] text-[#6c7178]">
              {currentIndex + 1} of {photos.length} • {formatDate(activePhoto.date_taken)}
            </span>
          </div>
        </div>

        {/* Center Viewer Controls */}
        <div className="flex items-center gap-1 bg-[#f0f2f5] p-1 rounded-lg border border-[#dcdcdc]">
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
            className="p-1.5 rounded hover:bg-[#e4e6eb] text-[#4a5056] hover:text-[#2e3436] transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={toggleZoom100}
            className="px-2 py-1 rounded hover:bg-[#e4e6eb] text-[#4a5056] hover:text-[#2e3436] text-[11px] font-mono transition-colors"
            title="Toggle 100% Zoom"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            onClick={() => setZoom((z) => Math.min(4, z + 0.25))}
            className="p-1.5 rounded hover:bg-[#e4e6eb] text-[#4a5056] hover:text-[#2e3436] transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-[#dcdcdc] mx-1" />
          <button
            onClick={() => handleRotate(-90)}
            className="p-1.5 rounded hover:bg-[#e4e6eb] text-[#4a5056] hover:text-[#2e3436] transition-colors"
            title="Rotate Left (-90°)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleRotate(90)}
            className="p-1.5 rounded hover:bg-[#e4e6eb] text-[#4a5056] hover:text-[#2e3436] transition-colors"
            title="Rotate Right (+90°, Ctrl+R)"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onToggleFavorite(activePhoto.id);
              setActivePhoto((prev) => ({ ...prev, is_favorite: !prev.is_favorite }));
            }}
            className={`p-2 rounded-lg border transition-all ${
              activePhoto.is_favorite
                ? 'bg-[#fff0e6] border-[#e65100] text-[#e65100]'
                : 'bg-[#f0f2f5] border-[#dcdcdc] text-[#4a5056] hover:bg-[#e4e6eb]'
            }`}
            title="Star Photo (*)"
          >
            <Star className={`w-4 h-4 ${activePhoto.is_favorite ? 'fill-[#e65100] text-[#e65100]' : ''}`} />
          </button>

          <button
            onClick={handleExport}
            className="p-2 rounded-lg bg-[#f0f2f5] hover:bg-[#e4e6eb] border border-[#dcdcdc] text-[#4a5056] hover:text-[#2e3436] transition-colors"
            title="Export Photo"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowInfo(!showInfo)}
            className={`p-2 rounded-lg border transition-all ${
              showInfo ? 'bg-[#fff0e6] border-[#e65100] text-[#e65100]' : 'bg-[#f0f2f5] border-[#dcdcdc] text-[#4a5056] hover:bg-[#e4e6eb]'
            }`}
            title="Photo Info & EXIF"
          >
            <Info className="w-4 h-4" />
          </button>

          <button
            onClick={handleOpenEditor}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-[#ff7710] to-[#e65100] hover:from-[#f06700] hover:to-[#d84315] text-white font-semibold text-xs shadow-md shadow-[#e65100]/20 transition-all active:scale-95"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Edit Photo</span>
          </button>
        </div>
      </header>

      {/* Main View Area with Image & Navigation Chevrons */}
      <div className="flex-1 relative flex overflow-hidden items-center justify-center">
        {/* Previous Button */}
        <button
          onClick={handlePrev}
          className="absolute left-4 z-10 w-10 h-10 rounded-full bg-white/80 hover:bg-white text-[#2e3436] flex items-center justify-center transition-all border border-[#dcdcdc] shadow-md hover:scale-105 active:scale-95"
          title="Previous Photo (Left Arrow)"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Next Button */}
        <button
          onClick={handleNext}
          className="absolute right-4 z-10 w-10 h-10 rounded-full bg-white/80 hover:bg-white text-[#2e3436] flex items-center justify-center transition-all border border-[#dcdcdc] shadow-md hover:scale-105 active:scale-95"
          title="Next Photo (Right Arrow / Space)"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        {/* Center Image Canvas / Image */}
        <div 
          className="w-full h-full flex items-center justify-center p-4 overflow-hidden cursor-zoom-in"
          onClick={toggleZoom100}
        >
          {isEdited ? (
            <canvas
              ref={canvasRef}
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transition: zoom === 1 ? 'transform 0.15s ease-out' : 'none',
                maxWidth: zoom === 1 ? '100%' : 'none',
                maxHeight: zoom === 1 ? '100%' : 'none',
              }}
              className="object-contain shadow-2xl drop-shadow-[0_20px_35px_rgba(0,0,0,0.6)]"
            />
          ) : (
            <img
              src={mainImgSrc}
              alt={activePhoto.filename}
              onError={handleMainError}
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transition: zoom === 1 ? 'transform 0.15s ease-out' : 'none',
                maxWidth: zoom === 1 ? '100%' : 'none',
                maxHeight: zoom === 1 ? '100%' : 'none',
              }}
              className="object-contain shadow-2xl drop-shadow-[0_20px_35px_rgba(0,0,0,0.6)]"
            />
          )}
        </div>

        {/* EXIF Information Sidebar */}
        {showInfo && (
          <aside className="absolute right-0 top-0 bottom-0 w-72 bg-white/95 backdrop-blur-xl border-l border-[#dcdcdc] p-4 text-xs overflow-y-auto space-y-4 shadow-2xl z-20 animate-in slide-in-from-right duration-200 text-[#2e3436]">
            <div className="flex items-center justify-between border-b border-[#e0e2e6] pb-3">
              <h4 className="font-semibold text-sm text-[#2e3436]">Photo Details</h4>
              <button
                onClick={() => setShowInfo(false)}
                className="p-1 rounded hover:bg-[#f0f2f5] text-[#6c7178] hover:text-[#2e3436] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#6c7178]">File Information</span>
                <div className="mt-1 space-y-1 bg-[#f8f9fa] p-2.5 rounded-lg border border-[#e0e2e6]">
                  <p className="font-medium text-[#2e3436] truncate" title={activePhoto.filename}>{activePhoto.filename}</p>
                  <p className="text-[#6c7178]">{activePhoto.width} × {activePhoto.height} px</p>
                  <p className="text-[#6c7178]">{formatBytes(activePhoto.file_size)}</p>
                  <p className="text-[#6c7178] text-[10px] break-all">{activePhoto.path}</p>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-[#6c7178]">Camera & Settings</span>
                <div className="mt-1 space-y-1.5 bg-[#f8f9fa] p-2.5 rounded-lg border border-[#e0e2e6]">
                  <div className="flex justify-between">
                    <span className="text-[#6c7178]">Camera</span>
                    <span className="text-[#2e3436] font-medium">{activePhoto.camera_make || 'Unknown'} {activePhoto.camera_model}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6c7178]">Focal Length</span>
                    <span className="text-[#2e3436]">{formatFocalLength(activePhoto.focal_length) || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6c7178]">Aperture</span>
                    <span className="text-[#2e3436]">{formatAperture(activePhoto.f_number) || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6c7178]">Exposure</span>
                    <span className="text-[#2e3436]">{formatExposure(activePhoto.exposure_time) || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6c7178]">ISO</span>
                    <span className="text-[#2e3436]">{activePhoto.iso || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#6c7178]">Date Taken</span>
                    <span className="text-[#2e3436]">{formatDateTime(activePhoto.date_taken)}</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Bottom Filmstrip Thumbnails */}
      <footer 
        ref={filmstripRef}
        className="h-16 bg-white/95 backdrop-blur border-t border-[#dcdcdc] px-3 flex items-center gap-2 overflow-x-auto shrink-0 z-20"
      >
        {photos.map((p) => {
          const isActive = p.id === activePhoto.id;
          return (
            <button
              key={p.id}
              data-active={isActive}
              onClick={async () => {
                if (pendingRotation % 360 !== 0) {
                  await commitPendingRotation(activePhoto, pendingRotation);
                }
                setActivePhoto(p);
                setZoom(1);
                setRotation(0);
                setPendingRotation(0);
              }}
              className={`h-12 w-12 shrink-0 rounded-md overflow-hidden border-2 transition-all ${
                isActive
                  ? 'border-[#e65100] scale-105 shadow-md shadow-[#e65100]/20'
                  : 'border-transparent opacity-60 hover:opacity-100 hover:border-[#b0b4b8]'
              }`}
            >
              <img
                src={getPhotoSrc(p)}
                alt={p.filename}
                className="w-full h-full object-cover"
              />
            </button>
          );
        })}
      </footer>
    </div>
  );
};
