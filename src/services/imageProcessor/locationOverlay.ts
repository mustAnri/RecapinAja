/**
 * Location overlay rendering for images (PRDv2 §27 companion).
 *
 * Similar to timestamp overlays but designed for multi-line location data.
 * Supports four corner positions with configurable styling options.
 */

import type { Location } from '../../types/location';
import type { TimestampPosition } from '../../types/processing';
import { resolveFontSize, resolveBoxPosition } from './timestampStyle';
import type { TimestampStyle } from './timestampStyle';

/**
 * Position options for location overlay placement.
 * Matches TimestampPosition for UI consistency.
 */
export type LocationPosition = TimestampPosition;

/**
 * Styling configuration for location overlay rendering.
 * Designed to match timestamp overlay patterns with multi-line support.
 */
export interface LocationOverlayOptions {
  /** Font family stack for location text */
  fontFamily?: string;
  /** Font weight (normal, bold, or numeric 100-900) */
  fontWeight?: number | string;
  /** Font size as fraction of image shortest side */
  fontSizeRatio?: number;
  /** Minimum font size in pixels */
  minFontSize?: number;
  /** Maximum font size in pixels */
  maxFontSize?: number;
  /** Text color (CSS color value) */
  textColor?: string;
  /** Background pill color with opacity (null/undefined = no background) */
  backgroundColor?: string | null;
  /** Padding around text as fraction of font size */
  paddingRatio?: number;
  /** Margin from image edges as fraction of font size */
  marginRatio?: number;
  /** Text shadow for readability (null = no shadow) */
  shadow?: {
    color: string;
    blurRatio?: number;
    offsetRatio?: number;
  } | null;
  /** Line height as fraction of font size */
  lineHeightRatio?: number;
  /** Number of lines to display from address components */
  maxLines?: number;
}

/** Default styling that matches timestamp overlay design */
export const DEFAULT_LOCATION_STYLE: LocationOverlayOptions = {
  fontFamily: 'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontWeight: 600,
  fontSizeRatio: 0.035,
  minFontSize: 14,
  maxFontSize: 48,
  textColor: '#ffffff',
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  paddingRatio: 0.4,
  marginRatio: 0.8,
  shadow: { 
    color: 'rgba(0, 0, 0, 0.85)', 
    blurRatio: 0.15, 
    offsetRatio: 0.05 
  },
  lineHeightRatio: 1.4,
  maxLines: 4,
};

/**
 * Render location overlay on canvas.
 * Handles multi-line address text with proper formatting and positioning.
 * 
 * @param ctx - Canvas 2D rendering context
 * @param location - Location data to render
 * @param position - Corner position for overlay placement
 * @param options - Optional styling overrides
 * @throws Error if canvas context is unavailable or invalid
 */
export function renderLocationOverlay(
  ctx: CanvasRenderingContext2D,
  location: Location,
  position: LocationPosition = 'bottom-right',
  options?: LocationOverlayOptions,
): void {
  const style = { ...DEFAULT_LOCATION_STYLE, ...options };
  const preparedAddressLines = prepareAddressLines(location.address, style.maxLines ?? 3);
  renderLinesOverlay(ctx, preparedAddressLines, position, options);
}

/**
 * Render an arbitrary set of text lines as ONE stacked overlay box.
 *
 * Used both for the standalone address block and for the combined
 * timestamp + address block (when both overlays share the same corner, the
 * timestamp line is passed first so it appears on top).
 *
 * @param ctx - Canvas 2D rendering context
 * @param lines - Text lines to render (top to bottom); empty renders nothing
 * @param position - Corner position for overlay placement
 * @param options - Optional styling overrides
 * @throws Error if canvas context is unavailable or invalid
 */
