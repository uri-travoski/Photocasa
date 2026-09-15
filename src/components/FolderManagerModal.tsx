import React, { useState } from 'react';
import { Folder, FolderPlus, Trash2, RefreshCw, X, ShieldCheck, HardDrive } from 'lucide-react';
import type { WatchedFolder } from '../types';
import { isTauri } from '../utils/api';
import { open } from '@tauri-apps/plugin-dialog';

interface FolderManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: WatchedFolder[];
  onAddFolder: (path: string, scanMode: 'always' | 'once') => void;
  onRemoveFolder: (folderId: number) => void;
  onRescanFolder: (folderId: number) => void;
}

export const FolderManagerModal: React.FC<FolderManagerModalProps> = ({
  isOpen,
  onClose,
  folders,
  onAddFolder,
  onRemoveFolder,
  onRescanFolder,
}) => {
  const [customPath, setCustomPath] = useState('');
  const [scanMode, setScanMode] = useState<'always' | 'once'>('always');

  if (!isOpen) return null;

  const handlePickDirectory = async () => {
    if (isTauri) {
      try {
        const selected = await open({
          directory: true,
          multiple: false,
          title: 'Select Photo Folder to Watch',
        });
        if (selected && typeof selected === 'string') {
          onAddFolder(selected, scanMode);
        }
      } catch (err) {
        console.error('Failed to open directory dialog', err);
      }
    } else {
      // Mock / browser fallback
      const path = prompt('Enter absolute folder path to watch (e.g. /home/user/Pictures/Summer):');
      if (path && path.trim()) {
        onAddFolder(path.trim(), scanMode);
      }
    }
  };

  const handleManualAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (customPath.trim()) {
      onAddFolder(customPath.trim(), scanMode);
      setCustomPath('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white border border-[#dcdcdc] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] text-[#2e3436]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#e0e2e6] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#fff0e6] text-[#e65100] border border-[#e65100]/30">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-[#2e3436]">Watched Folder Manager</h3>
              <p className="text-[11px] text-[#6c7178]">Configure folders monitored for photos</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[#f0f2f5] text-[#6c7178] hover:text-[#2e3436] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Reassurance Banner */}
        <div className="bg-[#fff8f0] border-b border-[#ffe0b2] px-5 py-2.5 flex items-center gap-2 text-xs text-[#bf360c]">
          <ShieldCheck className="w-4 h-4 shrink-0 text-[#e65100]" />
          <span>
            <strong>100% Non-destructive:</strong> Photocasa indexes your photos without moving, copying, or modifying originals.
          </span>
        </div>

        {/* Content & List */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* Add Folder Buttons & Mode */}
          <div className="bg-[#f8f9fa] p-3.5 rounded-lg border border-[#e0e2e6] space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#2e3436]">Add New Folder</span>
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer text-[#4a5056]">
                  <input
                    type="radio"
                    name="scanMode"
                    value="always"
                    checked={scanMode === 'always'}
                    onChange={() => setScanMode('always')}
                    className="accent-[#e65100]"
                  />
                  <span>Scan Always</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-[#4a5056]">
                  <input
                    type="radio"
                    name="scanMode"
                    value="once"
                    checked={scanMode === 'once'}
                    onChange={() => setScanMode('once')}
                    className="accent-[#e65100]"
                  />
                  <span>Scan Once</span>
                </label>
              </div>
            </div>

            <button
              onClick={handlePickDirectory}
              className="w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-[#ff7710] to-[#e65100] hover:from-[#f06700] hover:to-[#d84315] text-white font-medium text-xs flex items-center justify-center gap-2 shadow-md shadow-[#e65100]/20 transition-all active:scale-[0.99]"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Browse & Select Folder</span>
            </button>

            {/* Manual Path Input */}
            <form onSubmit={handleManualAdd} className="flex gap-2">
              <input
                type="text"
                value={customPath}
                onChange={(e) => setCustomPath(e.target.value)}
                placeholder="Or paste folder path here (/path/to/photos)..."
                className="flex-1 bg-white border border-[#dcdcdc] text-xs text-[#2e3436] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#e65100] placeholder:text-[#9ea4ac]"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 rounded-lg bg-[#f0f2f5] hover:bg-[#e4e6eb] text-xs font-medium text-[#2e3436] border border-[#dcdcdc] transition-colors"
              >
                Add
              </button>
            </form>
          </div>

          {/* Current Watched Folders List */}
          <div className="space-y-2">
            <span className="text-xs font-semibold text-[#6c7178]">
              Active Folders ({folders.length})
            </span>

            {folders.length === 0 ? (
              <p className="text-xs text-[#8a9199] italic py-4 text-center">
                No folders currently added.
              </p>
            ) : (
              folders.map((folder) => (
                <div
                  key={folder.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-white border border-[#e0e2e6] hover:border-[#dcdcdc] shadow-xs text-xs"
                >
                  <div className="flex items-center gap-2.5 truncate pr-2">
                    <Folder className="w-4 h-4 text-[#e65100] shrink-0" />
                    <div className="truncate">
                      <p className="font-medium text-[#2e3436] truncate" title={folder.path}>
                        {folder.path}
                      </p>
                      <p className="text-[10px] text-[#6c7178]">
                        {folder.photo_count ?? 0} photos indexed • Mode: {folder.scan_mode === 'always' ? 'Watch background changes' : 'Scan once'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => onRescanFolder(folder.id)}
                      title="Rescan Folder"
                      className="p-1.5 rounded hover:bg-[#f0f2f5] text-[#6c7178] hover:text-[#2e3436] transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onRemoveFolder(folder.id)}
                      title="Remove Folder from Photocasa"
                      className="p-1.5 rounded hover:bg-red-50 text-[#6c7178] hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#e0e2e6] flex justify-end bg-[#f8f9fa]">
          <button
            onClick={onClose}
            className="px-5 py-1.5 rounded-lg bg-[#e65100] hover:bg-[#d84315] text-xs font-medium text-white shadow-sm shadow-[#e65100]/20 transition-all active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
