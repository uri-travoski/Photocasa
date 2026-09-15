import type { Photo, PhotoAdjustments, PhotoTextItem, PhotoArrowItem } from '../types';

/**
 * Checks whether a photo has non-destructive adjustments applied.
 */
export function isPhotoEdited(photo?: Photo | null): boolean {
  if (!photo || !photo.adjustments) return false;
  const a = photo.adjustments;
  if (
    a.crop &&
    (a.crop.x > 0.002 ||
      a.crop.y > 0.002 ||
      a.crop.width < 0.998 ||
      a.crop.height < 0.998)
  ) {
    return true;
  }
  if (Math.abs(a.exposure) > 0.5) return true;
  if (Math.abs(a.contrast) > 0.5) return true;
  if (Math.abs(a.highlights) > 0.5) return true;
  if (Math.abs(a.shadows) > 0.5) return true;
  if (Math.abs(a.warmth) > 0.5) return true;
  if (Math.abs(a.tint) > 0.5) return true;
  if (Math.abs(a.saturation) > 0.5) return true;
  if (a.sepia > 0.5) return true;
  if (a.blackAndWhite) return true;
  if (a.vignette > 0.5) return true;
  if (a.grain > 0.5) return true;
  if (a.glow > 0.5) return true;
  if (Math.abs(a.straighten) > 0.5) return true;
  return false;
}

/**
 * Calculates new EXIF orientation after rotating by degrees clockwise (+90, +180, +270, -90).
 */
export function computeNewOrientation(currentOrientation: number = 1, degreesCw: number): number {
  const steps = ((Math.round(degreesCw / 90) % 4) + 4) % 4;
  if (steps === 0) return currentOrientation;

  const normalSeq = [1, 6, 3, 8];
  const mirroredSeq = [2, 5, 4, 7];

  const normalIdx = normalSeq.indexOf(currentOrientation);
  if (normalIdx !== -1) {
    return normalSeq[(normalIdx + steps) % 4];
  }
  const mirroredIdx = mirroredSeq.indexOf(currentOrientation);
  if (mirroredIdx !== -1) {
    return mirroredSeq[(mirroredIdx + steps) % 4];
  }
  return normalSeq[steps % 4];
}

/**
 * Builds CSS filter string for live GPU-accelerated rendering on the canvas element.
 */
export function buildCssFilter(adj?: PhotoAdjustments | null): string {
  if (!adj) return 'none';
  const exposureVal = 1 + (adj.exposure || 0) / 100;
  const contrastVal = 1 + (adj.contrast || 0) / 100;
  const saturationVal = adj.blackAndWhite
    ? 0
    : Math.max(0, 1 + (adj.saturation || 0) / 100);
  const sepiaVal = (adj.sepia || 0) / 100;

  let filterStr = `brightness(${exposureVal}) contrast(${contrastVal}) saturate(${saturationVal}) sepia(${sepiaVal})`;
  if (adj.tint && adj.tint !== 0) {
    filterStr += ` hue-rotate(${adj.tint * 0.5}deg)`;
  }
  if (adj.blackAndWhite) {
    filterStr += ' grayscale(100%)';
  }
  return filterStr;
}

/**
 * Software pixel baker for exporting/saving with 100% fidelity even when WebKitGTK 2D canvas ignores ctx.filter.
 */
