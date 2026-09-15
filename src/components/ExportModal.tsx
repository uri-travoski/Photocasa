import React, { useState } from 'react';
import { Download, X } from 'lucide-react';
import type { Photo } from '../types';
import { apiExportPhoto, isTauri } from '../utils/api';
import { save } from '@tauri-apps/plugin-dialog';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  photo: Photo | null;
  customImageDataUrl?: string | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  photo,
  customImageDataUrl,
}) => {
  const [format, setFormat] = useState<'jpeg' | 'png' | 'webp'>('jpeg');
  const [quality, setQuality] = useState<number>(90);
  const [sizePreset, setSizePreset] = useState<'original' | '4k' | '2k' | '1080p'>('original');
  const [isExporting, setIsExporting] = useState<boolean>(false);

  if (!isOpen || !photo) return null;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      let max_width: number | undefined = undefined;
      let max_height: number | undefined = undefined;

      if (sizePreset === '4k') {
        max_width = 3840;
        max_height = 2160;
      } else if (sizePreset === '2k') {
        max_width = 2048;
        max_height = 2048;
      } else if (sizePreset === '1080p') {
        max_width = 1920;
        max_height = 1080;
      }

      const defaultName = photo.filename.replace(/\.[^/.]+$/, '') + `_edited.${format}`;
      let targetPath: string | null = null;

      if (isTauri) {
        targetPath = await save({
          defaultPath: defaultName,
          filters: [{ name: `${format.toUpperCase()} Image`, extensions: [format] }],
        });
      } else {
        targetPath = `/mock/export/${defaultName}`;
      }

      if (targetPath) {
        await apiExportPhoto(photo.id, {
          targetPath,
          format,
          quality,
          maxWidth: max_width,
          maxHeight: max_height,
          customImageData: customImageDataUrl || undefined,
        });
        alert(`Photo exported successfully to:\n${targetPath}`);
        onClose();
      }
    } catch (err) {
      console.error('Failed to export photo', err);
      alert('Error exporting photo: ' + String(err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white border border-[#dcdcdc] rounded-xl shadow-2xl overflow-hidden flex flex-col text-xs text-[#2e3436]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#e0e2e6] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#fff0e6] text-[#e65100] border border-[#e65100]/30">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-[#2e3436]">Export Photo</h3>
              <p className="text-[11px] text-[#6c7178]">{photo.filename}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-[#f0f2f5] text-[#6c7178] hover:text-[#2e3436] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Options */}
        <div className="p-5 space-y-4">
          {/* Format */}
          <div className="space-y-1.5">
            <span className="font-semibold text-[#2e3436]">File Format</span>
            <div className="grid grid-cols-3 gap-2">
              {(['jpeg', 'png', 'webp'] as const).map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => setFormat(fmt)}
                  className={`py-2 rounded-lg font-medium uppercase border transition-colors ${
                    format === fmt
                      ? 'bg-[#fff0e6] border-[#e65100] text-[#e65100] font-semibold shadow-xs'
                      : 'bg-[#f8f9fa] border-[#e0e2e6] text-[#4a5056] hover:bg-[#f0f2f5]'
                  }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          {/* Quality (for JPEG / WebP) */}
          {format !== 'png' && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[#2e3436]">
                <span>Quality</span>
                <span className="font-mono text-[#6c7178]">{quality}%</span>
              </div>
              <input
                type="range"
                min={20}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full h-1.5 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
              />
            </div>
          )}

          {/* Resolution Size Preset */}
          <div className="space-y-1.5">
            <span className="font-semibold text-[#2e3436]">Resolution</span>
            <div className="grid grid-cols-2 gap-2">
              {[
                { id: 'original', label: `Original (${photo.width}×${photo.height})` },
                { id: '4k', label: '4K Ultra HD (3840px)' },
                { id: '2k', label: 'Web Optimized (2048px)' },
                { id: '1080p', label: '1080p Full HD (1920px)' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSizePreset(item.id as any)}
                  className={`p-2 rounded-lg text-left border transition-colors ${
                    sizePreset === item.id
                      ? 'bg-[#fff0e6] border-[#e65100] text-[#e65100] font-medium shadow-xs'
                      : 'bg-[#f8f9fa] border-[#e0e2e6] text-[#4a5056] hover:bg-[#f0f2f5]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#e0e2e6] flex justify-end gap-2 bg-[#f8f9fa]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#f0f2f5] hover:bg-[#e4e6eb] text-[#2e3436] border border-[#dcdcdc] font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-4 py-1.5 rounded-lg bg-[#e65100] hover:bg-[#d84315] font-semibold text-white shadow-md shadow-[#e65100]/20 transition-all active:scale-95 disabled:opacity-50"
          >
            {isExporting ? 'Exporting...' : 'Export Photo'}
          </button>
        </div>
      </div>
    </div>
  );
};
