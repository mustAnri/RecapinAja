/**
 * Image processing pipeline (PRDv2 §20, §24, §25, §27).
 *
 * Per photo: decode -> apply the confirmed crop template proportionally
 * (always 1:1, never stretched) -> overlay the timestamp -> encode.
 * Runs entirely in the browser; photos never leave the device (§37).
 */

import type { TimestampPosition, CropTemplate } from '../../types/processing';
import {
  DEFAULT_TIMESTAMP_STYLE,
  resolveBoxPosition,
  resolveFontSize,
  type TimestampStyle,
} from './timestampStyle';

// Re-export location overlay functionality
export * from './locationOverlay';

export class ImageProcessingError extends Error {}

export interface ProcessPhotoOptions {
  /** Combined timestamp string, e.g. "20 Mei 2022 14:09". */
  timestamp: string;
  /** Confirmed crop template (§19), or null to keep the full photo. */
  crop: CropTemplate | null;
  position?: TimestampPosition;
  style?: TimestampStyle;
  /** JPEG quality for .jpg/.jpeg outputs (0-1). Default 0.92. */
  jpegQuality?: number;
  /** Optional hard cap for the output side length in pixels. */
  maxOutputSize?: number;
  /**
   * Skip drawing the timestamp overlay (used when the caller renders a
   * combined timestamp + location block in a later pass instead).
   */
  skipTimestamp?: boolean;
}

export interface ProcessedPhoto {
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export function outputMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  return MIME_BY_EXTENSION[ext] ?? 'image/jpeg';
}

/** Decode an image File into an ImageBitmap (or HTMLImageElement fallback). */
async function decodeImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      // 'from-image' applies EXIF orientation so the decoded pixels match
      // what the user saw in the crop preview.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to the <img> decoder below.
    }
  }
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ImageProcessingError('The image could not be decoded.'));
    };
    img.src = url;
  });
}

function sourceSize(
  image: ImageBitmap | HTMLImageElement,
): { width: number; height: number } {
  if (image instanceof HTMLImageElement) {
    return { width: image.naturalWidth, height: image.naturalHeight };
  }
  return { width: image.width, height: image.height };
}

/** Minimum crop side we are willing to emit (avoids degenerate outputs). */
const MIN_CROP_SIDE_PX = 16;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * Apply the crop template proportionally to any resolution (§20).
 *
 * The template stores fractions relative to the preview photo: `xFraction`
 * and `yFraction` are the crop's top-left corner over the photo's width /
 * height, and `sizeFraction` is the square side over the preview's shortest
 * dimension. The same fractions are replayed on the target image, so the
 * framing scales with the photo — always 1:1, never stretched.
 *
 * Returns null when the template cannot safely be applied (§20).
 */
export function applyCropTemplate(
  width: number,
  height: number,
  template: CropTemplate,
): { sx: number; sy: number; side: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const sizeFraction = Math.min(clamp01(template.sizeFraction), 1);
  const side = Math.round(sizeFraction * Math.min(width, height));
  if (side < MIN_CROP_SIDE_PX || side > width || side > height) return null;

  const sx = Math.min(Math.round(clamp01(template.xFraction) * width), width - side);
  const sy = Math.min(Math.round(clamp01(template.yFraction) * height), height - side);
  return { sx, sy, side };
}

/** Centered maximum-size square — used as the initial crop in the editor. */
export function centerSquareTemplate(width: number, height: number): CropTemplate {
  const side = Math.max(Math.min(width, height), 1);
  return {
    xFraction: (width - side) / 2 / width,
    yFraction: (height - side) / 2 / height,
    sizeFraction: side / Math.min(width, height),
    sourceWidth: width,
    sourceHeight: height,
  };
}