export function applyPixelFilters(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  adj: PhotoAdjustments
): void {
  const hasAdj =
    (adj.exposure && adj.exposure !== 0) ||
    (adj.contrast && adj.contrast !== 0) ||
    (adj.highlights && adj.highlights !== 0) ||
    (adj.shadows && adj.shadows !== 0) ||
    (adj.warmth && adj.warmth !== 0) ||
    (adj.tint && adj.tint !== 0) ||
    (adj.saturation && adj.saturation !== 0) ||
    (adj.sepia && adj.sepia > 0) ||
    adj.blackAndWhite;

  if (!hasAdj) return;

  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;

    // Normalizing sliders (-100 to 100 -> normalized float)
    const expVal = adj.exposure || 0;
    const expFactor = 1 + expVal * 0.0075; // subtle, gradual 0.75% per step

    const contrastVal = adj.contrast || 0;
    const contrastFactor = 1 + contrastVal * 0.005; // 0.5% slope per step

    const hlNorm = (adj.highlights || 0) / 100;
    const shNorm = (adj.shadows || 0) / 100;
    const warmthNorm = (adj.warmth || 0) / 100;
    const tintNorm = (adj.tint || 0) / 100;

    const satVal = adj.saturation || 0;
    const satFactor = Math.max(0, 1 + satVal * 0.0075);
    const sepia = (adj.sepia || 0) / 100;
    const isBw = adj.blackAndWhite;

    for (let i = 0; i < d.length; i += 4) {
      let r = d[i];
      let g = d[i + 1];
      let b = d[i + 2];

      // 1. Exposure (Gradual multiplicative brightness)
      if (expVal !== 0) {
        r *= expFactor;
        g *= expFactor;
        b *= expFactor;
      }

      // 2. Contrast (Centered around midtone 128)
      if (contrastVal !== 0) {
        r = (r - 128) * contrastFactor + 128;
        g = (g - 128) * contrastFactor + 128;
        b = (b - 128) * contrastFactor + 128;
      }

      // 3. Highlights & Shadows (Smooth, continuous tone curves)
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Highlights: smoothly target upper range lum > 120 with quadratic ease-in
      if (hlNorm !== 0 && lum > 120) {
        const t = (lum - 120) / 135; // 0 at 120, 1 at 255
        const w = t * t;
        const hlFactor = hlNorm > 0 ? 1 + hlNorm * w * 0.35 : 1 + hlNorm * w * 0.40;
        r *= hlFactor;
        g *= hlFactor;
        b *= hlFactor;
      }

      // Shadows / Fill Light: smoothly target lower range lum < 140 with quadratic ease-in
      if (shNorm !== 0 && lum < 140) {
        const t = (140 - lum) / 140; // 0 at 140, 1 at 0
        const w = t * t;
        if (shNorm > 0) {
          // Fill light: gently lift shadows
          const shFactor = 1 + shNorm * w * 0.30;
          const lift = shNorm * w * 25;
          r = r * shFactor + lift;
          g = g * shFactor + lift;
          b = b * shFactor + lift;
        } else {
          // Deepen shadows
          const shFactor = 1 + shNorm * w * 0.35;
          r *= shFactor;
          g *= shFactor;
          b *= shFactor;
        }
      }

      // 4. Warmth (Temperature) & Tint
      if (warmthNorm !== 0) {
        r += warmthNorm * 22;
        b -= warmthNorm * 22;
      }
      if (tintNorm !== 0) {
        g += tintNorm * 18;
        r -= tintNorm * 9;
        b -= tintNorm * 9;
      }

      // 5. Saturation & Black & White
      if (isBw) {
        const postLum = 0.299 * r + 0.587 * g + 0.114 * b;
        r = postLum;
        g = postLum;
        b = postLum;
      } else if (satVal !== 0) {
        const postLum = 0.299 * r + 0.587 * g + 0.114 * b;
        r = postLum + (r - postLum) * satFactor;
        g = postLum + (g - postLum) * satFactor;
        b = postLum + (b - postLum) * satFactor;
      }

      // 6. Sepia tone
      if (sepia > 0) {
        const sr = r * 0.393 + g * 0.769 + b * 0.189;
        const sg = r * 0.349 + g * 0.686 + b * 0.168;
        const sb = r * 0.272 + g * 0.534 + b * 0.131;
        r = r * (1 - sepia) + sr * sepia;
        g = g * (1 - sepia) + sg * sepia;
        b = b * (1 - sepia) + sb * sepia;
      }

      // Clamp to valid 8-bit unsigned integer range [0, 255]
      d[i] = r < 0 ? 0 : r > 255 ? 255 : (r + 0.5) | 0;
      d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : (g + 0.5) | 0;
      d[i + 2] = b < 0 ? 0 : b > 255 ? 255 : (b + 0.5) | 0;
    }

    ctx.putImageData(imgData, 0, 0);
  } catch (err) {
    console.warn('Unable to apply pixel filters via getImageData', err);
  }
}

/**
 * Draws an arrow annotation from start to end with an arrowhead.
 */
