import React from 'react';
import { FolderPlus, RefreshCw, Sparkles, Search } from 'lucide-react';
import type { ScanProgress } from '../types';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenFolderManager: () => void;
  onRescanAll: () => void;
  onOpenCollage: () => void;
  selectedCount: number;
  scanProgress?: ScanProgress | null;
}

export const Header: React.FC<HeaderProps> = ({
  searchQuery,
  onSearchChange,
  onOpenFolderManager,
  onRescanAll,
  onOpenCollage,
  selectedCount,
  scanProgress,
}) => {
  return (
    <header className="h-14 bg-[#f6f6f7] border-b border-[#dcdcdc] px-4 flex items-center justify-between shrink-0 select-none z-20 shadow-xs">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center shadow-sm border border-[#e0e0e0] bg-white p-0.5">
          <img src="/icon.png" alt="Photocasa" className="w-full h-full object-contain" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold text-base tracking-tight text-[#2e3436] flex items-center gap-1.5 font-['Ubuntu']">
            Photocasa
            <span className="text-[11px] uppercase font-bold px-1.5 py-0.2 rounded bg-[#fff0e6] text-[#e65100] border border-[#ffccaa]">
              Local
            </span>
          </span>
          <span className="text-[11.5px] text-[#5e6369] -mt-0.5">Photo Library & Collage Studio</span>
        </div>
      </div>

      {/* Center Search Bar */}
      <div className="flex-1 max-w-md mx-6">
        <div className="relative flex items-center">
          <Search className="w-4 h-4 text-[#888e96] absolute left-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search photos by filename, camera, or folder..."
            className="w-full bg-white border border-[#d0d3da] text-sm text-[#2e3436] rounded-md pl-9 pr-4 py-1.5 focus:outline-none focus:border-[#e65100] focus:ring-2 focus:ring-[#e65100]/20 transition-all placeholder:text-[#888e96] shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-3 text-xs text-[#888e96] hover:text-[#2e3436]"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {scanProgress && scanProgress.status !== 'complete' && (
          <div className="flex items-center gap-2 mr-3 px-2.5 py-1 rounded bg-[#fff3e0] border border-[#ffcc80] text-xs text-[#e65100] font-medium animate-pulse">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            <span>Scanning... ({scanProgress.current}/{scanProgress.total})</span>
          </div>
        )}

        <button
          onClick={onRescanAll}
          title="Rescan Watched Folders"
          className="p-2 rounded-md bg-white hover:bg-[#f0f1f4] text-[#4a5056] hover:text-[#2e3436] border border-[#d0d3da] shadow-2xs transition-all active:bg-[#e4e6ea]"
        >
          <RefreshCw className="w-4 h-4" />
        </button>

        <button
          onClick={onOpenFolderManager}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white hover:bg-[#f0f1f4] text-[#2e3436] text-xs font-medium border border-[#d0d3da] shadow-2xs transition-all active:bg-[#e4e6ea]"
        >
          <FolderPlus className="w-3.5 h-3.5 text-[#e65100]" />
          <span>Watched Folders</span>
        </button>

        <button
          onClick={onOpenCollage}
          className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold shadow-xs transition-all ${
            selectedCount > 0
              ? 'bg-[#e65100] hover:bg-[#bf360c] text-white shadow-[#e65100]/30 animate-pulse active:scale-98'
              : 'bg-white hover:bg-[#f0f1f4] text-[#2e3436] border border-[#d0d3da]'
          }`}
        >
          <Sparkles className={`w-3.5 h-3.5 ${selectedCount > 0 ? 'text-[#ffcc80]' : 'text-[#e65100]'}`} />
          <span>Collage Studio {selectedCount > 0 && `(${selectedCount})`}</span>
        </button>
      </div>
    </header>
  );
};
