import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Album, Photo, PhotoAdjustments, WatchedFolder, ScanProgress } from './types';
import { 
  apiGetFolders, apiGetPhotos, apiGetAlbums, apiToggleFavorite, 
  apiAddFolder, apiRemoveFolder, apiRescanFolder, apiRescanAll, 
  apiSaveAdjustments, apiCreateAlbum, isTauri 
} from './utils/api';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { PhotoGrid } from './components/PhotoGrid';
import { BottomBar } from './components/BottomBar';
import { FolderManagerModal } from './components/FolderManagerModal';
import { PhotoViewer } from './components/PhotoViewer';
import { EditorContainer } from './components/Editor/EditorContainer';
import { CollageStudio } from './components/Collage/CollageStudio';
import { ExportModal } from './components/ExportModal';

export const App: React.FC = () => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [folders, setFolders] = useState<WatchedFolder[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Views & Filters
  const [activeView, setActiveView] = useState<'all' | 'favorites' | 'rated' | 'folder' | 'album' | 'date'>('all');
  const [activeFolderId, setActiveFolderId] = useState<number | undefined>();
  const [activeAlbumId, setActiveAlbumId] = useState<number | undefined>();
  const [activeDate, setActiveDate] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [thumbnailSize, setThumbnailSize] = useState<number>(200);

  // Modals & Panels
  const [isFolderManagerOpen, setIsFolderManagerOpen] = useState<boolean>(false);
  const [viewerPhoto, setViewerPhoto] = useState<Photo | null>(null);
  const [editorPhoto, setEditorPhoto] = useState<Photo | null>(null);
  const [isCollageOpen, setIsCollageOpen] = useState<boolean>(false);
  const [exportTargetPhoto, setExportTargetPhoto] = useState<Photo | null>(null);
  const [exportCustomDataUrl, setExportCustomDataUrl] = useState<string | undefined>(undefined);
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);

  // Load initial library data
  const refreshLibrary = useCallback(async () => {
    try {
      const [fList, aList, pList] = await Promise.all([
        apiGetFolders(),
        apiGetAlbums(),
        apiGetPhotos(),
      ]);
      setFolders(fList);
      setAlbums(aList);
      setPhotos(pList);
    } catch (err) {
      console.error('Failed to load library', err);
    }
  }, []);

  useEffect(() => {
    refreshLibrary();

    // Listen for background file watcher and scanner events in Tauri
    if (isTauri) {
      let unlistenPhoto: (() => void) | undefined;
      let unlistenScan: (() => void) | undefined;

      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<any>('photo-event', () => {
          refreshLibrary();
        }).then((un) => {
          unlistenPhoto = un;
        });

        listen<ScanProgress>('scan-progress', (event) => {
          setScanProgress(event.payload);
          if (event.payload.status === 'complete') {
            refreshLibrary();
            setTimeout(() => setScanProgress(null), 2500);
          }
        }).then((un) => {
          unlistenScan = un;
        });
      });

      return () => {
        unlistenPhoto?.();
        unlistenScan?.();
      };
    }
  }, [refreshLibrary]);

  // Filter photos based on search query and active view
  const filteredPhotos = useMemo(() => {
    let result = photos;

    if (activeView === 'favorites') {
      result = result.filter((p) => p.is_favorite);
    } else if (activeView === 'rated') {
      result = result.filter((p) => p.rating >= 4);
    } else if (activeView === 'folder' && activeFolderId !== undefined) {
      result = result.filter((p) => p.folder_id === activeFolderId);
    } else if (activeView === 'album' && activeAlbumId !== undefined) {
      // handled via album query or mock
      result = result.filter((p) => p.folder_id === activeAlbumId);
    } else if (activeView === 'date' && activeDate) {
      result = result.filter((p) => p.date_taken.startsWith(activeDate));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.filename.toLowerCase().includes(q) ||
          p.path.toLowerCase().includes(q) ||
          (p.camera_make && p.camera_make.toLowerCase().includes(q)) ||
          (p.camera_model && p.camera_model.toLowerCase().includes(q))
      );
    }

    return result;
  }, [photos, activeView, activeFolderId, activeAlbumId, activeDate, searchQuery]);

  // Selection handlers
  const handleToggleSelect = (photoId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else {
        next.add(photoId);
      }
      return next;
    });
  };

  const handleSelectMultiple = (photoIds: number[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allPresent = photoIds.every((id) => next.has(id));
      if (allPresent) {
        photoIds.forEach((id) => next.delete(id));
      } else {
        photoIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(filteredPhotos.map((p) => p.id)));
  };

  const handleClearSelection = () => {
    setSelectedIds(new Set());
  };

  // Actions
  const handleToggleFavorite = async (photoId: number) => {
    const isFav = await apiToggleFavorite(photoId);
    setPhotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, is_favorite: isFav } : p))
    );
  };

  const handleSaveAdjustments = async (
    photoId: number,
    adjustments: PhotoAdjustments,
    thumbnailDataBase64?: string
  ) => {
    const updated = await apiSaveAdjustments(photoId, adjustments, thumbnailDataBase64);
    if (updated) {
      setPhotos((prev) => prev.map((p) => (p.id === photoId ? updated : p)));
    } else {
      setPhotos((prev) =>
        prev.map((p) => (p.id === photoId ? { ...p, adjustments } : p))
      );
    }
    await refreshLibrary();
  };

  const handlePhotoUpdated = (updatedPhoto: Photo) => {
    setPhotos((prev) => prev.map((p) => (p.id === updatedPhoto.id ? updatedPhoto : p)));
    if (viewerPhoto && viewerPhoto.id === updatedPhoto.id) {
      setViewerPhoto(updatedPhoto);
    }
  };

  const handleAddFolder = async (path: string, scanMode: 'always' | 'once') => {
    await apiAddFolder(path, scanMode);
    await refreshLibrary();
  };

  const handleRemoveFolder = async (folderId: number) => {
    await apiRemoveFolder(folderId);
    await refreshLibrary();
  };

  const handleRescanFolder = async (folderId: number) => {
    await apiRescanFolder(folderId);
    await refreshLibrary();
  };

  const handleRescanAll = async () => {
    await apiRescanAll();
    await refreshLibrary();
  };

  const handleCreateAlbum = async (name: string) => {
    await apiCreateAlbum(name);
    const updated = await apiGetAlbums();
    setAlbums(updated);
  };

  // Selected photos for Collage Studio
  const collagePhotos = useMemo(() => {
    if (selectedIds.size > 0) {
      return photos.filter((p) => selectedIds.has(p.id));
    }
    return filteredPhotos.slice(0, 12);
  }, [photos, selectedIds, filteredPhotos]);

  return (
    <div className="w-screen h-screen flex flex-col bg-[#f6f6f7] text-[#2e3436] select-none overflow-hidden font-sans">
      {/* Top Application Header */}
      <Header
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenFolderManager={() => setIsFolderManagerOpen(true)}
        onRescanAll={handleRescanAll}
        onOpenCollage={() => setIsCollageOpen(true)}
        selectedCount={selectedIds.size}
        scanProgress={scanProgress}
      />

      {/* Main Workspace Body: Left Sidebar + Center Virtual Grid */}
      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          folders={folders}
          albums={albums}
          activeView={activeView}
          activeFolderId={activeFolderId}
          activeAlbumId={activeAlbumId}
          totalPhotoCount={photos.length}
          favoriteCount={photos.filter((p) => p.is_favorite).length}
          onSelectView={(view) => {
            setActiveView(view);
            setActiveFolderId(undefined);
            setActiveAlbumId(undefined);
            setActiveDate(undefined);
          }}
          onSelectFolder={(folderId) => {
            setActiveView('folder');
            setActiveFolderId(folderId);
          }}
          onSelectAlbum={(albumId) => {
            setActiveView('album');
            setActiveAlbumId(albumId);
          }}
          onOpenFolderManager={() => setIsFolderManagerOpen(true)}
          onCreateAlbum={handleCreateAlbum}
          onRescanFolder={handleRescanFolder}
        />

        <main className="flex-1 flex flex-col bg-[#f6f6f7] overflow-hidden">
          <PhotoGrid
            photos={filteredPhotos}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectMultiple={handleSelectMultiple}
            onToggleFavorite={handleToggleFavorite}
            onOpenViewer={(p) => setViewerPhoto(p)}
            onOpenEditor={(p) => setEditorPhoto(p)}
            thumbnailSize={thumbnailSize}
            onOpenFolderManager={() => setIsFolderManagerOpen(true)}
          />
        </main>
      </div>

      {/* Bottom Status Bar & Picasa Zoom Slider */}
      <BottomBar
        totalCount={filteredPhotos.length}
        selectedCount={selectedIds.size}
        onClearSelection={handleClearSelection}
        onSelectAll={handleSelectAll}
        thumbnailSize={thumbnailSize}
        onZoomChange={setThumbnailSize}
        onOpenCollage={() => setIsCollageOpen(true)}
      />

      {/* Modals & Overlays */}
      <FolderManagerModal
        isOpen={isFolderManagerOpen}
        onClose={() => setIsFolderManagerOpen(false)}
        folders={folders}
        onAddFolder={handleAddFolder}
        onRemoveFolder={handleRemoveFolder}
        onRescanFolder={handleRescanFolder}
      />

      {viewerPhoto && (
        <PhotoViewer
          photo={viewerPhoto}
          photos={filteredPhotos}
          onClose={() => {
            setViewerPhoto(null);
            refreshLibrary();
          }}
          onOpenEditor={(p) => {
            setViewerPhoto(null);
            setEditorPhoto(p);
          }}
          onToggleFavorite={handleToggleFavorite}
          onExportPhoto={(p, customDataUrl) => {
            setExportTargetPhoto(p);
            setExportCustomDataUrl(customDataUrl);
          }}
          onPhotoUpdated={handlePhotoUpdated}
        />
      )}

      {editorPhoto && (
        <EditorContainer
          photo={editorPhoto}
          onClose={() => setEditorPhoto(null)}
          onSave={handleSaveAdjustments}
          onExport={(p, customDataUrl) => {
            setExportTargetPhoto(p);
            setExportCustomDataUrl(customDataUrl);
          }}
        />
      )}

      {isCollageOpen && (
        <CollageStudio
          selectedPhotos={collagePhotos}
          onClose={() => setIsCollageOpen(false)}
        />
      )}

      {exportTargetPhoto && (
        <ExportModal
          isOpen={true}
          onClose={() => {
            setExportTargetPhoto(null);
            setExportCustomDataUrl(undefined);
          }}
          photo={exportTargetPhoto}
          customImageDataUrl={exportCustomDataUrl}
        />
      )}
    </div>
  );
};

export default App;
