import type { TimestampPosition } from '../../types/processing';

export interface TimestampStyle {
  /** CSS font-family stack. */
  fontFamily: string;
  /** CSS font weight. */
  fontWeight: number;
  /**
   * Font size as a fraction of the image side length.
   * Clamped by `minFontSize` / `maxFontSize`.
   */
  fontSizeRatio: number;
  minFontSize: number;
  maxFontSize: number;
  /** Text color. */
  color: string;
  /** Optional background pill color behind the text (null = none). */
  background: string | null;
  /** Padding around text as a fraction of the font size. */
  paddingRatio: number;
  /** Distance from image edges as a fraction of the font size. */
  marginRatio: number;
  /** Text shadow for extra readability. */
  shadow: { color: string; blurRatio: number; offsetRatio: number } | null;
}

/** Default styling per PRD §17: white, sans-serif, bold, subtle shadow. */
export const DEFAULT_TIMESTAMP_STYLE: TimestampStyle = {
  fontFamily:
    'Inter, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontWeight: 700,
  fontSizeRatio: 0.045,
  minFontSize: 20,
  maxFontSize: 96,
  color: '#ffffff',
  background: 'rgba(0, 0, 0, 0.45)',
  paddingRatio: 0.45,
  marginRatio: 0.7,
  shadow: { color: 'rgba(0, 0, 0, 0.85)', blurRatio: 0.2, offsetRatio: 0.06 },
};

export function resolveFontSize(sideLength: number, style: TimestampStyle): number {
  return Math.round(
    Math.min(
      Math.max(sideLength * style.fontSizeRatio, style.minFontSize),
      style.maxFontSize,
    ),
  );
}

export interface BoxPosition {
  /** Top-left x of the timestamp box. */
  x: number;
  /** Top-left y of the timestamp box. */
  y: number;
}

/**
 * Resolve the top-left corner of the timestamp box for a given position.
 * Designed for future customization (PRD §16): every position maps through
 * this single function.
 */
export function resolveBoxPosition(
  position: TimestampPosition,
  canvasWidth: number,
  canvasHeight: number,
  boxWidth: number,
  boxHeight: number,
  margin: number,
): BoxPosition {
  const [vertical, horizontal] = position.split('-');
  let x: number;
  if (horizontal === 'left') x = margin;
  else if (horizontal === 'center') x = (canvasWidth - boxWidth) / 2;
  else x = canvasWidth - boxWidth - margin;

  let y: number;
  if (vertical === 'top') y = margin;
  else y = canvasHeight - boxHeight - margin;

  // Keep the box inside the canvas even for extreme sizes.
  x = Math.max(0, Math.min(x, canvasWidth - boxWidth));
  y = Math.max(0, Math.min(y, canvasHeight - boxHeight));
  return { x, y };
}