export function drawArrow(
  ctx: CanvasRenderingContext2D,
  arrow: PhotoArrowItem,
  isSelected = false
): void {
  const { startX, startY, endX, endY, color, width } = arrow;
  const headLen = Math.max(16, width * 3.5);
  const angle = Math.atan2(endY - startY, endX - startX);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Draw arrow shaft
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  // Draw arrowhead
  ctx.beginPath();
  ctx.moveTo(endX, endY);
  ctx.lineTo(
    endX - headLen * Math.cos(angle - Math.PI / 6),
    endY - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    endX - headLen * Math.cos(angle + Math.PI / 6),
    endY - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();

  if (isSelected) {
    ctx.fillStyle = '#e65100';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(startX, startY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(endX, endY, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Draws a text item with formatting and optional selection box.
 */
export function drawTextItem(
  ctx: CanvasRenderingContext2D,
  item: PhotoTextItem,
  isSelected = false
): { width: number; height: number } {
  const { text, x, y, fontSize, fontFamily, color, bold, italic, underline, backgroundColor } = item;
  if (!text) return { width: 0, height: 0 };

  ctx.save();
  const fontStyle = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${fontSize}px ${fontFamily || 'Inter, sans-serif'}`;
  ctx.font = fontStyle;
  ctx.textBaseline = 'top';

  const lines = text.split('\n');
  const lineHeight = fontSize * 1.25;
  let maxW = 0;
  lines.forEach((l) => {
    const w = ctx.measureText(l).width;
    if (w > maxW) maxW = w;
  });
  const totalH = lines.length * lineHeight;

  const padX = 8;
  const padY = 6;

  // Background box
  if (backgroundColor && backgroundColor !== 'transparent') {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(x - padX, y - padY, maxW + padX * 2, totalH + padY * 2);
  }

  // Text lines
  ctx.fillStyle = color;
  lines.forEach((l, idx) => {
    const lineY = y + idx * lineHeight;
    ctx.fillText(l, x, lineY);

    if (underline) {
      const lineW = ctx.measureText(l).width;
      ctx.lineWidth = Math.max(1, Math.round(fontSize / 14));
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.moveTo(x, lineY + fontSize + 2);
      ctx.lineTo(x + lineW, lineY + fontSize + 2);
      ctx.stroke();
    }
  });

  // Selected bounding box
  if (isSelected) {
    ctx.strokeStyle = '#e65100';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x - padX, y - padY, maxW + padX * 2, totalH + padY * 2);

    ctx.fillStyle = '#e65100';
    ctx.fillRect(x - padX - 4, y - padY - 4, 8, 8);
    ctx.fillRect(x + maxW + padX - 4, y - padY - 4, 8, 8);
    ctx.fillRect(x - padX - 4, y + totalH + padY - 4, 8, 8);
    ctx.fillRect(x + maxW + padX - 4, y + totalH + padY - 4, 8, 8);
  }

  ctx.restore();
  return { width: maxW + padX * 2, height: totalH + padY * 2 };
}

/**
 * Renders an image to canvas with non-destructive adjustments, crop slice, straighten, arrows, and text.
 */
export function renderAdjustedCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  adj?: PhotoAdjustments | null,
  textItems?: PhotoTextItem[],
  arrowItems?: PhotoArrowItem[],
  selectedTextId?: string | null,
  selectedArrowId?: string | null,
  _bakePixelFilters = true,
  maxCanvasDim?: number
): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  const naturalW = img.naturalWidth || 1000;
  const naturalH = img.naturalHeight || 1000;

  if (!adj) {
    canvas.width = naturalW;
    canvas.height = naturalH;
    ctx.clearRect(0, 0, naturalW, naturalH);
    ctx.drawImage(img, 0, 0, naturalW, naturalH);
    return;
  }

  // Calculate dimensions and crop slice
  let cropX = 0;
  let cropY = 0;
  let cropW = naturalW;
  let cropH = naturalH;

  if (adj.crop) {
    cropX = Math.round(adj.crop.x * naturalW);
    cropY = Math.round(adj.crop.y * naturalH);
    cropW = Math.max(1, Math.round(adj.crop.width * naturalW));
    cropH = Math.max(1, Math.round(adj.crop.height * naturalH));
  }

  // Scale down preview canvas if maxCanvasDim is specified (for buttery smooth 60fps editing)
  let targetW = cropW;
  let targetH = cropH;
  let scaleRatio = 1;
  if (maxCanvasDim && (cropW > maxCanvasDim || cropH > maxCanvasDim)) {
    if (cropW >= cropH) {
      scaleRatio = maxCanvasDim / cropW;
      targetW = maxCanvasDim;
      targetH = Math.max(1, Math.round(cropH * scaleRatio));
    } else {
      scaleRatio = maxCanvasDim / cropH;
      targetH = maxCanvasDim;
      targetW = Math.max(1, Math.round(cropW * scaleRatio));
    }
  }

  canvas.width = targetW;
  canvas.height = targetH;

  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Apply Straighten rotation around canvas center
  if (adj.straighten && adj.straighten !== 0) {
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((adj.straighten * Math.PI) / 180);
    const rad = Math.abs((adj.straighten * Math.PI) / 180);
    const scaleComp = 1 + Math.sin(rad) * 0.4;
    ctx.scale(scaleComp, scaleComp);
    ctx.translate(-canvas.width / 2, -canvas.height / 2);
  }

  // Draw image slice cleanly without ctx.filter (eliminates double/triple filtering artifacts)
  ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);
  ctx.restore();

  // Apply unified pixel filters whenever adjustments are present
  applyPixelFilters(ctx, canvas.width, canvas.height, adj);

  // Render Vignette
  if (adj.vignette && adj.vignette > 0) {
    ctx.save();
    const radius = Math.max(canvas.width, canvas.height) * 0.7;
    const gradient = ctx.createRadialGradient(
      canvas.width / 2,
      canvas.height / 2,
      radius * 0.3,
      canvas.width / 2,
      canvas.height / 2,
      radius
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(0, 0, 0, ${adj.vignette / 100})`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  }

  // Render Arrows
  if (arrowItems && arrowItems.length > 0) {
    arrowItems.forEach((arrow) => {
      const scaledArrow = scaleRatio === 1 ? arrow : {
        ...arrow,
        startX: arrow.startX * scaleRatio,
        startY: arrow.startY * scaleRatio,
        endX: arrow.endX * scaleRatio,
        endY: arrow.endY * scaleRatio,
        width: Math.max(1, arrow.width * scaleRatio),
      };
      drawArrow(ctx, scaledArrow, arrow.id === selectedArrowId);
    });
  }

  // Render Text Items
  if (textItems && textItems.length > 0) {
    textItems.forEach((item) => {
      const scaledItem = scaleRatio === 1 ? item : {
        ...item,
        x: item.x * scaleRatio,
        y: item.y * scaleRatio,
        fontSize: Math.max(8, Math.round(item.fontSize * scaleRatio)),
      };
      drawTextItem(ctx, scaledItem, item.id === selectedTextId);
    });
  }
}

/**
 * Generates a scaled JPEG data URL suitable for a fast thumbnail, preserving all adjustments.
 */
export function generateThumbnailDataUrl(
  sourceCanvas: HTMLCanvasElement,
  _adj?: PhotoAdjustments | null,
  maxDim: number = 360,
  quality: number = 0.88
): string {
  const thumbCanvas = document.createElement('canvas');
  let tw = sourceCanvas.width;
  let th = sourceCanvas.height;

  if (tw > maxDim || th > maxDim) {
    if (tw > th) {
      th = Math.max(1, Math.round((th * maxDim) / tw));
      tw = maxDim;
    } else {
      tw = Math.max(1, Math.round((tw * maxDim) / th));
      th = maxDim;
    }
  }

  thumbCanvas.width = tw;
  thumbCanvas.height = th;
  const ctx = thumbCanvas.getContext('2d', { willReadFrequently: true });
  if (ctx) {
    // sourceCanvas already has all adjustments rendered onto it
    ctx.drawImage(sourceCanvas, 0, 0, tw, th);
    return thumbCanvas.toDataURL('image/jpeg', quality);
  }
  return sourceCanvas.toDataURL('image/jpeg', quality);
}
