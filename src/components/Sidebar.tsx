import React, { useState } from 'react';
import { 
  Folder, Star, Image, BookOpen, Plus, RefreshCw
} from 'lucide-react';
import type { Album, WatchedFolder } from '../types';

interface SidebarProps {
  folders: WatchedFolder[];
  albums: Album[];
  activeView: 'all' | 'favorites' | 'rated' | 'folder' | 'album' | 'date';
  activeFolderId?: number;
  activeAlbumId?: number;
  totalPhotoCount: number;
  favoriteCount: number;
  onSelectView: (view: 'all' | 'favorites' | 'rated') => void;
  onSelectFolder: (folderId: number) => void;
  onSelectAlbum: (albumId: number) => void;
  onOpenFolderManager: () => void;
  onCreateAlbum: (name: string) => void;
  onRescanFolder: (folderId: number) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  folders,
  albums,
  activeView,
  activeFolderId,
  activeAlbumId,
  totalPhotoCount,
  favoriteCount,
  onSelectView,
  onSelectFolder,
  onSelectAlbum,
  onOpenFolderManager,
  onCreateAlbum,
  onRescanFolder,
}) => {
  const [newAlbumName, setNewAlbumName] = useState('');
  const [showNewAlbumInput, setShowNewAlbumInput] = useState(false);

  const handleCreateAlbum = (e: React.FormEvent) => {
    e.preventDefault();
    if (newAlbumName.trim()) {
      onCreateAlbum(newAlbumName.trim());
      setNewAlbumName('');
      setShowNewAlbumInput(false);
    }
  };

  return (
    <aside className="w-64 bg-[#f6f6f8] border-r border-[#dcdcdc] flex flex-col justify-between shrink-0 select-none overflow-y-auto">
      <div className="p-3 space-y-5">
        {/* Core Library Views */}
        <div>
          <span className="px-2 text-[11px] font-bold uppercase tracking-wider text-[#62686e]">
            Library
          </span>
          <div className="mt-1.5 space-y-0.5">
            <button
              onClick={() => onSelectView('all')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeView === 'all'
                  ? 'bg-[#fff0e6] text-[#e65100] font-semibold border border-[#ffccaa] shadow-2xs'
                  : 'text-[#2e3436] hover:bg-[#e9eaed]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Image className="w-4 h-4 text-[#e65100]" />
                <span>All Photos</span>
              </div>
              <span className="text-[11px] px-1.5 py-0.2 rounded bg-[#e6e7eb] text-[#4d5358]">
                {totalPhotoCount}
              </span>
            </button>

            <button
              onClick={() => onSelectView('favorites')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                activeView === 'favorites'
                  ? 'bg-[#fff0e6] text-[#e65100] font-semibold border border-[#ffccaa] shadow-2xs'
                  : 'text-[#2e3436] hover:bg-[#e9eaed]'
              }`}
            >
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-[#e65100] fill-[#e65100]/25" />
                <span>Starred</span>
              </div>
              <span className="text-[11px] px-1.5 py-0.2 rounded bg-[#e6e7eb] text-[#4d5358]">
                {favoriteCount}
              </span>
            </button>
          </div>
        </div>

        {/* Watched Folders */}
        <div>
          <div className="flex items-center justify-between px-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#62686e]">
              Watched Folders
            </span>
            <button
              onClick={onOpenFolderManager}
              title="Manage Watched Folders"
              className="text-[11.5px] text-[#e65100] hover:text-[#bf360c] font-medium"
            >
              Manage
            </button>
          </div>

          <div className="mt-1.5 space-y-0.5">
            {folders.length === 0 ? (
              <div className="px-2 py-3 text-center border border-dashed border-[#d0d3da] rounded-md bg-white/60">
                <p className="text-[11.5px] text-[#70757a]">No watched folders yet.</p>
                <button
                  onClick={onOpenFolderManager}
                  className="mt-1.5 text-xs text-[#e65100] hover:underline font-medium"
                >
                  + Add Folder
                </button>
              </div>
            ) : (
              folders.map((folder) => {
                const folderName = folder.path.split('/').filter(Boolean).pop() || folder.path;
                const isSelected = activeView === 'folder' && activeFolderId === folder.id;
                return (
                  <div
                    key={folder.id}
                    className={`group w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-all ${
                      isSelected
                        ? 'bg-[#fff0e6] text-[#e65100] font-semibold border border-[#ffccaa] shadow-2xs'
                        : 'text-[#2e3436] hover:bg-[#e9eaed]'
                    }`}
                  >
                    <button
                      onClick={() => onSelectFolder(folder.id)}
                      className="flex items-center gap-2 truncate text-left flex-1"
                      title={folder.path}
                    >
                      <Folder className="w-3.5 h-3.5 text-[#e65100] shrink-0" />
                      <span className="truncate">{folderName}</span>
                    </button>
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#e6e7eb] text-[#4d5358]">
                        {folder.photo_count ?? 0}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRescanFolder(folder.id);
                        }}
                        title="Rescan Folder"
                        className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-[#e65100] text-[#70757a] transition-opacity"
                      >
                        <RefreshCw className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Virtual Albums */}
        <div>
          <div className="flex items-center justify-between px-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#62686e]">
              Albums
            </span>
            <button
              onClick={() => setShowNewAlbumInput(!showNewAlbumInput)}
              title="Create Album"
              className="text-[#62686e] hover:text-[#e65100]"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {showNewAlbumInput && (
            <form onSubmit={handleCreateAlbum} className="mt-1 px-2">
              <input
                type="text"
                value={newAlbumName}
                onChange={(e) => setNewAlbumName(e.target.value)}
                placeholder="Album name..."
                autoFocus
                className="w-full bg-white border border-[#d0d3da] text-xs text-[#2e3436] rounded px-2 py-1 focus:outline-none focus:border-[#e65100]"
              />
            </form>
          )}

          <div className="mt-1.5 space-y-0.5">
            {albums.map((album) => {
              const isSelected = activeView === 'album' && activeAlbumId === album.id;
              return (
                <button
                  key={album.id}
                  onClick={() => onSelectAlbum(album.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs transition-all ${
                    isSelected
                      ? 'bg-[#fff0e6] text-[#e65100] font-semibold border border-[#ffccaa] shadow-2xs'
                      : 'text-[#2e3436] hover:bg-[#e9eaed]'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <BookOpen className="w-3.5 h-3.5 text-[#e65100] shrink-0" />
                    <span className="truncate">{album.name}</span>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#e6e7eb] text-[#4d5358]">
                    {album.photo_count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom info */}
      <div className="p-3 border-t border-[#dcdcdc] text-[11px] text-[#62686e] flex items-center justify-between bg-[#f0f1f4]">
        <span className="font-medium">Photocasa v1.1</span>
        <span className="text-emerald-600 flex items-center gap-1 font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          100% Offline
        </span>
      </div>
    </aside>
  );
};
