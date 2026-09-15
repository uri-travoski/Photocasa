import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  X, Undo2, Redo2, RotateCcw, Save, Download, Sparkles, 
  Crop, Check, Trash2, Sun, Moon, Type, ArrowRight, RotateCw
} from 'lucide-react';
import type { Photo, PhotoAdjustments, PhotoTextItem, PhotoArrowItem } from '../../types';
import { getPhotoSrc, apiGetPhotoDataUrl, isTauri } from '../../utils/api';
import { 
  renderAdjustedCanvas, 
  generateThumbnailDataUrl 
} from '../../utils/canvasRenderer';

interface EditorContainerProps {
  photo: Photo;
  onClose: () => void;
  onSave: (photoId: number, adjustments: PhotoAdjustments, thumbnailDataBase64?: string) => void;
  onExport: (photo: Photo, customImageDataUrl?: string) => void;
}

const DEFAULT_ADJUSTMENTS: PhotoAdjustments = {
  exposure: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  warmth: 0,
  tint: 0,
  saturation: 0,
  sepia: 0,
  blackAndWhite: false,
  vignette: 0,
  grain: 0,
  glow: 0,
  straighten: 0,
  crop: undefined,
};

type AspectPreset =
  | 'Freeform'
  | '1:1 Square'
  | '4:6 Print'
  | '5:7 Frame'
  | '8:10 Frame'
  | '4:3 Standard'
  | '16:9 Cinema';

interface AspectPresetItem {
  id: AspectPreset;
  label: string;
  ratioLand: string;
  ratioPort: string;
}

const ASPECT_PRESETS: AspectPresetItem[] = [
  { id: 'Freeform', label: 'Freeform', ratioLand: 'Custom', ratioPort: 'Custom' },
  { id: '1:1 Square', label: '1:1 Square', ratioLand: '1:1', ratioPort: '1:1' },
  { id: '4:6 Print', label: '4x6 Print', ratioLand: '6:4 (3:2)', ratioPort: '4:6 (2:3)' },
  { id: '5:7 Frame', label: '5x7 Frame', ratioLand: '7:5', ratioPort: '5:7' },
  { id: '8:10 Frame', label: '8x10 Frame', ratioLand: '10:8 (5:4)', ratioPort: '8:10 (4:5)' },
  { id: '4:3 Standard', label: '4:3 Standard', ratioLand: '4:3', ratioPort: '3:4' },
  { id: '16:9 Cinema', label: '16:9 Cinema', ratioLand: '16:9', ratioPort: '9:16' },
];

const getTargetRatio = (
  preset: AspectPreset,
  orientation: 'landscape' | 'portrait'
): number | null => {
  if (preset === 'Freeform') return null;
  if (preset === '1:1 Square') return 1.0;

  const isLand = orientation === 'landscape';

  switch (preset) {
    case '4:6 Print':
      // 4x6 / 6x4: 3:2 (1.5) in landscape, 2:3 (~0.6667) in portrait
      return isLand ? 3 / 2 : 2 / 3;
    case '5:7 Frame':
      // 5x7 / 7x5: 7:5 (1.4) in landscape, 5:7 (~0.7143) in portrait
      return isLand ? 7 / 5 : 5 / 7;
    case '8:10 Frame':
      // 8x10 / 10x8: 5:4 (1.25) in landscape, 4:5 (0.8) in portrait
      return isLand ? 5 / 4 : 4 / 5;
    case '4:3 Standard':
      // 4:3 (~1.3333) in landscape, 3:4 (0.75) in portrait
      return isLand ? 4 / 3 : 3 / 4;
    case '16:9 Cinema':
      // 16:9 (~1.7778) in landscape, 9:16 (0.5625) in portrait
      return isLand ? 16 / 9 : 9 / 16;
    default:
      return null;
  }
};