function drawTimestamp(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  timestamp: string,
  position: TimestampPosition,
  style: TimestampStyle,
): void {
  const fontSize = resolveFontSize(Math.min(canvasWidth, canvasHeight), style);
  const padding = fontSize * style.paddingRatio;
  const margin = fontSize * style.marginRatio;

  ctx.save();
  ctx.font = `${style.fontWeight} ${fontSize}px ${style.fontFamily}`;
  ctx.textBaseline = 'alphabetic';

  const metrics = ctx.measureText(timestamp);
  const textWidth = metrics.width;
  const ascent = metrics.actualBoundingBoxAscent || fontSize * 0.8;
  const descent = metrics.actualBoundingBoxDescent || fontSize * 0.2;
  const textHeight = ascent + descent;

  const boxWidth = textWidth + padding * 2;
  const boxHeight = textHeight + padding * 2;
  const { x, y } = resolveBoxPosition(position, canvasWidth, canvasHeight, boxWidth, boxHeight, margin);

  // Subtle background pill for readability (§25).
  if (style.background) {
    ctx.fillStyle = style.background;
    const radius = Math.min(padding, boxHeight / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, boxWidth, boxHeight, radius);
    ctx.fill();
  }

  if (style.shadow) {
    ctx.shadowColor = style.shadow.color;
    ctx.shadowBlur = fontSize * style.shadow.blurRatio;
    ctx.shadowOffsetX = fontSize * style.shadow.offsetRatio;
    ctx.shadowOffsetY = fontSize * style.shadow.offsetRatio;
  }

  ctx.fillStyle = style.color;
  ctx.fillText(timestamp, x + padding, y + padding + ascent);
  ctx.restore();
}

/**
 * Full per-photo pipeline (§27): decode -> optional crop template ->
 * timestamp overlay -> encode. With `crop: null` the photo keeps its
 * original framing. Throws ImageProcessingError with a human-readable
 * message; callers record the failure and continue with other photos (§32).
 */
export async function processPhoto(
  file: File,
  options: ProcessPhotoOptions,
): Promise<ProcessedPhoto> {
  const position = options.position ?? 'bottom-right';
  const style = options.style ?? DEFAULT_TIMESTAMP_STYLE;
  const jpegQuality = options.jpegQuality ?? 0.92;

  let image: ImageBitmap | HTMLImageElement;
  try {
    image = await decodeImage(file);
  } catch (error) {
    throw new ImageProcessingError(
      error instanceof ImageProcessingError
        ? error.message
        : error instanceof Error
          ? `Unable to process image: ${error.message}`
          : 'Unable to process image.',
    );
  }

  try {
    const { width, height } = sourceSize(image);
    if (!width || !height) {
      throw new ImageProcessingError('Unable to process image: no pixel data.');
    }

    // Geometry: either the proportional crop square, or the full photo.
    let sx = 0;
    let sy = 0;
    let sourceW = width;
    let sourceH = height;
    let outW = width;
    let outH = height;

    if (options.crop) {
      const crop = applyCropTemplate(width, height, options.crop);
      if (!crop) {
        throw new ImageProcessingError(
          'The crop template cannot be applied to this image (resolution too small).',
        );
      }
      sx = crop.sx;
      sy = crop.sy;
      sourceW = crop.side;
      sourceH = crop.side;
      outW = crop.side;
      outH = crop.side;
    }

    // Stability cap: scale large outputs down proportionally.
    if (options.maxOutputSize) {
      const longest = Math.max(outW, outH);
      if (longest > options.maxOutputSize) {
        const factor = options.maxOutputSize / longest;
        outW = Math.max(1, Math.round(outW * factor));
        outH = Math.max(1, Math.round(outH * factor));
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new ImageProcessingError('Canvas 2D context is unavailable.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.drawImage(image, sx, sy, sourceW, sourceH, 0, 0, outW, outH);

    if (!options.skipTimestamp) {
      drawTimestamp(ctx, outW, outH, options.timestamp, position, style);
    }

    const mimeType = outputMimeType(file.name);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, mimeType, mimeType === 'image/jpeg' ? jpegQuality : undefined);
    });
    if (!blob) {
      throw new ImageProcessingError('Image encoding failed.');
    }
    return { blob, mimeType, width: outW, height: outH };
  } finally {
    if (typeof ImageBitmap !== 'undefined' && image instanceof ImageBitmap) {
      image.close();
    }
  }
}
