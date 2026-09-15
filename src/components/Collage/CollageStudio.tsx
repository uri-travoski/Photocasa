import React, { useState, useRef, useEffect } from 'react';
import { 
  X, Shuffle, Download, Layers, Grid,
  RotateCw, ArrowUp, ArrowDown, Trash2, Move, Type, ArrowRight,
  ZoomIn, ZoomOut
} from 'lucide-react';
import type { CollageType, Photo, PicturePileItem, PhotoTextItem, PhotoArrowItem } from '../../types';
import { getPhotoSrc, apiExportCollage } from '../../utils/api';
import { drawArrow, drawTextItem } from '../../utils/canvasRenderer';
import { save } from '@tauri-apps/plugin-dialog';

interface CollageStudioProps {
  selectedPhotos: Photo[];
  onClose: () => void;
}

const CANVAS_PRESETS = [
  { name: '1080p Wallpaper', width: 1920, height: 1080 },
  { name: '4K Ultra HD', width: 3840, height: 2160 },
  { name: '1:1 Square', width: 2048, height: 2048 },
  { name: '4x6 Print', width: 1800, height: 1200 },
  { name: 'A4 Poster', width: 2480, height: 3508 },
];

const FONT_OPTIONS = [
  'IBM Plex Sans',
  'Inter',
  'Roboto',
  'Ubuntu',
  'serif',
  'monospace',
];

const COLOR_PRESETS = [
  '#ffffff',
  '#000000',
  '#e65100',
  '#2563eb',
  '#16a34a',
  '#dc2626',
  '#f59e0b',
  '#9333ea',
];

const BG_COLOR_PRESETS = [
  'transparent',
  '#ffffff',
  '#f6f6f7',
  '#e8e5dc',
  '#2e3436',
  '#18191e',
  '#d0cbbf',
  '#faebd7',
];