export function renderLinesOverlay(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  position: LocationPosition = 'bottom-right',
  options?: LocationOverlayOptions,
): void {
  // Validate canvas context
  if (!ctx || typeof ctx.fillRect !== 'function') {
    throw new Error('Invalid or unavailable canvas context');
  }

  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;

  if (!canvasWidth || !canvasHeight || canvasWidth <= 0 || canvasHeight <= 0) {
    throw new Error('Canvas dimensions are invalid');
  }

  // Merge default options with provided ones
  const style = { ...DEFAULT_LOCATION_STYLE, ...options };

  if (lines.length === 0) {
    return; // No content to render
  }

  const fontSize = resolveFontSize(Math.min(canvasWidth, canvasHeight), {
    fontFamily: style.fontFamily!,
    fontWeight: style.fontWeight as unknown as number,
    fontSizeRatio: style.fontSizeRatio!,
    minFontSize: style.minFontSize!,
    maxFontSize: style.maxFontSize!,
    color: style.textColor ?? '#ffffff',
    background: style.backgroundColor ?? 'rgba(0, 0, 0, 0.5)',
    paddingRatio: style.paddingRatio ?? 0.4,
    marginRatio: style.marginRatio ?? 0.8,
    shadow: (style.shadow || { color: 'rgba(0, 0, 0, 0.85)', blurRatio: 0.15, offsetRatio: 0.05 }) as NonNullable<TimestampStyle['shadow']>,
  });

  const padding = fontSize * (style.paddingRatio ?? 0.4);
  const margin = fontSize * (style.marginRatio ?? 0.8);
  const lineHeight = fontSize * (style.lineHeightRatio ?? 1.4);

  // Save context state
  ctx.save();

  // Configure font
  ctx.font = `${style.fontWeight ?? 600} ${fontSize}px ${style.fontFamily}`;
  ctx.textBaseline = 'alphabetic';

  const maxLineWidth = Math.max(1, canvasWidth - margin * 2 - padding * 2);
  const renderedLines = lines.map(line =>
    truncateTextToWidth(line, maxLineWidth, text => ctx.measureText(text).width),
  );

  // Measure each line and calculate box dimensions
  const metrics = renderedLines.map(line => ctx.measureText(line));
  const lineWidths = metrics.map(m => m.width);
  const maxWidth = Math.max(...lineWidths);

  // Calculate total height including all lines and padding
  const totalTextHeight = (fontSize * (renderedLines.length - 1)) + lineHeight;
  const ascent = metrics[0].actualBoundingBoxAscent || fontSize * 0.8;

  const boxWidth = maxWidth + padding * 2;
  const boxHeight = totalTextHeight + padding * 2;

  // Determine overlay position
  const { x, y } = resolveBoxPosition(
    position,
    canvasWidth,
    canvasHeight,
    boxWidth,
    boxHeight,
    margin,
  );

  // Draw background pill (if enabled)
  if (style.backgroundColor) {
    ctx.fillStyle = style.backgroundColor ?? 'rgba(0, 0, 0, 0.5)';
    const radius = Math.min(padding, boxHeight / 2);
    ctx.beginPath();
    ctx.roundRect(x, y, boxWidth, boxHeight, radius);
    ctx.fill();
  }

  // Apply shadow for better readability
  if (style.shadow) {
    ctx.shadowColor = style.shadow.color;
    ctx.shadowBlur = fontSize * (style.shadow.blurRatio ?? 0.2);
    ctx.shadowOffsetX = fontSize * (style.shadow.offsetRatio ?? 0.05);
    ctx.shadowOffsetY = fontSize * (style.shadow.offsetRatio ?? 0.05);
  }

  // Set text color
  ctx.fillStyle = style.textColor ?? '#ffffff';

  // Render each line, left-aligned, top to bottom
  let currentY = y + padding + ascent;
  renderedLines.forEach((line) => {
    ctx.fillText(line, x + padding, currentY);
    currentY += lineHeight;
  });

  // Restore context state
  ctx.restore();
}

/**
 * Format address object into array of display lines.
 * Prioritizes most relevant address components.
 * 
 * @param address - Address object with structured components
 * @param maxLines - Maximum number of lines to include
 * @returns Array of formatted address lines
 */
export function prepareAddressLines(
  address: {
    street?: string | null;
    kecamatan?: string | null;
    kabupaten?: string | null;
    provinsi?: string | null;
    fullAddress?: string | null;
  },
  maxLines: number,
): string[] {
  const lines: string[] = [];
  const components: Array<keyof Pick<typeof address, 'street' | 'kecamatan' | 'kabupaten' | 'provinsi'>> = [
    'street',
    'kecamatan',
    'kabupaten',
    'provinsi',
  ];

  for (const component of components) {
    if (lines.length >= maxLines) break;

    const value = address[component];
    const trimmedValue = typeof value === 'string' ? value.trim() : '';
    if (trimmedValue) {
      lines.push(trimmedValue);
    }
  }

  // Use the complete address only when no structured component is available.
  if (lines.length === 0 && maxLines > 0) {
    const fullAddress = typeof address.fullAddress === 'string' ? address.fullAddress.trim() : '';
    if (fullAddress) {
      lines.push(fullAddress);
    }
  }

  return lines;
}

function truncateTextToWidth(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
): string {
  if (measure(text) <= maxWidth) return text;

  const ellipsis = '…';
  if (measure(ellipsis) > maxWidth) return '';

  let low = 0;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (measure(`${text.slice(0, middle)}${ellipsis}`) <= maxWidth) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return `${text.slice(0, low)}${ellipsis}`;
}