export const EditorContainer: React.FC<EditorContainerProps> = ({
  photo,
  onClose,
  onSave,
  onExport,
}) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'tuning' | 'effects'>('basic');
  const [adj, setAdj] = useState<PhotoAdjustments>(photo.adjustments || DEFAULT_ADJUSTMENTS);
  const [history, setHistory] = useState<PhotoAdjustments[]>([photo.adjustments || DEFAULT_ADJUSTMENTS]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Cropping Tool State
  const [isCropping, setIsCropping] = useState<boolean>(false);
  const [cropAspect, setCropAspect] = useState<AspectPreset>('Freeform');
  const [cropOrientation, setCropOrientation] = useState<'landscape' | 'portrait'>(
    (photo.width || 1000) >= (photo.height || 1000) ? 'landscape' : 'portrait'
  );
  const [cropBox, setCropBox] = useState<{ x: number; y: number; width: number; height: number }>({
    x: 0.05,
    y: 0.05,
    width: 0.9,
    height: 0.9,
  });
  const [cropDragMode, setCropDragMode] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState<{
    clientX: number;
    clientY: number;
    box: { x: number; y: number; width: number; height: number };
  } | null>(null);

  // Text Tool State
  const [textItems, setTextItems] = useState<PhotoTextItem[]>([]);
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null);

  // Arrow Annotation Tool State
  const [arrowItems, setArrowItems] = useState<PhotoArrowItem[]>([]);
  const [selectedArrowId, setSelectedArrowId] = useState<string | null>(null);

  // Interactive Drag for Text and Arrows on Canvas
  const [overlayDrag, setOverlayDrag] = useState<{
    type: 'text' | 'arrow-start' | 'arrow-end' | 'arrow-move';
    id: string;
    startClientX: number;
    startClientY: number;
    initialPos: any;
  } | null>(null);

  const previewParentRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const originalImageRef = useRef<HTMLImageElement | null>(null);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Auto Improve Slider State
  const [autoImproveVal, setAutoImproveVal] = useState<number>(0);
  const baseAdjRef = useRef<PhotoAdjustments>(photo.adjustments || DEFAULT_ADJUSTMENTS);
  const autoImproveDeltasRef = useRef<{
    exposure: number;
    contrast: number;
    highlights: number;
    shadows: number;
    warmth: number;
    tint: number;
    saturation: number;
  }>({
    exposure: 18,
    contrast: 24,
    highlights: -18,
    shadows: 32,
    warmth: 6,
    tint: 0,
    saturation: 22,
  });

  // Compute exact display dimensions of canvas to avoid letterbox gaps and distortion
  const updateDisplaySize = useCallback(() => {
    const parent = previewParentRef.current;
    const img = originalImageRef.current;
    if (!parent || !img) return;

    const rect = parent.getBoundingClientRect();
    const availW = Math.max(100, rect.width - 48);
    const availH = Math.max(100, rect.height - 48);

    const naturalW = img.naturalWidth || photo.width || 1000;
    const naturalH = img.naturalHeight || photo.height || 1000;

    // During active cropping, size according to the uncropped image
    const effectiveCrop = (!isCropping && adj.crop) ? adj.crop : null;
    const currentW = effectiveCrop ? Math.max(1, Math.round(effectiveCrop.width * naturalW)) : naturalW;
    const currentH = effectiveCrop ? Math.max(1, Math.round(effectiveCrop.height * naturalH)) : naturalH;

    const imgAspect = currentW / (currentH || 1);
    const availAspect = availW / (availH || 1);

    let dw = availW;
    let dh = availH;
    if (imgAspect > availAspect) {
      dw = availW;
      dh = Math.round(availW / imgAspect);
    } else {
      dh = availH;
      dw = Math.round(availH * imgAspect);
    }

    setDisplaySize({ width: Math.round(dw), height: Math.round(dh) });
  }, [photo, adj.crop, isCropping]);

  useEffect(() => {
    updateDisplaySize();
    const parent = previewParentRef.current;
    if (!parent) return;

    const observer = new ResizeObserver(() => {
      updateDisplaySize();
    });
    observer.observe(parent);

    return () => observer.disconnect();
  }, [updateDisplaySize]);

  // Load image into memory for real-time canvas processing
  useEffect(() => {
    let active = true;
    const loadImage = async () => {
      let src = getPhotoSrc(photo, true);
      // In Tauri, retrieve photo as base64 data URL to completely prevent tainted canvas SecurityError in WebKitGTK
      if (isTauri && photo.id) {
        try {
          const dataUrl = await apiGetPhotoDataUrl(photo.id, true);
          if (dataUrl) src = dataUrl;
        } catch (e) {
          console.warn('Failed get_photo_data_url in editor, falling back', e);
        }
      }

      if (!active) return;
      const img = new Image();
      if (src.startsWith('http://') || src.startsWith('https://')) {
        img.crossOrigin = 'anonymous';
      }
      img.src = src;
      img.onload = () => {
        if (!active) return;
        originalImageRef.current = img;
        computeAutoImproveDeltas(img);
        updateDisplaySize();
        renderCanvas(adj);
      };
    };

    loadImage();
    return () => {
      active = false;
    };
  }, [photo.id, photo.path]);

  // Update canvas whenever adjustments, tools or items change
  useEffect(() => {
    renderCanvas(adj);
  }, [adj, isCropping, textItems, arrowItems, selectedTextId, selectedArrowId]);

  const updateAdjustment = <K extends keyof PhotoAdjustments>(key: K, value: PhotoAdjustments[K]) => {
    const next = { ...adj, [key]: value };
    setAdj(next);
    baseAdjRef.current = { ...baseAdjRef.current, [key]: value };

    // Push to history
    const newHist = history.slice(0, historyIndex + 1);
    newHist.push(next);
    setHistory(newHist);
    setHistoryIndex(newHist.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      setAdj(prev);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      setAdj(next);
    }
  };

  const handleReset = () => {
    setAdj(DEFAULT_ADJUSTMENTS);
    baseAdjRef.current = DEFAULT_ADJUSTMENTS;
    setAutoImproveVal(0);
    setHistory([DEFAULT_ADJUSTMENTS]);
    setHistoryIndex(0);
    setIsCropping(false);
    setTextItems([]);
    setArrowItems([]);
    setSelectedTextId(null);
    setSelectedArrowId(null);
  };

  // Analyze image histogram to compute balanced Auto Improve target deltas
  const computeAutoImproveDeltas = (img: HTMLImageElement) => {
    try {
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = 100;
      sampleCanvas.height = 100;
      const sCtx = sampleCanvas.getContext('2d');
      if (!sCtx) return;

      sCtx.drawImage(img, 0, 0, 100, 100);
      const imgData = sCtx.getImageData(0, 0, 100, 100).data;

      let totalR = 0, totalG = 0, totalB = 0;
      let totalL = 0;
      const pixelCount = 100 * 100;
      const lums: number[] = [];

      for (let i = 0; i < imgData.length; i += 4) {
        const r = imgData[i];
        const g = imgData[i + 1];
        const b = imgData[i + 2];
        totalR += r;
        totalG += g;
        totalB += b;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        totalL += lum;
        lums.push(lum);
      }

      const avgR = totalR / pixelCount;
      const avgG = totalG / pixelCount;
      const avgB = totalB / pixelCount;
      const avgL = totalL / pixelCount;

      lums.sort((a, b) => a - b);
      const p5 = lums[Math.floor(pixelCount * 0.05)];
      const p95 = lums[Math.floor(pixelCount * 0.95)];
      const dynamicRange = p95 - p5;

      let targetExp = 18;
      if (avgL < 115) {
        targetExp = Math.min(28, Math.round((125 - avgL) * 0.40));
      } else if (avgL > 165) {
        targetExp = Math.max(-16, Math.round((150 - avgL) * 0.32));
      }

      let targetContrast = 24;
      if (dynamicRange < 180) {
        targetContrast = Math.min(32, Math.max(16, Math.round((190 - dynamicRange) * 0.26)));
      }

      let targetShadows = 32;
      if (p5 < 50) {
        targetShadows = Math.min(42, Math.max(20, Math.round((60 - p5) * 0.60)));
      }

      let targetWarmth = 6;
      let targetTint = 0;
      if (avgB > avgR + 8) {
        targetWarmth = Math.min(16, Math.round((avgB - avgR) * 0.50));
      } else if (avgR > avgB + 15) {
        targetWarmth = Math.max(-12, Math.round((avgB - avgR) * 0.35));
      }

      if (avgG < (avgR + avgB) / 2 - 8) {
        targetTint = -5;
      } else if (avgG > (avgR + avgB) / 2 + 12) {
        targetTint = 5;
      }

      autoImproveDeltasRef.current = {
        exposure: targetExp,
        contrast: targetContrast,
        highlights: -18,
        shadows: targetShadows,
        warmth: targetWarmth,
        tint: targetTint,
        saturation: 22,
      };
    } catch {
      // ignore
    }
  };

  // Smooth Auto Improve slider adjustment (0% to 100%)
  const handleAutoImproveChange = (val: number) => {
    setAutoImproveVal(val);
    const factor = val / 100;
    const base = baseAdjRef.current;
    const d = autoImproveDeltasRef.current;

    const nextAdj: PhotoAdjustments = {
      ...adj,
      exposure: Math.round(base.exposure + d.exposure * factor),
      contrast: Math.round(base.contrast + d.contrast * factor),
      highlights: Math.round(base.highlights + d.highlights * factor),
      shadows: Math.round(base.shadows + d.shadows * factor),
      warmth: Math.round(base.warmth + d.warmth * factor),
      tint: Math.round(base.tint + d.tint * factor),
      saturation: Math.round(base.saturation + d.saturation * factor),
    };

    setAdj(nextAdj);
  };

  // Commit auto-improve slider value to history on release
  const handleAutoImproveCommit = (val: number) => {
    const factor = val / 100;
    const base = baseAdjRef.current;
    const d = autoImproveDeltasRef.current;

    const nextAdj: PhotoAdjustments = {
      ...adj,
      exposure: Math.round(base.exposure + d.exposure * factor),
      contrast: Math.round(base.contrast + d.contrast * factor),
      highlights: Math.round(base.highlights + d.highlights * factor),
      shadows: Math.round(base.shadows + d.shadows * factor),
      warmth: Math.round(base.warmth + d.warmth * factor),
      tint: Math.round(base.tint + d.tint * factor),
      saturation: Math.round(base.saturation + d.saturation * factor),
    };

    setAdj(nextAdj);
    const newHist = history.slice(0, historyIndex + 1);
    newHist.push(nextAdj);
    setHistory(newHist);
    setHistoryIndex(newHist.length - 1);
  };

  // Canvas rendering pipeline
  const renderCanvas = useCallback((currentAdj: PhotoAdjustments) => {
    const canvas = canvasRef.current;
    const img = originalImageRef.current;
    if (!canvas || !img) return;

    // During active cropping, render the full uncropped image so the user can position the crop box freely over the whole photo!
    const effectiveAdj = isCropping ? { ...currentAdj, crop: undefined } : currentAdj;

    renderAdjustedCanvas(
      canvas,
      img,
      effectiveAdj,
      textItems,
      arrowItems,
      selectedTextId,
      selectedArrowId,
      true,
      1600
    );
  }, [textItems, arrowItems, selectedTextId, selectedArrowId, isCropping]);

  // Crop Controls
  const handleStartCrop = (preset: AspectPreset) => {
    setCropAspect(preset);
    setIsCropping(true);

    const img = originalImageRef.current;
    const naturalW = img?.naturalWidth || photo.width || 1000;
    const naturalH = img?.naturalHeight || photo.height || 1000;

    let orientation = cropOrientation;
    if (!isCropping) {
      orientation = naturalW >= naturalH ? 'landscape' : 'portrait';
      setCropOrientation(orientation);
    }

    const targetRatio = getTargetRatio(preset, orientation);

    let pixelW: number;
    let pixelH: number;

    if (targetRatio === null) {
      if (adj.crop) {
        setCropBox({ ...adj.crop });
        return;
      }
      pixelW = naturalW * 0.85;
      pixelH = naturalH * 0.85;
    } else {
      if (targetRatio > naturalW / naturalH) {
        pixelW = naturalW * 0.85;
        pixelH = pixelW / targetRatio;
      } else {
        pixelH = naturalH * 0.85;
        pixelW = pixelH * targetRatio;
      }
    }

    const pixelX = (naturalW - pixelW) / 2;
    const pixelY = (naturalH - pixelH) / 2;

    setCropBox({
      x: Math.max(0, pixelX / naturalW),
      y: Math.max(0, pixelY / naturalH),
      width: Math.min(1, pixelW / naturalW),
      height: Math.min(1, pixelH / naturalH),
    });
  };

  const handleRotateCrop = () => {
    const img = originalImageRef.current;
    const naturalW = img?.naturalWidth || photo.width || 1000;
    const naturalH = img?.naturalHeight || photo.height || 1000;

    const nextOrientation = cropOrientation === 'landscape' ? 'portrait' : 'landscape';
    setCropOrientation(nextOrientation);

    if (!isCropping) {
      setIsCropping(true);
    }

    const targetRatio = getTargetRatio(cropAspect, nextOrientation);

    const cx = cropBox.x + cropBox.width / 2;
    const cy = cropBox.y + cropBox.height / 2;

    let pixelW: number;
    let pixelH: number;

    if (targetRatio !== null) {
      const curArea = (cropBox.width * naturalW) * (cropBox.height * naturalH);
      let candH = Math.sqrt(curArea / targetRatio);
      let candW = candH * targetRatio;

      if (candW > naturalW * 0.95) {
        candW = naturalW * 0.95;
        candH = candW / targetRatio;
      }
      if (candH > naturalH * 0.95) {
        candH = naturalH * 0.95;
        candW = candH * targetRatio;
      }

      pixelW = candW;
      pixelH = candH;
    } else {
      let curPixelW = cropBox.width * naturalW;
      let curPixelH = cropBox.height * naturalH;
      pixelW = curPixelH;
      pixelH = curPixelW;

      if (pixelW > naturalW * 0.95) {
        const s = (naturalW * 0.95) / pixelW;
        pixelW *= s;
        pixelH *= s;
      }
      if (pixelH > naturalH * 0.95) {
        const s = (naturalH * 0.95) / pixelH;
        pixelW *= s;
        pixelH *= s;
      }
    }

    const normW = pixelW / naturalW;
    const normH = pixelH / naturalH;

    const newX = Math.max(0, Math.min(1 - normW, cx - normW / 2));
    const newY = Math.max(0, Math.min(1 - normH, cy - normH / 2));

    setCropBox({
      x: newX,
      y: newY,
      width: normW,
      height: normH,
    });
  };

  const handleApplyCrop = () => {
    updateAdjustment('crop', cropBox);
    setIsCropping(false);
  };

  const handleResetCrop = () => {
    updateAdjustment('crop', undefined);
    setIsCropping(false);
  };

  const handleCancelCrop = () => {
    setIsCropping(false);
    if (adj.crop) {
      setCropBox({ ...adj.crop });
    }
  };

  // Crop Pointer Events
  const handleCropPointerDown = (e: React.PointerEvent, mode: string) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setCropDragMode(mode);
    setDragStart({
      clientX: e.clientX,
      clientY: e.clientY,
      box: { ...cropBox },
    });
  };

  const handleCropPointerMove = (e: React.PointerEvent) => {
    if (!cropDragMode || !dragStart || !canvasContainerRef.current) return;
    const container = canvasContainerRef.current.getBoundingClientRect();
    if (container.width === 0 || container.height === 0) return;

    const img = originalImageRef.current;
    const naturalW = img?.naturalWidth || photo.width || 1000;
    const naturalH = img?.naturalHeight || photo.height || 1000;

    const dxNorm = (e.clientX - dragStart.clientX) / container.width;
    const dyNorm = (e.clientY - dragStart.clientY) / container.height;
    const b = dragStart.box;

    if (cropDragMode === 'move') {
      const newX = Math.max(0, Math.min(1 - b.width, b.x + dxNorm));
      const newY = Math.max(0, Math.min(1 - b.height, b.y + dyNorm));
      setCropBox({ ...b, x: newX, y: newY });
      return;
    }

    const targetRatio = getTargetRatio(cropAspect, cropOrientation);

    if (targetRatio === null) {
      let x1 = b.x;
      let y1 = b.y;
      let x2 = b.x + b.width;
      let y2 = b.y + b.height;

      if (cropDragMode.includes('w')) x1 = Math.max(0, Math.min(x2 - 0.05, b.x + dxNorm));
      if (cropDragMode.includes('e')) x2 = Math.min(1, Math.max(x1 + 0.05, b.x + b.width + dxNorm));
      if (cropDragMode.includes('n')) y1 = Math.max(0, Math.min(y2 - 0.05, b.y + dyNorm));
      if (cropDragMode.includes('s')) y2 = Math.min(1, Math.max(y1 + 0.05, b.y + b.height + dyNorm));

      setCropBox({
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y2 - y1,
      });
      return;
    }

    // Ratio-constrained resizing in image pixel space:
    const minPixelSize = 40;

    if (cropDragMode === 'se') {
      const anchorX = b.x * naturalW;
      const anchorY = b.y * naturalH;
      const maxW = naturalW - anchorX;
      const maxH = naturalH - anchorY;

      const desiredW = b.width * naturalW + dxNorm * naturalW;
      const desiredH = b.height * naturalH + dyNorm * naturalH;
      let newW = (desiredW + desiredH * targetRatio) / 2;
      let newH = newW / targetRatio;

      if (newW > maxW) {
        newW = maxW;
        newH = newW / targetRatio;
      }
      if (newH > maxH) {
        newH = maxH;
        newW = newH * targetRatio;
      }
      newW = Math.max(minPixelSize, newW);
      newH = newW / targetRatio;

      setCropBox({
        x: b.x,
        y: b.y,
        width: newW / naturalW,
        height: newH / naturalH,
      });
    } else if (cropDragMode === 'nw') {
      const anchorX = (b.x + b.width) * naturalW;
      const anchorY = (b.y + b.height) * naturalH;

      const desiredW = b.width * naturalW - dxNorm * naturalW;
      const desiredH = b.height * naturalH - dyNorm * naturalH;
      let newW = (desiredW + desiredH * targetRatio) / 2;
      let newH = newW / targetRatio;

      if (newW > anchorX) {
        newW = anchorX;
        newH = newW / targetRatio;
      }
      if (newH > anchorY) {
        newH = anchorY;
        newW = newH * targetRatio;
      }
      newW = Math.max(minPixelSize, newW);
      newH = newW / targetRatio;

      setCropBox({
        x: (anchorX - newW) / naturalW,
        y: (anchorY - newH) / naturalH,
        width: newW / naturalW,
        height: newH / naturalH,
      });
    } else if (cropDragMode === 'ne') {
      const anchorX = b.x * naturalW;
      const anchorY = (b.y + b.height) * naturalH;
      const maxW = naturalW - anchorX;

      const desiredW = b.width * naturalW + dxNorm * naturalW;
      const desiredH = b.height * naturalH - dyNorm * naturalH;
      let newW = (desiredW + desiredH * targetRatio) / 2;
      let newH = newW / targetRatio;

      if (newW > maxW) {
        newW = maxW;
        newH = newW / targetRatio;
      }
      if (newH > anchorY) {
        newH = anchorY;
        newW = newH * targetRatio;
      }
      newW = Math.max(minPixelSize, newW);
      newH = newW / targetRatio;

      setCropBox({
        x: b.x,
        y: (anchorY - newH) / naturalH,
        width: newW / naturalW,
        height: newH / naturalH,
      });
    } else if (cropDragMode === 'sw') {
      const anchorX = (b.x + b.width) * naturalW;
      const anchorY = b.y * naturalH;
      const maxH = naturalH - anchorY;

      const desiredW = b.width * naturalW - dxNorm * naturalW;
      const desiredH = b.height * naturalH + dyNorm * naturalH;
      let newW = (desiredW + desiredH * targetRatio) / 2;
      let newH = newW / targetRatio;

      if (newW > anchorX) {
        newW = anchorX;
        newH = newW / targetRatio;
      }
      if (newH > maxH) {
        newH = maxH;
        newW = newH * targetRatio;
      }
      newW = Math.max(minPixelSize, newW);
      newH = newW / targetRatio;

      setCropBox({
        x: (anchorX - newW) / naturalW,
        y: b.y,
        width: newW / naturalW,
        height: newH / naturalH,
      });
    } else if (cropDragMode === 'e' || cropDragMode === 'w') {
      const cy = (b.y + b.height / 2) * naturalH;
      let newW = (b.width + (cropDragMode === 'e' ? dxNorm : -dxNorm)) * naturalW;
      let newH = newW / targetRatio;

      if (cy - newH / 2 < 0) {
        newH = cy * 2;
        newW = newH * targetRatio;
      }
      if (cy + newH / 2 > naturalH) {
        newH = (naturalH - cy) * 2;
        newW = newH * targetRatio;
      }
      if (cropDragMode === 'e' && b.x * naturalW + newW > naturalW) {
        newW = naturalW - b.x * naturalW;
        newH = newW / targetRatio;
      }
      if (cropDragMode === 'w' && (b.x + b.width) * naturalW - newW < 0) {
        newW = (b.x + b.width) * naturalW;
        newH = newW / targetRatio;
      }

      newW = Math.max(minPixelSize, newW);
      newH = newW / targetRatio;

      const newX = cropDragMode === 'e' ? b.x * naturalW : (b.x + b.width) * naturalW - newW;
      setCropBox({
        x: Math.max(0, newX / naturalW),
        y: Math.max(0, (cy - newH / 2) / naturalH),
        width: newW / naturalW,
        height: newH / naturalH,
      });
    } else if (cropDragMode === 'n' || cropDragMode === 's') {
      const cx = (b.x + b.width / 2) * naturalW;
      let newH = (b.height + (cropDragMode === 's' ? dyNorm : -dyNorm)) * naturalH;
      let newW = newH * targetRatio;

      if (cx - newW / 2 < 0) {
        newW = cx * 2;
        newH = newW / targetRatio;
      }
      if (cx + newW / 2 > naturalW) {
        newW = (naturalW - cx) * 2;
        newH = newW / targetRatio;
      }
      if (cropDragMode === 's' && b.y * naturalH + newH > naturalH) {
        newH = naturalH - b.y * naturalH;
        newW = newH * targetRatio;
      }
      if (cropDragMode === 'n' && (b.y + b.height) * naturalH - newH < 0) {
        newH = (b.y + b.height) * naturalH;
        newW = newH * targetRatio;
      }

      newH = Math.max(minPixelSize, newH);
      newW = newH * targetRatio;

      const newY = cropDragMode === 's' ? b.y * naturalH : (b.y + b.height) * naturalH - newH;
      setCropBox({
        x: Math.max(0, (cx - newW / 2) / naturalW),
        y: Math.max(0, newY / naturalH),
        width: newW / naturalW,
        height: newH / naturalH,
      });
    }
  };

  const handleCropPointerUp = (e: React.PointerEvent) => {
    if (cropDragMode) {
      setCropDragMode(null);
      setDragStart(null);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  // Text Tool Handlers
  const handleAddText = () => {
    const canvas = canvasRef.current;
    const cw = canvas?.width || 800;
    const ch = canvas?.height || 600;
    const newItem: PhotoTextItem = {
      id: `text-${Date.now()}`,
      text: 'Add title here',
      x: Math.round(cw * 0.15),
      y: Math.round(ch * 0.4),
      fontSize: Math.max(28, Math.round(cw * 0.045)),
      color: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      fontFamily: 'IBM Plex Sans',
    };
    setTextItems((prev) => [...prev, newItem]);
    setSelectedTextId(newItem.id);
    setSelectedArrowId(null);
  };

  // Arrow Tool Handlers
  const handleAddArrow = () => {
    const canvas = canvasRef.current;
    const cw = canvas?.width || 800;
    const ch = canvas?.height || 600;
    const newArrow: PhotoArrowItem = {
      id: `arrow-${Date.now()}`,
      startX: Math.round(cw * 0.25),
      startY: Math.round(ch * 0.25),
      endX: Math.round(cw * 0.55),
      endY: Math.round(ch * 0.55),
      color: '#e65100',
      width: 6,
    };
    setArrowItems((prev) => [...prev, newArrow]);
    setSelectedArrowId(newArrow.id);
    setSelectedTextId(null);
  };

  // Interactive Drag on Canvas for Text & Arrows
  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isCropping) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    // 1. Test Text items
    for (let i = textItems.length - 1; i >= 0; i--) {
      const item = textItems[i];
      const approxW = Math.max(80, item.text.length * item.fontSize * 0.65);
      const approxH = item.fontSize * 1.4;
      if (mx >= item.x - 10 && mx <= item.x + approxW + 10 && my >= item.y - 10 && my <= item.y + approxH + 10) {
        setSelectedTextId(item.id);
        setSelectedArrowId(null);
        setOverlayDrag({
          type: 'text',
          id: item.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          initialPos: { x: item.x, y: item.y },
        });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
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
        setOverlayDrag({
          type: 'arrow-end',
          id: arrow.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          initialPos: { x: arrow.endX, y: arrow.endY },
        });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      if (distStart <= 26) {
        setSelectedArrowId(arrow.id);
        setSelectedTextId(null);
        setOverlayDrag({
          type: 'arrow-start',
          id: arrow.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          initialPos: { x: arrow.startX, y: arrow.startY },
        });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }

      // Midpoint shaft drag
      const midX = (arrow.startX + arrow.endX) / 2;
      const midY = (arrow.startY + arrow.endY) / 2;
      if (Math.hypot(mx - midX, my - midY) <= 30) {
        setSelectedArrowId(arrow.id);
        setSelectedTextId(null);
        setOverlayDrag({
          type: 'arrow-move',
          id: arrow.id,
          startClientX: e.clientX,
          startClientY: e.clientY,
          initialPos: { ...arrow },
        });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        return;
      }
    }

    setSelectedTextId(null);
    setSelectedArrowId(null);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!overlayDrag || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
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
      setArrowItems((prev) =>
        prev.map((arrow) =>
          arrow.id === overlayDrag.id
            ? {
                ...arrow,
                startX: Math.round(overlayDrag.initialPos.startX + dx),
                startY: Math.round(overlayDrag.initialPos.startY + dy),
                endX: Math.round(overlayDrag.initialPos.endX + dx),
                endY: Math.round(overlayDrag.initialPos.endY + dy),
              }
            : arrow
        )
      );
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (overlayDrag) {
      setOverlayDrag(null);
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
  };

  // Helper to bake all adjustments, text, and arrows into a clean export buffer
  const getBakedCanvasDataUrl = (format = 'image/jpeg', quality = 0.95): string => {
    const canvas = canvasRef.current;
    const img = originalImageRef.current;
    if (!canvas || !img) return '';

    const exportCanvas = document.createElement('canvas');
    renderAdjustedCanvas(
      exportCanvas,
      img,
      adj,
      textItems,
      arrowItems,
      null,
      null,
      true // bake pixel filters!
    );
    return exportCanvas.toDataURL(format, quality);
  };

  const handleExportClick = () => {
    const dataUrl = getBakedCanvasDataUrl('image/jpeg', 0.95);
    onExport(photo, dataUrl);
  };

  const handleSaveClick = () => {
    const canvas = canvasRef.current;
    let thumbDataUrl: string | undefined = undefined;
    if (canvas) {
      const exportCanvas = document.createElement('canvas');
      const img = originalImageRef.current;
      if (img) {
        renderAdjustedCanvas(exportCanvas, img, adj, textItems, arrowItems, null, null, true);
        thumbDataUrl = generateThumbnailDataUrl(exportCanvas, adj, 360, 0.88);
      }
    }
    onSave(photo.id, adj, thumbDataUrl);
    onClose();
  };

  const selectedText = textItems.find((t) => t.id === selectedTextId);
  const selectedArrow = arrowItems.find((a) => a.id === selectedArrowId);

  return (
    <div className="fixed inset-0 z-50 bg-[#1e1e24] flex flex-col select-none animate-in fade-in duration-150">
      {/* Top Application Header */}
      <header className="h-12 px-4 bg-white border-b border-[#dcdcdc] flex items-center justify-between z-20 text-[#2e3436]">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-[#f0f2f5] text-[#5e656d] hover:text-[#2e3436] transition-colors border border-transparent hover:border-[#dcdcdc]"
            title="Cancel & Close"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex flex-col">
            <span className="font-semibold text-xs text-[#2e3436] truncate max-w-xs">{photo.filename}</span>
            <span className="text-[10px] text-[#6c7178]">
              {photo.width} × {photo.height} px
            </span>
          </div>
        </div>

        {/* Center History Controls */}
        <div className="flex items-center gap-1 bg-[#f0f2f5] p-1 rounded-md border border-[#dcdcdc]">
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className="p-1.5 rounded hover:bg-[#e4e6eb] disabled:opacity-40 text-[#4a5056] hover:text-[#2e3436] transition-colors"
            title="Undo"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className="p-1.5 rounded hover:bg-[#e4e6eb] disabled:opacity-40 text-[#4a5056] hover:text-[#2e3436] transition-colors"
            title="Redo"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
          <div className="w-px h-4 bg-[#dcdcdc] mx-1" />
          <button
            onClick={handleReset}
            className="px-2 py-1 rounded hover:bg-[#e4e6eb] text-[#4a5056] hover:text-[#2e3436] text-xs flex items-center gap-1 transition-colors"
            title="Reset All Adjustments"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportClick}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#f0f2f5] hover:bg-[#e4e6eb] text-[#2e3436] text-xs font-medium border border-[#dcdcdc] transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export As...</span>
          </button>
          <button
            onClick={handleSaveClick}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-gradient-to-r from-[#ff7710] to-[#e65100] hover:from-[#f06700] hover:to-[#d84315] text-white font-semibold text-xs shadow-md shadow-[#e65100]/20 transition-all active:scale-95"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Adjustments</span>
          </button>
        </div>
      </header>

      {/* Main Body: Canvas Preview + 3-Tab Inspector */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Side 3-Tab Inspector (Picasa Style) */}
        <aside className="w-80 bg-white border-r border-[#dcdcdc] flex flex-col z-10 shrink-0">
          {/* Tab Navigation */}
          <div className="grid grid-cols-3 border-b border-[#e0e2e6] text-xs font-semibold text-[#5e656d]">
            <button
              onClick={() => setActiveTab('basic')}
              className={`py-2.5 text-center border-b-2 transition-all ${
                activeTab === 'basic'
                  ? 'border-[#e65100] text-[#e65100] bg-[#fff0e6]/40'
                  : 'border-transparent hover:text-[#2e3436] hover:bg-[#f8f9fa]'
              }`}
            >
              Basic Fixes
            </button>
            <button
              onClick={() => setActiveTab('tuning')}
              className={`py-2.5 text-center border-b-2 transition-all ${
                activeTab === 'tuning'
                  ? 'border-[#e65100] text-[#e65100] bg-[#fff0e6]/40'
                  : 'border-transparent hover:text-[#2e3436] hover:bg-[#f8f9fa]'
              }`}
            >
              Tuning
            </button>
            <button
              onClick={() => setActiveTab('effects')}
              className={`py-2.5 text-center border-b-2 transition-all ${
                activeTab === 'effects'
                  ? 'border-[#e65100] text-[#e65100] bg-[#fff0e6]/40'
                  : 'border-transparent hover:text-[#2e3436] hover:bg-[#f8f9fa]'
              }`}
            >
              Effects
            </button>
          </div>

          {/* Tab Content Panel */}
          <div className="p-4 space-y-4 overflow-y-auto flex-1 bg-[#fafafa]">
            {/* TAB 1: BASIC FIXES */}
            {activeTab === 'basic' && (
              <div className="space-y-4">
                {/* Auto Improve Slider */}
                <div className="bg-white p-3.5 rounded-md border border-[#e0e2e6] shadow-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2e3436]">
                      <Sparkles className="w-4 h-4 text-[#e65100]" />
                      <span>Auto Improve</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-[#e65100]">
                        {autoImproveVal}%
                      </span>
                      {autoImproveVal > 0 && (
                        <button
                          onClick={() => handleAutoImproveChange(0)}
                          className="text-[10px] text-[#8a9199] hover:text-[#e65100] underline font-medium transition-colors"
                          title="Reset Auto Improve to 0%"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={autoImproveVal}
                    onChange={(e) => handleAutoImproveChange(Number(e.target.value))}
                    onPointerUp={(e) => handleAutoImproveCommit(Number((e.target as HTMLInputElement).value))}
                    className="w-full h-1.5 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                  />
                  <div className="flex justify-between text-[10px] text-[#8a9199] font-mono">
                    <span>Original</span>
                    <span>Balanced (50%)</span>
                    <span>Max</span>
                  </div>
                </div>

                {/* Interactive Crop Section */}
                <div className="bg-white p-3.5 rounded-md border border-[#e0e2e6] shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2e3436]">
                      <Crop className="w-4 h-4 text-[#e65100]" />
                      <span>Crop Photo</span>
                    </div>
                    {adj.crop && !isCropping && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#fff0e6] text-[#e65100] font-medium border border-[#e65100]/30">
                        Cropped
                      </span>
                    )}
                  </div>

                  {isCropping ? (
                    <div className="space-y-2.5 bg-[#fffaf5] p-2.5 rounded border border-[#ffd8b8]">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-[#e65100]">Crop Active</span>
                        <span className="text-[10px] font-mono text-[#6c7178]">
                          {cropOrientation === 'landscape' ? 'Landscape' : 'Portrait'}
                        </span>
                      </div>

                      {/* Aspect Presets Grid while cropping */}
                      <div className="grid grid-cols-3 gap-1.5 text-xs">
                        {ASPECT_PRESETS.map((p) => {
                          const isActive = cropAspect === p.id;
                          const ratioDesc = cropOrientation === 'landscape' ? p.ratioLand : p.ratioPort;
                          return (
                            <button
                              key={p.id}
                              onClick={() => handleStartCrop(p.id)}
                              className={`p-1.5 rounded-md text-left flex flex-col transition-colors border ${
                                isActive
                                  ? 'bg-[#e65100] border-[#e65100] text-white shadow-xs'
                                  : 'bg-white border-[#dcdcdc] text-[#4a5056] hover:bg-[#f0f2f5]'
                              }`}
                            >
                              <span className="text-[11px] font-medium leading-tight">{p.label}</span>
                              <span className={`text-[9px] font-mono leading-tight ${isActive ? 'text-white/80' : 'text-[#8a9199]'}`}>
                                {ratioDesc}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={handleApplyCrop}
                          className="flex-1 py-1.5 rounded-md bg-[#e65100] hover:bg-[#d84315] text-white text-xs font-semibold flex items-center justify-center gap-1 shadow-sm transition-all"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Apply</span>
                        </button>
                        <button
                          onClick={handleRotateCrop}
                          className="px-2.5 py-1.5 rounded-md bg-white hover:bg-[#f0f2f5] text-[#e65100] border border-[#dcdcdc] text-xs font-medium flex items-center gap-1 transition-all"
                          title="Rotate Crop Area (Swap Portrait/Landscape)"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                          <span>Rotate</span>
                        </button>
                        <button
                          onClick={handleCancelCrop}
                          className="px-3 py-1.5 rounded-md bg-white hover:bg-[#f0f2f5] text-[#4a5056] text-xs font-medium border border-[#dcdcdc] transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-3 gap-1.5 text-xs">
                        {ASPECT_PRESETS.map((p) => {
                          const ratioDesc = cropOrientation === 'landscape' ? p.ratioLand : p.ratioPort;
                          return (
                            <button
                              key={p.id}
                              onClick={() => handleStartCrop(p.id)}
                              className="p-1.5 rounded-md text-left flex flex-col bg-white border border-[#dcdcdc] text-[#4a5056] hover:bg-[#f0f2f5] transition-colors"
                            >
                              <span className="text-[11px] font-medium leading-tight">{p.label}</span>
                              <span className="text-[9px] font-mono leading-tight text-[#8a9199]">
                                {ratioDesc}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            if (!isCropping) setIsCropping(true);
                            handleRotateCrop();
                          }}
                          className="flex-1 py-1.5 rounded-md bg-[#f0f2f5] hover:bg-[#e4e6eb] text-[#2e3436] border border-[#dcdcdc] text-xs flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <RotateCw className="w-3 h-3 text-[#e65100]" />
                          <span>Rotate Crop Area</span>
                        </button>
                        {adj.crop && (
                          <button
                            onClick={handleResetCrop}
                            className="p-1.5 rounded-md bg-[#f0f2f5] hover:bg-red-50 text-[#5e656d] hover:text-red-600 border border-[#dcdcdc] text-xs flex items-center justify-center transition-colors"
                            title="Reset Crop to Full Photo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Straighten Slider */}
                <div className="bg-white p-3.5 rounded-md border border-[#e0e2e6] shadow-xs space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-medium text-[#2e3436]">Straighten Grid</span>
                    <span className="text-[#6c7178] font-mono">{adj.straighten}°</span>
                  </div>
                  <input
                    type="range"
                    min={-45}
                    max={45}
                    value={adj.straighten}
                    onChange={(e) => updateAdjustment('straighten', Number(e.target.value))}
                    className="w-full h-1.5 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                  />
                  <div className="flex justify-between text-[10px] text-[#8a9199]">
                    <span>-45°</span>
                    <button onClick={() => updateAdjustment('straighten', 0)} className="hover:text-[#e65100]">0° (Reset)</button>
                    <span>+45°</span>
                  </div>
                </div>

                {/* Text Formatting Tool (Item #8) */}
                <div className="bg-white p-3.5 rounded-md border border-[#e0e2e6] shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2e3436]">
                      <Type className="w-4 h-4 text-[#e65100]" />
                      <span>Add Text</span>
                    </div>
                    <button
                      onClick={handleAddText}
                      className="px-2 py-1 rounded bg-[#fff0e6] hover:bg-[#ffe0cc] text-[#e65100] text-[11px] font-semibold border border-[#e65100]/30 transition-colors"
                    >
                      + Add Text
                    </button>
                  </div>

                  {selectedText && (
                    <div className="space-y-2.5 p-2.5 rounded bg-[#f8f9fa] border border-[#e0e2e6] text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[#6c7178]">Text</span>
                        <input
                          type="text"
                          value={selectedText.text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTextItems((prev) =>
                              prev.map((t) => (t.id === selectedText.id ? { ...t, text: val } : t))
                            );
                          }}
                          className="w-full mt-1 p-1.5 border border-[#dcdcdc] rounded bg-white text-xs text-[#2e3436]"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-[#6c7178]">Font</span>
                          <select
                            value={selectedText.fontFamily}
                            onChange={(e) => {
                              const val = e.target.value;
                              setTextItems((prev) =>
                                prev.map((t) => (t.id === selectedText.id ? { ...t, fontFamily: val } : t))
                              );
                            }}
                            className="w-full mt-1 p-1 border border-[#dcdcdc] rounded bg-white text-xs text-[#2e3436]"
                          >
                            <option value="IBM Plex Sans">IBM Plex Sans</option>
                            <option value="Inter">Inter</option>
                            <option value="Impact">Impact</option>
                            <option value="Georgia">Georgia</option>
                            <option value="monospace">Monospace</option>
                          </select>
                        </div>

                        <div>
                          <span className="text-[10px] uppercase font-bold text-[#6c7178]">Size ({selectedText.fontSize}px)</span>
                          <input
                            type="range"
                            min={16}
                            max={120}
                            value={selectedText.fontSize}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setTextItems((prev) =>
                                prev.map((t) => (t.id === selectedText.id ? { ...t, fontSize: val } : t))
                              );
                            }}
                            className="w-full mt-2 h-1.5 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-[#6c7178]">Color</span>
                          <div className="flex items-center gap-1.5 mt-1">
                            <input
                              type="color"
                              value={selectedText.color}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTextItems((prev) =>
                                  prev.map((t) => (t.id === selectedText.id ? { ...t, color: val } : t))
                                );
                              }}
                              className="w-7 h-7 rounded border border-[#dcdcdc] cursor-pointer"
                            />
                            <span className="font-mono text-[10px] text-[#6c7178]">{selectedText.color}</span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] uppercase font-bold text-[#6c7178]">Background</span>
                          <div className="flex items-center gap-1.5 mt-1">
                            <input
                              type="color"
                              value={selectedText.backgroundColor === 'transparent' ? '#000000' : selectedText.backgroundColor}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTextItems((prev) =>
                                  prev.map((t) => (t.id === selectedText.id ? { ...t, backgroundColor: val } : t))
                                );
                              }}
                              className="w-7 h-7 rounded border border-[#dcdcdc] cursor-pointer"
                            />
                            <button
                              onClick={() => {
                                setTextItems((prev) =>
                                  prev.map((t) => (t.id === selectedText.id ? { ...t, backgroundColor: 'transparent' } : t))
                                );
                              }}
                              className="text-[10px] px-1 py-0.5 border border-[#dcdcdc] rounded bg-white hover:bg-[#f0f2f5]"
                            >
                              None
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-1 border-t border-[#e0e2e6]">
                        <span className="text-[10px] text-[#8a9199]">Drag text on photo to move</span>
                        <button
                          onClick={() => {
                            setTextItems((prev) => prev.filter((t) => t.id !== selectedText.id));
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

                {/* Arrow Annotation Tool (Item #9) */}
                <div className="bg-white p-3.5 rounded-md border border-[#e0e2e6] shadow-xs space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#2e3436]">
                      <ArrowRight className="w-4 h-4 text-[#e65100]" />
                      <span>Arrow Annotation</span>
                    </div>
                    <button
                      onClick={handleAddArrow}
                      className="px-2 py-1 rounded bg-[#fff0e6] hover:bg-[#ffe0cc] text-[#e65100] text-[11px] font-semibold border border-[#e65100]/30 transition-colors"
                    >
                      + Add Arrow
                    </button>
                  </div>

                  {selectedArrow && (
                    <div className="space-y-2.5 p-2.5 rounded bg-[#f8f9fa] border border-[#e0e2e6] text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-[#6c7178]">Color</span>
                          <div className="flex items-center gap-1.5 mt-1">
                            <input
                              type="color"
                              value={selectedArrow.color}
                              onChange={(e) => {
                                const val = e.target.value;
                                setArrowItems((prev) =>
                                  prev.map((a) => (a.id === selectedArrow.id ? { ...a, color: val } : a))
                                );
                              }}
                              className="w-7 h-7 rounded border border-[#dcdcdc] cursor-pointer"
                            />
                            <span className="font-mono text-[10px] text-[#6c7178]">{selectedArrow.color}</span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] uppercase font-bold text-[#6c7178]">Thickness ({selectedArrow.width}px)</span>
                          <input
                            type="range"
                            min={2}
                            max={16}
                            value={selectedArrow.width}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setArrowItems((prev) =>
                                prev.map((a) => (a.id === selectedArrow.id ? { ...a, width: val } : a))
                              );
                            }}
                            className="w-full mt-2 h-1.5 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center pt-1 border-t border-[#e0e2e6]">
                        <span className="text-[10px] text-[#8a9199]">Drag start/end points on photo</span>
                        <button
                          onClick={() => {
                            setArrowItems((prev) => prev.filter((a) => a.id !== selectedArrow.id));
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
              </div>
            )}

            {/* TAB 2: TUNING */}
            {activeTab === 'tuning' && (
              <div className="space-y-3">
                {/* Exposure */}
                <div className="space-y-1 bg-white p-3 rounded-md border border-[#e0e2e6] shadow-xs">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#2e3436] font-medium">Exposure</span>
                    <span className="font-mono text-[#6c7178]">{adj.exposure > 0 ? `+${adj.exposure}` : adj.exposure}</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={adj.exposure}
                    onChange={(e) => updateAdjustment('exposure', Number(e.target.value))}
                    className="w-full h-1.5 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                  />
                </div>

                {/* Contrast */}
                <div className="space-y-1 bg-white p-3 rounded-md border border-[#e0e2e6] shadow-xs">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#2e3436] font-medium">Contrast</span>
                    <span className="font-mono text-[#6c7178]">{adj.contrast > 0 ? `+${adj.contrast}` : adj.contrast}</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={adj.contrast}
                    onChange={(e) => updateAdjustment('contrast', Number(e.target.value))}
                    className="w-full h-1.5 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                  />
                </div>

                {/* Highlights */}
                <div className="space-y-1 bg-white p-3 rounded-md border border-[#e0e2e6] shadow-xs">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#2e3436] font-medium flex items-center gap-1">
                      <Sun className="w-3 h-3 text-[#e65100]" />
                      <span>Highlights</span>
                    </span>
                    <span className="font-mono text-[#6c7178]">{adj.highlights > 0 ? `+${adj.highlights}` : adj.highlights}</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={adj.highlights}
                    onChange={(e) => updateAdjustment('highlights', Number(e.target.value))}
                    className="w-full h-1.5 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                  />
                </div>

                {/* Shadows (Fill Light) */}
                <div className="space-y-1 bg-white p-3 rounded-md border border-[#e0e2e6] shadow-xs">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#2e3436] font-medium flex items-center gap-1">
                      <Moon className="w-3 h-3 text-[#e65100]" />
                      <span>Shadows (Fill Light)</span>
                    </span>
                    <span className="font-mono text-[#6c7178]">{adj.shadows > 0 ? `+${adj.shadows}` : adj.shadows}</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={adj.shadows}
                    onChange={(e) => updateAdjustment('shadows', Number(e.target.value))}
                    className="w-full h-1.5 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                  />
                </div>

                {/* Temperature (Warmth) */}
                <div className="space-y-1 bg-white p-3 rounded-md border border-[#e0e2e6] shadow-xs">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#2e3436] font-medium">Temperature (Warm/Cool)</span>
                    <span className="font-mono text-[#6c7178]">{adj.warmth > 0 ? `+${adj.warmth}` : adj.warmth}</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={adj.warmth}
                    onChange={(e) => updateAdjustment('warmth', Number(e.target.value))}
                    className="w-full h-1.5 bg-gradient-to-r from-blue-500 via-[#dcdcdc] to-[#e65100] rounded appearance-none cursor-pointer accent-[#e65100]"
                  />
                </div>

                {/* Tint */}
                <div className="space-y-1 bg-white p-3 rounded-md border border-[#e0e2e6] shadow-xs">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#2e3436] font-medium">Tint</span>
                    <span className="font-mono text-[#6c7178]">{adj.tint > 0 ? `+${adj.tint}` : adj.tint}</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={adj.tint}
                    onChange={(e) => updateAdjustment('tint', Number(e.target.value))}
                    className="w-full h-1.5 bg-gradient-to-r from-emerald-500 via-[#dcdcdc] to-fuchsia-500 rounded appearance-none cursor-pointer accent-fuchsia-600"
                  />
                </div>

                {/* Saturation */}
                <div className="space-y-1 bg-white p-3 rounded-md border border-[#e0e2e6] shadow-xs">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#2e3436] font-medium">Saturation</span>
                    <span className="font-mono text-[#6c7178]">{adj.saturation > 0 ? `+${adj.saturation}` : adj.saturation}</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={adj.saturation}
                    onChange={(e) => updateAdjustment('saturation', Number(e.target.value))}
                    className="w-full h-1.5 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                  />
                </div>
              </div>
            )}

            {/* TAB 3: EFFECTS */}
            {activeTab === 'effects' && (
              <div className="space-y-3">
                {/* Black & White */}
                <label className="flex items-center justify-between p-3 rounded-md bg-white border border-[#e0e2e6] shadow-xs cursor-pointer">
                  <span className="text-xs font-medium text-[#2e3436]">Black & White Film</span>
                  <input
                    type="checkbox"
                    checked={adj.blackAndWhite}
                    onChange={(e) => updateAdjustment('blackAndWhite', e.target.checked)}
                    className="w-4 h-4 rounded accent-[#e65100]"
                  />
                </label>

                {/* Sepia Tone */}
                <div className="space-y-1 bg-white p-3 rounded-md border border-[#e0e2e6] shadow-xs">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#2e3436] font-medium">Sepia Tone</span>
                    <span className="font-mono text-[#6c7178]">{adj.sepia}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={adj.sepia}
                    onChange={(e) => updateAdjustment('sepia', Number(e.target.value))}
                    className="w-full h-1.5 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                  />
                </div>

                {/* Vignette */}
                <div className="space-y-1 bg-white p-3 rounded-md border border-[#e0e2e6] shadow-xs">
                  <div className="flex justify-between text-xs">
                    <span className="text-[#2e3436] font-medium">Vignette (Dark Borders)</span>
                    <span className="font-mono text-[#6c7178]">{adj.vignette}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={adj.vignette}
                    onChange={(e) => updateAdjustment('vignette', Number(e.target.value))}
                    className="w-full h-1.5 bg-[#e2e4e8] rounded appearance-none cursor-pointer accent-[#e65100]"
                  />
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Right Interactive Canvas Preview & Crop Overlay Area */}
        <div 
          ref={previewParentRef}
          className="flex-1 bg-[#18191e] p-6 flex items-center justify-center overflow-hidden relative"
        >
          <div 
            ref={canvasContainerRef}
            style={
              displaySize.width && displaySize.height
                ? { width: `${displaySize.width}px`, height: `${displaySize.height}px`, touchAction: 'none' }
                : { touchAction: 'none' }
            }
            className="relative flex items-center justify-center shadow-2xl drop-shadow-[0_20px_40px_rgba(0,0,0,0.8)] rounded-sm"
          >
            {/* Live Interactive Canvas */}
            <canvas
              ref={canvasRef}
              style={{
                width: '100%',
                height: '100%',
                display: 'block',
              }}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              className="cursor-crosshair block"
            />

            {/* Interactive Crop Overlay when isCropping is active */}
            {isCropping && (
              <div 
                className="absolute inset-0 cursor-crosshair overflow-hidden"
                onPointerMove={handleCropPointerMove}
                onPointerUp={handleCropPointerUp}
              >
                {/* 4 Dimmed Surround Regions */}
                <div 
                  className="absolute bg-black/65 pointer-events-none"
                  style={{ top: 0, left: 0, right: 0, height: `${cropBox.y * 100}%` }}
                />
                <div 
                  className="absolute bg-black/65 pointer-events-none"
                  style={{ top: `${(cropBox.y + cropBox.height) * 100}%`, left: 0, right: 0, bottom: 0 }}
                />
                <div 
                  className="absolute bg-black/65 pointer-events-none"
                  style={{ 
                    top: `${cropBox.y * 100}%`, 
                    left: 0, 
                    width: `${cropBox.x * 100}%`, 
                    height: `${cropBox.height * 100}%` 
                  }}
                />
                <div 
                  className="absolute bg-black/65 pointer-events-none"
                  style={{ 
                    top: `${cropBox.y * 100}%`, 
                    left: `${(cropBox.x + cropBox.width) * 100}%`, 
                    right: 0, 
                    height: `${cropBox.height * 100}%` 
                  }}
                />

                {/* The Crop Rectangle */}
                <div
                  className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.5)] cursor-move select-none"
                  style={{
                    left: `${cropBox.x * 100}%`,
                    top: `${cropBox.y * 100}%`,
                    width: `${cropBox.width * 100}%`,
                    height: `${cropBox.height * 100}%`,
                  }}
                  onPointerDown={(e) => handleCropPointerDown(e, 'move')}
                >
                  {/* Rule of Thirds Grid Lines */}
                  <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 pointer-events-none opacity-60">
                    <div className="border-r border-b border-white/60" />
                    <div className="border-r border-b border-white/60" />
                    <div className="border-b border-white/60" />
                    <div className="border-r border-b border-white/60" />
                    <div className="border-r border-b border-white/60" />
                    <div className="border-b border-white/60" />
                    <div className="border-r border-b border-white/60" />
                    <div className="border-r border-b border-white/60" />
                    <div />
                  </div>

                  {/* Live Aspect Ratio and Dimensions Indicator */}
                  <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-black/90 text-white text-[11px] font-mono px-2.5 py-0.5 rounded shadow-lg pointer-events-none whitespace-nowrap flex items-center gap-1.5 border border-white/20 z-30">
                    <span className="font-semibold text-[#ff9800]">
                      {cropAspect === 'Freeform'
                        ? 'Freeform'
                        : cropAspect === '1:1 Square'
                        ? '1:1'
                        : `${cropAspect.split(' ')[0]} (${cropOrientation === 'landscape' ? (cropAspect.includes('4:6') ? '6:4' : cropAspect.includes('5:7') ? '7:5' : cropAspect.includes('8:10') ? '10:8' : cropAspect.includes('4:3') ? '4:3' : '16:9') : (cropAspect.includes('4:6') ? '4:6' : cropAspect.includes('5:7') ? '5:7' : cropAspect.includes('8:10') ? '8:10' : cropAspect.includes('4:3') ? '3:4' : '9:16')})`}
                    </span>
                    <span className="text-white/40">•</span>
                    <span className="text-white/80">{cropOrientation === 'landscape' ? 'Landscape' : 'Portrait'}</span>
                    <span className="text-white/40">•</span>
                    <span className="text-[#a5d6a7]">
                      {Math.round(cropBox.width * (originalImageRef.current?.naturalWidth || photo.width || 1000))} × {Math.round(cropBox.height * (originalImageRef.current?.naturalHeight || photo.height || 1000))} px
                    </span>
                  </div>

                  {/* 8 Drag Handles */}
                  <div
                    onPointerDown={(e) => handleCropPointerDown(e, 'nw')}
                    className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border border-[#e65100] rounded-xs shadow-md cursor-nwse-resize z-20"
                  />
                  <div
                    onPointerDown={(e) => handleCropPointerDown(e, 'ne')}
                    className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border border-[#e65100] rounded-xs shadow-md cursor-nesw-resize z-20"
                  />
                  <div
                    onPointerDown={(e) => handleCropPointerDown(e, 'sw')}
                    className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border border-[#e65100] rounded-xs shadow-md cursor-nesw-resize z-20"
                  />
                  <div
                    onPointerDown={(e) => handleCropPointerDown(e, 'se')}
                    className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border border-[#e65100] rounded-xs shadow-md cursor-nwse-resize z-20"
                  />

                  <div
                    onPointerDown={(e) => handleCropPointerDown(e, 'n')}
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-white border border-[#e65100] rounded-xs shadow-md cursor-ns-resize z-20"
                  />
                  <div
                    onPointerDown={(e) => handleCropPointerDown(e, 's')}
                    className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-2 bg-white border border-[#e65100] rounded-xs shadow-md cursor-ns-resize z-20"
                  />
                  <div
                    onPointerDown={(e) => handleCropPointerDown(e, 'w')}
                    className="absolute top-1/2 -translate-y-1/2 -left-1 w-2 h-6 bg-white border border-[#e65100] rounded-xs shadow-md cursor-ew-resize z-20"
                  />
                  <div
                    onPointerDown={(e) => handleCropPointerDown(e, 'e')}
                    className="absolute top-1/2 -translate-y-1/2 -right-1 w-2 h-6 bg-white border border-[#e65100] rounded-xs shadow-md cursor-ew-resize z-20"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
