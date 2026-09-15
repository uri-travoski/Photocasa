import { ZoomIn, ZoomOut, Sparkles, X, CheckSquare } from 'lucide-react';

interface BottomBarProps {
  totalCount: number;
  selectedCount: number;
  onClearSelection: () => void;
  onSelectAll: () => void;
  thumbnailSize: number;
  onZoomChange: (size: number) => void;
  onOpenCollage: () => void;
}

export const BottomBar: React.FC<BottomBarProps> = ({
  totalCount,
  selectedCount,
  onClearSelection,
  onSelectAll,
  thumbnailSize,
  onZoomChange,
  onOpenCollage,
}) => {
  return (
    <footer className="h-11 bg-[#fcfcfd] border-t border-[#dcdcdc] px-4 flex items-center justify-between shrink-0 select-none text-xs z-20 text-[#4a5056]">
      {/* Left Selection Controls */}
      <div className="flex items-center gap-3">
        {selectedCount > 0 ? (
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#e65100] bg-[#fff0e6] px-2 py-0.5 rounded border border-[#e65100]/30">
              {selectedCount} selected
            </span>
            <button
              onClick={onClearSelection}
              className="flex items-center gap-1 text-[#5e656d] hover:text-[#2e3436] px-1.5 py-0.5 rounded hover:bg-[#ebecef] transition-colors"
            >
              <X className="w-3 h-3" />
              <span>Clear</span>
            </button>
            <button
              onClick={onOpenCollage}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#e65100] hover:bg-[#d84315] text-white font-medium shadow-sm shadow-[#e65100]/20 transition-all active:scale-95"
            >
              <Sparkles className="w-3 h-3 text-orange-200" />
              <span>Create Collage</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-[#6c7178]">
            <span>{totalCount} {totalCount === 1 ? 'photo' : 'photos'} in library</span>
            <button
              onClick={onSelectAll}
              className="flex items-center gap-1 text-[#5e656d] hover:text-[#e65100] px-1.5 py-0.5 rounded hover:bg-[#ebecef] transition-colors"
            >
              <CheckSquare className="w-3 h-3" />
              <span>Select all</span>
            </button>
          </div>
        )}
      </div>

      {/* Right: Picasa Zoom Slider */}
      <div className="flex items-center gap-2.5 text-[#6c7178]">
        <ZoomOut className="w-3.5 h-3.5" />
        <input
          type="range"
          min={120}
          max={380}
          step={10}
          value={thumbnailSize}
          onChange={(e) => onZoomChange(Number(e.target.value))}
          className="w-28 h-1.5 bg-[#e2e4e8] rounded-lg appearance-none cursor-pointer accent-[#e65100]"
          title="Thumbnail Size"
        />
        <ZoomIn className="w-3.5 h-3.5" />
      </div>
    </footer>
  );
};