export const CollageStudio: React.FC<CollageStudioProps> = ({
  selectedPhotos,
  onClose,
}) => {
  const [collageType, setCollageType] = useState<CollageType>('pile');
  const [canvasWidth, setCanvasWidth] = useState<number>(1920);
  const [canvasHeight, setCanvasHeight] = useState<number>(1080);
  const [presetName, setPresetName] = useState<string>('1080p Wallpaper');
  const [bgColor, setBgColor] = useState<string>('#e8e5dc');
  const [hasBorder, setHasBorder] = useState<boolean>(true);
  const [borderWidth, setBorderWidth] = useState<number>(12);
  const [shadowBlur, setShadowBlur] = useState<number>(0); // Straight & no drop shadow by default
  const [gutter, setGutter] = useState<number>(16);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Picture Pile Items
  const [pileItems, setPileItems] = useState<PicturePileItem[]>([]);
  const [selectedPileItemId, setSelectedPileItemId] = useState<string | null>(null);

  // Mosaic Grid State: whole image contain vs cover & per-photo zoom
  const [mosaicPhotos, setMosaicPhotos] = useState<Photo[]>(selectedPhotos);
  const [mosaicFitMode, setMosaicFitMode] = useState<'contain' | 'cover'>('contain');
  const [mosaicZooms, setMosaicZooms] = useState<Record<number, number>>({});
  const [mosaicPan, setMosaicPan] = useState<Record<number, { x: number; y: number }>>({});
  const [isPanningMosaic, setIsPanningMosaic] = useState<boolean>(false);
  const [mosaicPanStart, setMosaicPanStart] = useState<{
    photoId: number;
    startX: number;
    startY: number;
    initialPanX: number;
    initialPanY: number;
  } | null>(null);
  const [selectedMosaicPhotoId, setSelectedMosaicPhotoId] = useState<number | null>(null);
  const [dragMosaicIdx, setDragMosaicIdx] = useState<number | null>(null);
  const [hoverMosaicIdx, setHoverMosaicIdx] = useState<number | null>(null);

  // Text & Arrow Annotation Tools
  const [textItems, setTextItems] = useState<PhotoTextItem[]>([]);
  const [arrowItems, setArrowItems] = useState<PhotoArrowItem[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);
  const [selectedArrowId, setSelectedArrowId] = useState<string | null>(null);

  // Overlay Drag State (for text & arrows)
  const [overlayDrag, setOverlayDrag] = useState<{
    type: 'text' | 'arrow-start' | 'arrow-end' | 'arrow-move';
    id: string;
    startClientX: number;
    startClientY: number;
    initialPos: any;
  } | null>(null);

  // Drag interaction state for Picture Pile
  const [pileDragAction, setPileDragAction] = useState<'move' | 'rotate' | null>(null);
  const [dragStartPos, setDragStartPos] = useState<{
    x: number;
    y: number;
    itemX: number;
    itemY: number;
    startAngle: number;
    itemRot: number;
  } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loadedImagesRef = useRef<Map<number, HTMLImageElement>>(new Map());

  // Keep mosaicPhotos in sync if selectedPhotos change
  useEffect(() => {
    setMosaicPhotos(selectedPhotos);
  }, [selectedPhotos]);

  // Load selected images
  useEffect(() => {
    selectedPhotos.forEach((photo) => {
      if (!loadedImagesRef.current.has(photo.id)) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = getPhotoSrc(photo, true);
        img.onload = () => {
          loadedImagesRef.current.set(photo.id, img);
          renderCollage();
        };
      }
    });

    // Initialize picture pile positions straight (0 deg)
    generatePileLayout();
  }, [selectedPhotos, canvasWidth, canvasHeight]);

  // Re-render when settings or items change
  useEffect(() => {
    renderCollage();
  }, [
    collageType, pileItems, selectedPileItemId, mosaicPhotos, mosaicFitMode, mosaicZooms, mosaicPan,
    selectedMosaicPhotoId, dragMosaicIdx, hoverMosaicIdx,
    textItems, arrowItems, selectedTextId, selectedArrowId,
    bgColor, hasBorder, borderWidth, shadowBlur, gutter
  ]);

  const generatePileLayout = () => {
    if (selectedPhotos.length === 0) return;
    const items: PicturePileItem[] = selectedPhotos.map((photo, i) => {
      const angle = (i * 137.5 * Math.PI) / 180;
      const r = Math.min(canvasWidth, canvasHeight) * 0.22 * Math.sqrt((i + 1) / selectedPhotos.length);
      const cx = canvasWidth / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 60;
      const cy = canvasHeight / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 60;
      // Photos straight (0 deg rotation) as requested
      const rot = 0;

      return {
        id: `pile-${photo.id}-${i}`,
        photoId: photo.id,
        photo,
        x: cx,
        y: cy,
        rotation: rot,
        scale: 1,
        zIndex: i,
      };
    });
    setPileItems(items);
    setSelectedPileItemId(null);
  };

  const handleShuffle = () => {
    if (collageType === 'pile') {
      generatePileLayout();
    } else if (collageType === 'mosaic') {
      const shuffled = [...mosaicPhotos].sort(() => Math.random() - 0.5);
      setMosaicPhotos(shuffled);
    }
  };

  const handleSelectPreset = (preset: typeof CANVAS_PRESETS[0]) => {
    setPresetName(preset.name);
    setCanvasWidth(preset.width);
    setCanvasHeight(preset.height);
  };

  // Helper to get canvas-relative coordinates from pointer event
  const getCanvasCoords = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  // Text & Arrow Addition Handlers
  const handleAddText = () => {
    const newItem: PhotoTextItem = {
      id: `text-${Date.now()}`,
      text: 'Add title here',
      x: Math.round(canvasWidth * 0.2),
      y: Math.round(canvasHeight * 0.2),
      fontSize: Math.max(36, Math.round(canvasWidth * 0.035)),
      color: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      fontFamily: 'IBM Plex Sans',
    };
    setTextItems((prev) => [...prev, newItem]);
    setSelectedTextId(newItem.id);
    setSelectedArrowId(null);
    setSelectedPileItemId(null);
  };

  const handleAddArrow = () => {
    const newArrow: PhotoArrowItem = {
      id: `arrow-${Date.now()}`,
      startX: Math.round(canvasWidth * 0.25),
      startY: Math.round(canvasHeight * 0.3),
      endX: Math.round(canvasWidth * 0.45),
      endY: Math.round(canvasHeight * 0.45),
      color: '#e65100',
      width: 8,
    };
    setArrowItems((prev) => [...prev, newArrow]);
    setSelectedArrowId(newArrow.id);
    setSelectedTextId(null);
    setSelectedPileItemId(null);
  };

  // Render Collage Engine
  const renderCollage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Background
    if (bgColor === 'transparent') {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    } else {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

    // 2. Render Base Layout
    if (collageType === 'pile') {
      renderPicturePile(ctx);
    } else if (collageType === 'mosaic') {
      renderMosaic(ctx);
    }

    // 3. Render Annotations (Arrows and Text)
    arrowItems.forEach((arrow) => {
      drawArrow(ctx, arrow, arrow.id === selectedArrowId);
    });

    textItems.forEach((item) => {
      drawTextItem(ctx, item, item.id === selectedTextId);
    });
  };

  const renderPicturePile = (ctx: CanvasRenderingContext2D) => {
    const sorted = [...pileItems].sort((a, b) => a.zIndex - b.zIndex);

    sorted.forEach((item) => {
      const img = loadedImagesRef.current.get(item.photoId);
      if (!img) return;

      const itemW = canvasWidth * 0.32 * item.scale;
      const aspect = img.height / (img.width || 1);
      const itemH = itemW * aspect;
      const isSelected = item.id === selectedPileItemId;

      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.rotate((item.rotation * Math.PI) / 180);

      // Drop Shadow (0 blur by default for clean straight look)
      if (shadowBlur > 0) {
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = shadowBlur;
        ctx.shadowOffsetX = 6;
        ctx.shadowOffsetY = 10;
      }

      // White Polaroid Border
      const bw = hasBorder ? borderWidth : 0;
      if (hasBorder) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-itemW / 2 - bw, -itemH / 2 - bw, itemW + bw * 2, itemH + bw * 2);
      }

      // Reset shadow before drawing image to keep border crisp
      ctx.shadowColor = 'transparent';
      ctx.drawImage(img, -itemW / 2, -itemH / 2, itemW, itemH);

      // If Selected: Render Picasa Rotation Pin & Selection Frame
      if (isSelected) {
        const frameW = itemW + bw * 2;
        const frameH = itemH + bw * 2;

        // Orange Selection Box
        ctx.strokeStyle = '#e65100';
        ctx.lineWidth = 3;
        ctx.strokeRect(-frameW / 2, -frameH / 2, frameW, frameH);

        // Rotation Handle Stem Line
        const handleDist = 36;
        ctx.beginPath();
        ctx.moveTo(0, -frameH / 2);
        ctx.lineTo(0, -frameH / 2 - handleDist);
        ctx.strokeStyle = '#e65100';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Circular Rotation Handle Pin
        ctx.beginPath();
        ctx.arc(0, -frameH / 2 - handleDist, 12, 0, Math.PI * 2);
        ctx.fillStyle = '#e65100';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Rotation icon center dot
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, -frameH / 2 - handleDist, 4, 0, Math.PI * 2);
        ctx.fill();

        // Corner Resize Handles
        const cornerSize = 10;
        const corners = [
          [-frameW / 2, -frameH / 2],
          [frameW / 2, -frameH / 2],
          [-frameW / 2, frameH / 2],
          [frameW / 2, frameH / 2],
        ];
        corners.forEach(([cx, cy]) => {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(cx - cornerSize / 2, cy - cornerSize / 2, cornerSize, cornerSize);
          ctx.strokeStyle = '#e65100';
          ctx.lineWidth = 2;
          ctx.strokeRect(cx - cornerSize / 2, cy - cornerSize / 2, cornerSize, cornerSize);
        });
      }

      ctx.restore();
    });
  };

  // Helper to calculate cell bounds for Mosaic Grid
  const getMosaicCells = () => {
    const count = mosaicPhotos.length;
    if (count === 0) return [];

    const cols = Math.ceil(Math.sqrt(count * (canvasWidth / canvasHeight)));
    const rows = Math.ceil(count / cols);

    const cellW = (canvasWidth - gutter * (cols + 1)) / cols;
    const cellH = (canvasHeight - gutter * (rows + 1)) / rows;

    return mosaicPhotos.map((photo, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gutter + col * (cellW + gutter);
      const y = gutter + row * (cellH + gutter);
      return { photo, i, x, y, width: cellW, height: cellH };
    });
  };

  const renderMosaic = (ctx: CanvasRenderingContext2D) => {
    const cells = getMosaicCells();

    cells.forEach(({ photo, i, x, y, width: cellW, height: cellH }) => {
      const img = loadedImagesRef.current.get(photo.id);
      if (!img) return;

      const isDragging = dragMosaicIdx === i;
      const isHovered = hoverMosaicIdx === i && dragMosaicIdx !== null && dragMosaicIdx !== i;
      const isSelected = selectedMosaicPhotoId === photo.id;
      const zoom = mosaicZooms[photo.id] || 1.0;
      const pan = mosaicPan[photo.id] || { x: 0, y: 0 };

      ctx.save();

      // Translucent if being dragged
      if (isDragging) {
        ctx.globalAlpha = 0.4;
      }

      // Border: outline stroke if transparent, or solid background if opaque
      if (hasBorder && borderWidth > 0) {
        if (bgColor === 'transparent') {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = borderWidth;
          ctx.strokeRect(x - borderWidth / 2, y - borderWidth / 2, cellW + borderWidth, cellH + borderWidth);
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(x - borderWidth, y - borderWidth, cellW + borderWidth * 2, cellH + borderWidth * 2);
        }
      }

      // Clip content inside the cell
      ctx.beginPath();
      ctx.rect(x, y, cellW, cellH);
      ctx.clip();

      const imgRatio = img.width / (img.height || 1);
      const cellRatio = cellW / (cellH || 1);

      if (mosaicFitMode === 'contain') {
        // Fit entire image into cell (no cropping)
        let drawW = cellW;
        let drawH = cellH;
        if (imgRatio > cellRatio) {
          drawW = cellW;
          drawH = cellW / imgRatio;
        } else {
          drawH = cellH;
          drawW = cellH * imgRatio;
        }

        // Apply per-photo zoom
        drawW *= zoom;
        drawH *= zoom;

        // When zoomed in, allow panning within the photo extent
        const maxPanX = Math.max(0, (drawW - cellW) / 2);
        const maxPanY = Math.max(0, (drawH - cellH) / 2);
        const clampedPanX = Math.max(-maxPanX, Math.min(maxPanX, pan.x));
        const clampedPanY = Math.max(-maxPanY, Math.min(maxPanY, pan.y));

        // Center inside cell + pan offset
        const drawX = x + (cellW - drawW) / 2 + clampedPanX;
        const drawY = y + (cellH - drawH) / 2 + clampedPanY;
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
      } else {
        // Cover-fit image into cell
        let sw = img.width;
        let sh = img.height;

        if (imgRatio > cellRatio) {
          sw = (img.height * cellRatio) / zoom;
          sh = img.height / zoom;
        } else {
          sh = (img.width / cellRatio) / zoom;
          sw = img.width / zoom;
        }

        // Available source pan range
        const maxSourcePanX = Math.max(0, (img.width - sw) / 2);
        const maxSourcePanY = Math.max(0, (img.height - sh) / 2);

        // Convert canvas drag delta to source pixels
        const scaleX = sw / (cellW || 1);
        const scaleY = sh / (cellH || 1);
        const clampedSourcePanX = Math.max(-maxSourcePanX, Math.min(maxSourcePanX, pan.x * scaleX));
        const clampedSourcePanY = Math.max(-maxSourcePanY, Math.min(maxSourcePanY, pan.y * scaleY));

        const sx = (img.width - sw) / 2 - clampedSourcePanX;
        const sy = (img.height - sh) / 2 - clampedSourcePanY;
        ctx.drawImage(img, sx, sy, sw, sh, x, y, cellW, cellH);
      }

      ctx.restore();

      // Highlight target swap cell or selected cell
      if (isHovered) {
        ctx.strokeStyle = '#e65100';
        ctx.lineWidth = 6;
        ctx.strokeRect(x, y, cellW, cellH);
        ctx.fillStyle = 'rgba(230, 81, 0, 0.2)';
        ctx.fillRect(x, y, cellW, cellH);
      } else if (isSelected) {
        ctx.strokeStyle = '#e65100';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, cellW, cellH);
      }
    });
  };

  // Pointer Handlers for Canvas (Picture Pile, Mosaic, Text, Arrows)
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const { x: mx, y: my } = getCanvasCoords(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    // 1. Test Text items
    for (let i = textItems.length - 1; i >= 0; i--) {
      const item = textItems[i];
      const approxW = Math.max(80, item.text.length * item.fontSize * 0.65);
      const approxH = item.fontSize * 1.4;
      if (mx >= item.x - 10 && mx <= item.x + approxW + 10 && my >= item.y - 10 && my <= item.y + approxH + 10) {
        setSelectedTextId(item.id);
        setSelectedArrowId(null);
        setSelectedPileItemId(null);
        setOverlayDrag({
          type: 'text',
          id: item.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          initialPos: { x: item.x, y: item.y },
        });
        return;
      }
    }

    // 2. Test Arrow items
    for (let i = arrowItems.length - 1; i >= 0; i--) {
      const arrow = arrowItems[i];
      const distStart = Math.hypot(mx - arrow.startX, my - arrow.startY);
      const distEnd = Math.hypot(mx - arrow.endX, my - arrow.endY);

      if (distEnd <= 26) {
        setSelectedArrowId(arrow.id);
        setSelectedTextId(null);
        setSelectedPileItemId(null);
        setOverlayDrag({
          type: 'arrow-end',
          id: arrow.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          initialPos: { x: arrow.endX, y: arrow.endY },
        });
        return;
      }

      if (distStart <= 26) {
        setSelectedArrowId(arrow.id);
        setSelectedTextId(null);
        setSelectedPileItemId(null);
        setOverlayDrag({
          type: 'arrow-start',
          id: arrow.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          initialPos: { x: arrow.startX, y: arrow.startY },
        });
        return;
      }

      const midX = (arrow.startX + arrow.endX) / 2;
      const midY = (arrow.startY + arrow.endY) / 2;
      if (Math.hypot(mx - midX, my - midY) <= 30) {
        setSelectedArrowId(arrow.id);
        setSelectedTextId(null);
        setSelectedPileItemId(null);
        setOverlayDrag({
          type: 'arrow-move',
          id: arrow.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          initialPos: { ...arrow },
        });
        return;
      }
    }

    // Deselect annotations if clicking background or photos
    setSelectedTextId(null);
    setSelectedArrowId(null);

    // 3. Collage Mode specific pointer logic
    if (collageType === 'pile') {
      // Check if clicking on the selected item's rotation handle
      if (selectedPileItemId) {
        const item = pileItems.find((p) => p.id === selectedPileItemId);
        if (item) {
          const img = loadedImagesRef.current.get(item.photoId);
          const itemW = canvasWidth * 0.32 * item.scale;
          const aspect = img ? img.height / (img.width || 1) : 0.75;
          const itemH = itemW * aspect;
          const bw = hasBorder ? borderWidth : 0;
          const frameH = itemH + bw * 2;
          const handleDist = 36;

          const rad = (item.rotation * Math.PI) / 180;
          const pinLocalY = -frameH / 2 - handleDist;
          const pinWorldX = item.x - pinLocalY * Math.sin(rad);
          const pinWorldY = item.y + pinLocalY * Math.cos(rad);

          const dist = Math.hypot(mx - pinWorldX, my - pinWorldY);
          if (dist <= 24) {
            setPileDragAction('rotate');
            const startAngle = Math.atan2(my - item.y, mx - item.x) * (180 / Math.PI);
            setDragStartPos({ x: mx, y: my, itemX: item.x, itemY: item.y, startAngle, itemRot: item.rotation });
            return;
          }
        }
      }

      // Hit-test items from top zIndex down
      const sortedDesc = [...pileItems].sort((a, b) => b.zIndex - a.zIndex);
      for (const item of sortedDesc) {
        const img = loadedImagesRef.current.get(item.photoId);
        const itemW = canvasWidth * 0.32 * item.scale;
        const aspect = img ? img.height / (img.width || 1) : 0.75;
        const itemH = itemW * aspect;
        const bw = hasBorder ? borderWidth : 0;
        const halfW = itemW / 2 + bw;
        const halfH = itemH / 2 + bw;

        const rad = (item.rotation * Math.PI) / 180;
        const dx = mx - item.x;
        const dy = my - item.y;
        const localX = dx * Math.cos(-rad) - dy * Math.sin(-rad);
        const localY = dx * Math.sin(-rad) + dy * Math.cos(-rad);

        if (Math.abs(localX) <= halfW && Math.abs(localY) <= halfH) {
          setSelectedPileItemId(item.id);

          const maxZ = Math.max(...pileItems.map((p) => p.zIndex), 0);
          setPileItems((prev) =>
            prev.map((p) => (p.id === item.id ? { ...p, zIndex: maxZ + 1 } : p))
          );

          setPileDragAction('move');
          setDragStartPos({ x: mx, y: my, itemX: item.x, itemY: item.y, startAngle: 0, itemRot: item.rotation });
          return;
        }
      }

      setSelectedPileItemId(null);
    } else if (collageType === 'mosaic') {
      const cells = getMosaicCells();
      for (const cell of cells) {
        if (mx >= cell.x && mx <= cell.x + cell.width && my >= cell.y && my <= cell.y + cell.height) {
          setSelectedMosaicPhotoId(cell.photo.id);
          const zoom = mosaicZooms[cell.photo.id] || 1.0;
          const currentPan = mosaicPan[cell.photo.id] || { x: 0, y: 0 };

          // If zoomed in or cover fit mode, dragging pans the photo framing within the cell
          if (zoom > 1.001 || mosaicFitMode === 'cover') {
            setIsPanningMosaic(true);
            setMosaicPanStart({
              photoId: cell.photo.id,
              startX: mx,
              startY: my,
              initialPanX: currentPan.x,
              initialPanY: currentPan.y,
            });
          } else {
            setDragMosaicIdx(cell.i);
            setHoverMosaicIdx(cell.i);
          }
          return;
        }
      }
      setSelectedMosaicPhotoId(null);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const { x: mx, y: my } = getCanvasCoords(e);

    // Overlay Drags (Text & Arrows)
    if (overlayDrag) {
      const dx = (e.clientX - overlayDrag.startClientX) * scaleX;
      const dy = (e.clientY - overlayDrag.startClientY) * scaleY;

      if (overlayDrag.type === 'text') {
        setTextItems((prev) =>
          prev.map((item) =>
            item.id === overlayDrag.id
              ? { ...item, x: Math.round(overlayDrag.initialPos.x + dx), y: Math.round(overlayDrag.initialPos.y + dy) }
              : item
          )
        );
      } else if (overlayDrag.type === 'arrow-start') {
        setArrowItems((prev) =>
          prev.map((arrow) =>
            arrow.id === overlayDrag.id
              ? { ...arrow, startX: Math.round(overlayDrag.initialPos.x + dx), startY: Math.round(overlayDrag.initialPos.y + dy) }
              : arrow
          )
        );
      } else if (overlayDrag.type === 'arrow-end') {
        setArrowItems((prev) =>
          prev.map((arrow) =>
            arrow.id === overlayDrag.id
              ? { ...arrow, endX: Math.round(overlayDrag.initialPos.x + dx), endY: Math.round(overlayDrag.initialPos.y + dy) }
              : arrow
          )
        );
      } else if (overlayDrag.type === 'arrow-move') {
        const init = overlayDrag.initialPos;
        setArrowItems((prev) =>
          prev.map((arrow) =>
            arrow.id === overlayDrag.id
              ? {
                  ...arrow,
                  startX: Math.round(init.startX + dx),
                  startY: Math.round(init.startY + dy),
                  endX: Math.round(init.endX + dx),
                  endY: Math.round(init.endY + dy),
                }
              : arrow
          )
        );
      }
      return;
    }

    if (collageType === 'pile') {
      if (!pileDragAction || !dragStartPos || !selectedPileItemId) return;

      if (pileDragAction === 'move') {
        const dx = mx - dragStartPos.x;
        const dy = my - dragStartPos.y;
        setPileItems((prev) =>
          prev.map((p) =>
            p.id === selectedPileItemId
              ? { ...p, x: dragStartPos.itemX + dx, y: dragStartPos.itemY + dy }
              : p
          )
        );
      } else if (pileDragAction === 'rotate') {
        const currentAngle = Math.atan2(my - dragStartPos.itemY, mx - dragStartPos.itemX) * (180 / Math.PI);
        const deltaAngle = currentAngle - dragStartPos.startAngle;
        const nextRot = Math.round(dragStartPos.itemRot + deltaAngle);
        setPileItems((prev) =>
          prev.map((p) =>
            p.id === selectedPileItemId ? { ...p, rotation: nextRot } : p
          )
        );
      }
    } else if (collageType === 'mosaic') {
      if (isPanningMosaic && mosaicPanStart) {
        const dx = mx - mosaicPanStart.startX;
        const dy = my - mosaicPanStart.startY;
        setMosaicPan((prev) => ({
          ...prev,
          [mosaicPanStart.photoId]: {
            x: Math.round(mosaicPanStart.initialPanX + dx),
            y: Math.round(mosaicPanStart.initialPanY + dy),
          },
        }));
        return;
      }

      if (dragMosaicIdx === null) return;
      const cells = getMosaicCells();
      let hovered: number | null = null;
      for (const cell of cells) {
        if (mx >= cell.x && mx <= cell.x + cell.width && my >= cell.y && my <= cell.y + cell.height) {
          hovered = cell.i;
          break;
        }
      }
      setHoverMosaicIdx(hovered);
    }
  };

  const handlePointerUp = () => {
    setOverlayDrag(null);

    if (collageType === 'pile') {
      setPileDragAction(null);
      setDragStartPos(null);
    } else if (collageType === 'mosaic') {
      if (isPanningMosaic) {
        setIsPanningMosaic(false);
        setMosaicPanStart(null);
      } else if (dragMosaicIdx !== null && hoverMosaicIdx !== null && dragMosaicIdx !== hoverMosaicIdx) {
        const next = [...mosaicPhotos];
        const temp = next[dragMosaicIdx];
        next[dragMosaicIdx] = next[hoverMosaicIdx];
        next[hoverMosaicIdx] = temp;
        setMosaicPhotos(next);
      }
      setDragMosaicIdx(null);
      setHoverMosaicIdx(null);
    }
  };

  // Picture Pile Selected Item Controls
  const selectedItem = pileItems.find((p) => p.id === selectedPileItemId);

  const handleUpdateItemRotation = (rot: number) => {
    if (!selectedPileItemId) return;
    setPileItems((prev) =>
      prev.map((p) => (p.id === selectedPileItemId ? { ...p, rotation: rot } : p))
    );
  };

  const handleUpdateItemScale = (scale: number) => {
    if (!selectedPileItemId) return;
    setPileItems((prev) =>
      prev.map((p) => (p.id === selectedPileItemId ? { ...p, scale } : p))
    );
  };

  const handleBringToFront = () => {
    if (!selectedPileItemId) return;
    const maxZ = Math.max(...pileItems.map((p) => p.zIndex), 0);
    setPileItems((prev) =>
      prev.map((p) => (p.id === selectedPileItemId ? { ...p, zIndex: maxZ + 1 } : p))
    );
  };

  const handleSendToBack = () => {
    if (!selectedPileItemId) return;
    const minZ = Math.min(...pileItems.map((p) => p.zIndex), 0);
    setPileItems((prev) =>
      prev.map((p) => (p.id === selectedPileItemId ? { ...p, zIndex: minZ - 1 } : p))
    );
  };

  const handleDeleteItem = () => {
    if (!selectedPileItemId) return;
    setPileItems((prev) => prev.filter((p) => p.id !== selectedPileItemId));
    setSelectedPileItemId(null);
  };

  // Mosaic item swap helper
  const handleSwapMosaic = (idxA: number, idxB: number) => {
    if (idxA < 0 || idxA >= mosaicPhotos.length || idxB < 0 || idxB >= mosaicPhotos.length) return;
    const next = [...mosaicPhotos];
    const temp = next[idxA];
    next[idxA] = next[idxB];
    next[idxB] = temp;
    setMosaicPhotos(next);
  };

  const handleSetMosaicZoom = (photoId: number, zoomVal: number) => {
    setMosaicZooms((prev) => ({
      ...prev,
      [photoId]: zoomVal,
    }));
  };

  // Selected Text & Arrow Items
  const activeText = textItems.find((t) => t.id === selectedTextId);
  const activeArrow = arrowItems.find((a) => a.id === selectedArrowId);

  // High-Res Export to Disk
  const handleExport = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsExporting(true);
    try {
      const dataUrl = canvas.toDataURL('image/png', 0.95);
      let targetPath: string | null = null;

      try {
        targetPath = await save({
          defaultPath: `photocasa_collage_${Date.now()}.png`,
          filters: [{ name: 'PNG Image', extensions: ['png'] }],
        });
      } catch {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `photocasa_collage_${Date.now()}.png`;
        a.click();
        setIsExporting(false);
        return;
      }

      if (targetPath) {
        await apiExportCollage(dataUrl, targetPath);
        alert(`Collage successfully exported to:\n${targetPath}`);
      }
    } catch (err) {
      console.error('Failed to export collage', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#f6f6f7] flex flex-col select-none animate-in fade-in duration-200 text-[#2e3436]">
      {/* Top Header */}
      <header className="h-12 bg-white border-b border-[#dcdcdc] px-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-md bg-[#f0f2f5] hover:bg-[#e4e6eb] text-[#2e3436] border border-[#dcdcdc] transition-colors"
            title="Back to Library"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-[#2e3436]">Photocasa Collage Studio</span>
            <span className="text-[11px] text-[#6c7178]">• {selectedPhotos.length} photos</span>
          </div>
        </div>

        {/* Collage Type Switcher: Picture Pile & Mosaic Grid */}
        <div className="flex items-center gap-1 bg-[#f0f2f5] p-1 rounded-md border border-[#dcdcdc]">
          <button
            onClick={() => {
              setCollageType('pile');
              setSelectedPileItemId(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
              collageType === 'pile' ? 'bg-[#e65100] text-white shadow-xs' : 'text-[#5e656d] hover:text-[#2e3436]'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Picture Pile</span>
          </button>

          <button
            onClick={() => {
              setCollageType('mosaic');
              setSelectedPileItemId(null);
              if (bgColor === '#e8e5dc') {
                setBgColor('transparent');
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors ${
              collageType === 'mosaic' ? 'bg-[#e65100] text-white shadow-xs' : 'text-[#5e656d] hover:text-[#2e3436]'
            }`}
          >
            <Grid className="w-3.5 h-3.5" />
            <span>Mosaic Grid</span>
          </button>
        </div>

        {/* Actions: Shuffle & Export */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleAddText}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#f0f2f5] hover:bg-[#e4e6eb] text-[#2e3436] border border-[#dcdcdc] text-xs font-medium transition-all active:scale-95"
            title="Add Draggable Text to Collage"
          >
            <Type className="w-3.5 h-3.5 text-[#e65100]" />
            <span>Text</span>
          </button>

          <button
            onClick={handleAddArrow}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[#f0f2f5] hover:bg-[#e4e6eb] text-[#2e3436] border border-[#dcdcdc] text-xs font-medium transition-all active:scale-95"
            title="Add Draggable Arrow Annotation"
          >
            <ArrowRight className="w-3.5 h-3.5 text-[#e65100]" />
            <span>Arrow</span>
          </button>

          <button
            onClick={handleShuffle}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#fff0e6] hover:bg-[#ffe3cc] text-[#e65100] border border-[#e65100]/30 text-xs font-medium transition-all active:scale-95"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>Shuffle {collageType === 'pile' ? 'Pile' : 'Grid'}</span>
          </button>

          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-gradient-to-r from-[#ff7710] to-[#e65100] hover:from-[#f06700] hover:to-[#d84315] text-white font-semibold text-xs shadow-md shadow-[#e65100]/20 transition-all active:scale-95 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExporting ? 'Exporting...' : 'Export High-Res'}</span>
          </button>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: Settings & Presets */}
        <aside className="w-80 bg-white border-r border-[#dcdcdc] p-4 text-xs space-y-4 overflow-y-auto shrink-0">
          {/* Section 1: Add Text Tool (always visible in sidebar) */}
          <div className="bg-white p-3 rounded-md border border-[#e0e2e6] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2e3436]">
                <Type className="w-4 h-4 text-[#e65100]" />
                <span>Add Text</span>
              </div>
              <button
                onClick={handleAddText}
                className="px-2 py-1 rounded bg-[#fff0e6] hover:bg-[#ffe0cc] text-[#e65100] text-[11px] font-semibold border border-[#e65100]/30 transition-colors flex items-center gap-1"
              >
                <span>+ Add Text</span>
              </button>
            </div>

            {/* List of text items if any */}
            {textItems.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {textItems.map((item, idx) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSelectedTextId(item.id);
                      setSelectedArrowId(null);
                      setSelectedPileItemId(null);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border truncate max-w-[120px] transition-colors ${
                      selectedTextId === item.id
                        ? 'bg-[#e65100] text-white border-[#e65100]'
                        : 'bg-[#f0f2f5] hover:bg-[#e4e6eb] text-[#2e3436] border-[#dcdcdc]'
                    }`}
                  >
                    {item.text || `Text ${idx + 1}`}
                  </button>
                ))}
              </div>
            )}

            {/* Active Text Inspector */}
            {activeText && (
              <div className="bg-[#fff8f2] p-2.5 rounded-md border border-[#ffd8b8] space-y-2.5 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#6c7178]">Text Content</span>
                  <input
                    type="text"
                    value={activeText.text}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTextItems((prev) =>
                        prev.map((t) => (t.id === activeText.id ? { ...t, text: val } : t))
                      );
                    }}
                    className="w-full mt-1 px-2 py-1 bg-white rounded border border-[#dcdcdc] text-xs text-[#2e3436] focus:border-[#e65100] focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#6c7178]">Font</span>
                    <select
                      value={activeText.fontFamily}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTextItems((prev) =>
                          prev.map((t) => (t.id === activeText.id ? { ...t, fontFamily: val } : t))
                        );
                      }}
                      className="w-full mt-1 px-1.5 py-1 bg-white rounded border border-[#dcdcdc] text-xs text-[#2e3436] focus:border-[#e65100] focus:outline-none"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#6c7178]">Size ({activeText.fontSize}px)</span>
                    <input
                      type="range"
                      min={16}
                      max={120}
                      value={activeText.fontSize}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setTextItems((prev) =>
                          prev.map((t) => (t.id === activeText.id ? { ...t, fontSize: val } : t))
                        );
                      }}
                      className="w-full mt-2 h-1.5 bg-[#e2e4e8] rounded appearance-none accent-[#e65100]"
                    />
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-[#6c7178]">Color</span>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        onClick={() =>
                          setTextItems((prev) =>
                            prev.map((t) => (t.id === activeText.id ? { ...t, color: c } : t))
                          )
                        }
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full border ${
                          activeText.color === c ? 'ring-2 ring-[#e65100]' : 'border-black/20'
                        }`}
                      />
                    ))}
                    <input
                      type="color"
                      value={activeText.color}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTextItems((prev) =>
                          prev.map((t) => (t.id === activeText.id ? { ...t, color: val } : t))
                        );
                      }}
                      className="w-6 h-6 rounded border border-[#dcdcdc] cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-[#6c7178]">Background Highlight</span>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {['transparent', 'rgba(0, 0, 0, 0.65)', 'rgba(255, 255, 255, 0.85)', '#e65100', '#2563eb'].map((bg) => (
                      <button
                        key={bg}
                        onClick={() =>
                          setTextItems((prev) =>
                            prev.map((t) => (t.id === activeText.id ? { ...t, backgroundColor: bg } : t))
                          )
                        }
                        style={{ backgroundColor: bg === 'transparent' ? '#ffffff' : bg }}
                        className={`px-2 py-0.5 rounded text-[10px] border ${
                          activeText.backgroundColor === bg ? 'border-[#e65100] text-[#e65100] font-bold' : 'border-[#dcdcdc] text-[#4a5056]'
                        }`}
                      >
                        {bg === 'transparent' ? 'None' : bg.startsWith('rgba(0') ? 'Dark' : bg.startsWith('rgba(255') ? 'Light' : 'Color'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-[#ffd8b8]">
                  <span className="text-[10px] text-[#8a9199]">Drag text on photo to move</span>
                  <button
                    onClick={() => {
                      setTextItems((prev) => prev.filter((t) => t.id !== activeText.id));
                      setSelectedTextId(null);
                    }}
                    className="text-[11px] text-red-600 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Arrow Annotation Tool (always visible in sidebar) */}
          <div className="bg-white p-3 rounded-md border border-[#e0e2e6] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2e3436]">
                <ArrowRight className="w-4 h-4 text-[#e65100]" />
                <span>Arrow Annotation</span>
              </div>
              <button
                onClick={handleAddArrow}
                className="px-2 py-1 rounded bg-[#fff0e6] hover:bg-[#ffe0cc] text-[#e65100] text-[11px] font-semibold border border-[#e65100]/30 transition-colors flex items-center gap-1"
              >
                <span>+ Add Arrow</span>
              </button>
            </div>

            {/* List of arrow items if any */}
            {arrowItems.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {arrowItems.map((arrow, idx) => (
                  <button
                    key={arrow.id}
                    onClick={() => {
                      setSelectedArrowId(arrow.id);
                      setSelectedTextId(null);
                      setSelectedPileItemId(null);
                    }}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                      selectedArrowId === arrow.id
                        ? 'bg-[#e65100] text-white border-[#e65100]'
                        : 'bg-[#f0f2f5] hover:bg-[#e4e6eb] text-[#2e3436] border-[#dcdcdc]'
                    }`}
                  >
                    Arrow {idx + 1}
                  </button>
                ))}
              </div>
            )}

            {/* Active Arrow Inspector */}
            {activeArrow && (
              <div className="bg-[#fff8f2] p-2.5 rounded-md border border-[#ffd8b8] space-y-2.5 text-xs">
                <div>
                  <span className="text-[10px] uppercase font-bold text-[#6c7178]">Thickness ({activeArrow.width}px)</span>
                  <input
                    type="range"
                    min={2}
                    max={24}
                    value={activeArrow.width}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setArrowItems((prev) =>
                        prev.map((a) => (a.id === activeArrow.id ? { ...a, width: val } : a))
                      );
                    }}
                    className="w-full mt-1.5 h-1.5 bg-[#e2e4e8] rounded appearance-none accent-[#e65100]"
                  />
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-[#6c7178]">Arrow Color</span>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c}
                        onClick={() =>
                          setArrowItems((prev) =>
                            prev.map((a) => (a.id === activeArrow.id ? { ...a, color: c } : a))
                          )
                        }
                        style={{ backgroundColor: c }}
                        className={`w-5 h-5 rounded-full border ${
                          activeArrow.color === c ? 'ring-2 ring-[#e65100]' : 'border-black/20'
                        }`}
                      />
                    ))}
                    <input
                      type="color"
                      value={activeArrow.color}
                      onChange={(e) => {
                        const val = e.target.value;
                        setArrowItems((prev) =>
                          prev.map((a) => (a.id === activeArrow.id ? { ...a, color: val } : a))
                        );
                      }}
                      className="w-6 h-6 rounded border border-[#dcdcdc] cursor-pointer"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-[#ffd8b8]">
                  <span className="text-[10px] text-[#8a9199]">Drag handles on photo to shape</span>
                  <button
                    onClick={() => {
                      setArrowItems((prev) => prev.filter((a) => a.id !== activeArrow.id));
                      setSelectedArrowId(null);
                    }}
                    className="text-[11px] text-red-600 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Selected Item Controls in Picture Pile */}
          {collageType === 'pile' && selectedItem && !activeText && !activeArrow && (
            <div className="bg-[#fff8f2] p-3.5 rounded-md border border-[#ffd8b8] space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 font-semibold text-[#e65100]">
                  <Move className="w-3.5 h-3.5" />
                  <span>Selected Picture</span>
                </div>
                <button
                  onClick={() => setSelectedPileItemId(null)}
                  className="text-[10px] text-[#8a9199] hover:text-[#2e3436]"
                >
                  Deselect
                </button>
              </div>
              <p className="text-[11px] text-[#6c7178] truncate" title={selectedItem.photo.filename}>
                {selectedItem.photo.filename}
              </p>

              {/* Rotation Slider & 90 deg button */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-[#6c7178]">
                  <span>Angle</span>
                  <span className="font-mono text-[#2e3436] font-medium">{selectedItem.rotation}°</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={-180}
                    max={180}
                    value={selectedItem.rotation}
                    onChange={(e) => handleUpdateItemRotation(Number(e.target.value))}
                    className="flex-1 h-1.5 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                  />
                  <button
                    onClick={() => handleUpdateItemRotation(0)}
                    title="Straighten to 0°"
                    className="p-1 rounded bg-white border border-[#dcdcdc] hover:bg-[#f0f2f5] text-[#2e3436] text-[10px]"
                  >
                    0°
                  </button>
                  <button
                    onClick={() => handleUpdateItemRotation((selectedItem.rotation + 90) % 360)}
                    title="Rotate 90°"
                    className="p-1 rounded bg-white border border-[#dcdcdc] hover:bg-[#f0f2f5] text-[#2e3436]"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Scale Slider */}
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-[#6c7178]">
                  <span>Size (Scale)</span>
                  <span className="font-mono text-[#2e3436] font-medium">{Math.round(selectedItem.scale * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2.2}
                  step={0.05}
                  value={selectedItem.scale}
                  onChange={(e) => handleUpdateItemScale(Number(e.target.value))}
                  className="w-full h-1.5 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                />
              </div>

              {/* Layer Controls */}
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  onClick={handleBringToFront}
                  className="py-1 px-2 rounded bg-white hover:bg-[#f0f2f5] border border-[#dcdcdc] text-[11px] text-[#2e3436] font-medium"
                >
                  Bring to Front
                </button>
                <button
                  onClick={handleSendToBack}
                  className="py-1 px-2 rounded bg-white hover:bg-[#f0f2f5] border border-[#dcdcdc] text-[11px] text-[#2e3436] font-medium"
                >
                  Send to Back
                </button>
              </div>

              <button
                onClick={handleDeleteItem}
                className="w-full py-1 rounded bg-white hover:bg-red-50 border border-red-200 text-red-600 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                <span>Remove from Pile</span>
              </button>
            </div>
          )}

          {/* Mosaic Grid Re-ordering Controls & Per-Photo Zoom */}
          {collageType === 'mosaic' && (
            <div className="bg-[#f8f9fa] p-3 rounded-md border border-[#e0e2e6] space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#2e3436]">Mosaic Layout</span>
                <span className="text-[10px] text-[#8a9199]">Drag cells to swap</span>
              </div>

              {/* Fit Mode Toggle: Contain whole image vs Cover cell */}
              <div className="space-y-1">
                <span className="text-[11px] text-[#6c7178] block">Image Fit Mode</span>
                <div className="grid grid-cols-2 gap-1 bg-[#e4e6eb] p-0.5 rounded">
                  <button
                    onClick={() => setMosaicFitMode('contain')}
                    className={`py-1 rounded text-[11px] font-medium transition-colors ${
                      mosaicFitMode === 'contain' ? 'bg-white text-[#e65100] shadow-xs' : 'text-[#4a5056] hover:text-[#2e3436]'
                    }`}
                  >
                    Fit Entire Image
                  </button>
                  <button
                    onClick={() => setMosaicFitMode('cover')}
                    className={`py-1 rounded text-[11px] font-medium transition-colors ${
                      mosaicFitMode === 'cover' ? 'bg-white text-[#e65100] shadow-xs' : 'text-[#4a5056] hover:text-[#2e3436]'
                    }`}
                  >
                    Fill Cell
                  </button>
                </div>
              </div>

              {/* Per-Photo Zoom & Framing when a cell is selected */}
              {selectedMosaicPhotoId !== null && (
                <div className="bg-[#fff8f2] p-2.5 rounded border border-[#ffd8b8] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[11px] text-[#e65100]">Photo Zoom & Framing</span>
                    <button
                      onClick={() => {
                        handleSetMosaicZoom(selectedMosaicPhotoId, 1.0);
                        setMosaicPan((prev) => ({ ...prev, [selectedMosaicPhotoId]: { x: 0, y: 0 } }));
                      }}
                      className="text-[10px] text-[#e65100] hover:underline"
                    >
                      Reset 100%
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <ZoomOut className="w-3.5 h-3.5 text-[#6c7178]" />
                    <input
                      type="range"
                      min={0.5}
                      max={2.5}
                      step={0.05}
                      value={mosaicZooms[selectedMosaicPhotoId] || 1.0}
                      onChange={(e) => handleSetMosaicZoom(selectedMosaicPhotoId, Number(e.target.value))}
                      className="flex-1 h-1.5 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                    />
                    <ZoomIn className="w-3.5 h-3.5 text-[#6c7178]" />
                    <span className="font-mono text-[10px] text-[#2e3436] w-8">
                      {Math.round((mosaicZooms[selectedMosaicPhotoId] || 1.0) * 100)}%
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-[#ffd8b8]/60">
                    <span className="text-[10px] text-[#6c7178]">Framing Position</span>
                    <button
                      onClick={() => setMosaicPan((prev) => ({ ...prev, [selectedMosaicPhotoId]: { x: 0, y: 0 } }))}
                      className="text-[10px] text-[#e65100] hover:underline"
                    >
                      Center Photo
                    </button>
                  </div>
                  <p className="text-[9px] text-[#8a9199]">
                    Click & drag photo on canvas to pan framing
                  </p>
                </div>
              )}

              {/* Cell Ordering List */}
              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                {mosaicPhotos.map((photo, i) => (
                  <div 
                    key={photo.id}
                    onClick={() => setSelectedMosaicPhotoId(photo.id)}
                    className={`flex items-center justify-between p-1.5 rounded cursor-pointer border text-[11px] transition-colors ${
                      selectedMosaicPhotoId === photo.id
                        ? 'bg-[#fff0e6] border-[#e65100]'
                        : 'bg-white border-[#e0e2e6] hover:bg-[#f0f2f5]'
                    }`}
                  >
                    <span className="truncate max-w-[120px] text-[#2e3436] font-medium">
                      {i + 1}. {photo.filename}
                    </span>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSwapMosaic(i, i - 1);
                        }}
                        disabled={i === 0}
                        className="p-1 rounded hover:bg-[#f0f2f5] disabled:opacity-30 text-[#5e656d]"
                        title="Move Up"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSwapMosaic(i, i + 1);
                        }}
                        disabled={i === mosaicPhotos.length - 1}
                        className="p-1 rounded hover:bg-[#f0f2f5] disabled:opacity-30 text-[#5e656d]"
                        title="Move Down"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Canvas Size Presets */}
          <div className="space-y-2">
            <span className="font-semibold text-[#2e3436]">Canvas Dimensions</span>
            <div className="grid grid-cols-1 gap-1.5">
              {CANVAS_PRESETS.map((p) => (
                <button
                  key={p.name}
                  onClick={() => handleSelectPreset(p)}
                  className={`px-3 py-2 rounded-md text-left flex justify-between items-center border transition-colors ${
                    presetName === p.name
                      ? 'bg-[#fff0e6] border-[#e65100] text-[#e65100] font-medium shadow-xs'
                      : 'bg-[#f8f9fa] border-[#e0e2e6] text-[#4a5056] hover:bg-[#f0f2f5]'
                  }`}
                >
                  <span>{p.name}</span>
                  <span className="text-[10px] font-mono opacity-60">{p.width}×{p.height}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Background Color (Default Transparent for Mosaic) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-[#2e3436]">Background Color</span>
              <span className="text-[10px] font-mono text-[#6c7178]">
                {bgColor === 'transparent' ? 'Transparent' : bgColor}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {BG_COLOR_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setBgColor(c)}
                  style={{
                    backgroundColor: c === 'transparent' ? 'transparent' : c,
                    backgroundImage: c === 'transparent'
                      ? 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)'
                      : 'none',
                    backgroundSize: '8px 8px',
                    backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px',
                  }}
                  title={c === 'transparent' ? 'Transparent' : c}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    bgColor === c ? 'scale-110 border-[#e65100]' : 'border-black/15 hover:scale-105'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Borders & Shadows */}
          <div className="space-y-3 bg-[#f8f9fa] p-3 rounded-md border border-[#e0e2e6]">
            <span className="font-semibold text-[#2e3436]">Photo Styling</span>
            
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-[#4a5056]">White Photo Borders</span>
              <input
                type="checkbox"
                checked={hasBorder}
                onChange={(e) => setHasBorder(e.target.checked)}
                className="w-4 h-4 rounded accent-[#e65100]"
              />
            </label>

            {hasBorder && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-[#6c7178]">
                  <span>Border Width</span>
                  <span>{borderWidth}px</span>
                </div>
                <input
                  type="range"
                  min={4}
                  max={32}
                  value={borderWidth}
                  onChange={(e) => setBorderWidth(Number(e.target.value))}
                  className="w-full h-1 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                />
              </div>
            )}

            {collageType === 'pile' && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-[#6c7178]">
                  <span>Drop Shadow</span>
                  <span>{shadowBlur}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={shadowBlur}
                  onChange={(e) => setShadowBlur(Number(e.target.value))}
                  className="w-full h-1 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                />
              </div>
            )}

            {collageType === 'mosaic' && (
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] text-[#6c7178]">
                  <span>Gutter Spacing</span>
                  <span>{gutter}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={40}
                  value={gutter}
                  onChange={(e) => setGutter(Number(e.target.value))}
                  className="w-full h-1 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                />
              </div>
            )}
          </div>
        </aside>

        {/* Center Canvas Preview & Interactivity */}
        <div className="flex-1 bg-[#18191e] p-6 flex items-center justify-center overflow-hidden relative">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              touchAction: 'none',
              backgroundImage: bgColor === 'transparent'
                ? 'linear-gradient(45deg, #28292e 25%, transparent 25%), linear-gradient(-45deg, #28292e 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #28292e 75%), linear-gradient(-45deg, transparent 75%, #28292e 75%)'
                : 'none',
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
              backgroundColor: bgColor === 'transparent' ? '#1e1f24' : undefined,
            }}
            className={`max-w-full max-h-full object-contain shadow-2xl drop-shadow-[0_25px_50px_rgba(0,0,0,0.8)] rounded-sm border border-white/10 ${
              isPanningMosaic ? 'cursor-grabbing' : 'cursor-pointer'
            }`}
          />
        </div>
      </div>
    </div>
  );
};