/**
 * Extract location data from an image's EXIF metadata (if present).
 * Returns null if no location data exists in the metadata.
 * 
 * @param exifData - Raw EXIF data object from image
 * @returns Parsed location object or null
 */
export function parseLocationFromEXIF(exifData: Record<string, unknown>): Location | null {
  try {
    // Check for GPS coordinates in EXIF data
    const lat = extractGPSValue(exifData, 'GPSLatitude');
    const lng = extractGPSValue(exifData, 'GPSLongitude');
    const refLat = extractGPSRef(exifData, 'GPSLatitudeRef');
    const refLng = extractGPSRef(exifData, 'GPSLongitudeRef');

    if (lat === null || lng === null || !refLat || !refLng) {
      return null;
    }

    // Convert directional references
    const finalLat = refLat === 'S' ? -lat : lat;
    const finalLng = refLng === 'W' ? -lng : lng;

    return {
      id: Date.now(),
      areaName: `Location at ${finalLat.toFixed(6)}, ${finalLng.toFixed(6)}`,
      coordinates: { lat: finalLat, lng: finalLng },
      address: {
        street: '',
        kecamatan: '',
        kabupaten: '',
        provinsi: '',
        fullAddress: `${finalLat.toFixed(6)}, ${finalLng.toFixed(6)}`,
      },
      updatedAt: new Date(),
    };
  } catch {
    return null;
  }
}

/**
 * Extract GPS coordinate value from EXIF data.
 * GPS coordinates are stored as arrays of [degrees, minutes, seconds].
 * 
 * @param exifData - Raw EXIF data object
 * @param key - EXIF key for GPS data
 * @returns Decimal degree value or null
 */
function extractGPSValue(exifData: Record<string, unknown>, key: string): number | null {
  const value = exifData[key];
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }

  const [deg, min, sec] = value;
  if (typeof deg !== 'number' || typeof min !== 'number' || typeof sec !== 'number') {
    return null;
  }

  return deg + min / 60 + sec / 3600;
}

/**
 * Extract GPS reference direction (N/S/E/W) from EXIF data.
 * 
 * @param exifData - Raw EXIF data object
 * @param key - EXIF key for GPS reference
 * @returns Direction character or null
 */
function extractGPSRef(exifData: Record<string, unknown>, key: string): string | null {
  const value = exifData[key];
  if (typeof value === 'string' && ['N', 'S', 'E', 'W'].includes(value)) {
    return value;
  }
  return null;
}

/**
 * Create a styled location overlay builder for fluent API usage.
 * Allows chaining of styling options before rendering.
 * 
 * @example
 * ```typescript
 * const location = getLocationFromImage(image);
 * if (location) {
 *   const overlayBuilder = new LocationOverlayBuilder()
 *     .withPosition('bottom-left')
 *     .withTextColor('#FFD700')
 *     .withBackgroundColor('rgba(0,0,0,0.7)')
 *     .withMaxLines(2);
 *   
 *   renderLocationOverlay(ctx, location, overlayBuilder.build());
 * }
 * ```
 */
export class LocationOverlayBuilder {
  private options: Partial<LocationOverlayOptions> = {};
  private position: LocationPosition = 'bottom-right';

  withPosition(position: LocationPosition): this {
    this.position = position;
    return this;
  }

  withFontFamily(fontFamily: string): this {
    this.options.fontFamily = fontFamily;
    return this;
  }

  withFontWeight(weight: number | string): this {
    this.options.fontWeight = weight;
    return this;
  }

  withFontSizeRatio(ratio: number): this {
    this.options.fontSizeRatio = ratio;
    return this;
  }

  withTextColors(textColor: string, backgroundColor?: string): this {
    this.options.textColor = textColor;
    if (backgroundColor !== undefined) {
      this.options.backgroundColor = backgroundColor;
    }
    return this;
  }

  withPaddingAndMargin(paddingRatio: number, marginRatio: number): this {
    this.options.paddingRatio = paddingRatio;
    this.options.marginRatio = marginRatio;
    return this;
  }

  withShadow(shadow: NonNullable<LocationOverlayOptions['shadow']>): this {
    this.options.shadow = shadow;
    return this;
  }

  withNoBackground(): this {
    this.options.backgroundColor = null;
    return this;
  }

  withMaxLines(maxLines: number): this {
    this.options.maxLines = maxLines;
    return this;
  }

  build(): { position: LocationPosition; options: LocationOverlayOptions } {
    return {
      position: this.position,
      options: { ...DEFAULT_LOCATION_STYLE, ...this.options },
    };
  }
}
