import { describe, expect, it } from 'vitest';
import type { CropTemplate } from '../../types/processing';
import { applyCropTemplate, centerSquareTemplate, outputMimeType } from './index';

const template = (partial: Partial<CropTemplate> = {}): CropTemplate => ({
  xFraction: 0.25,
  yFraction: 0.1,
  sizeFraction: 0.5,
  sourceWidth: 4000,
  sourceHeight: 3000,
  ...partial,
});

describe('applyCropTemplate (§20)', () => {
  it('replays the same fractions on the preview resolution', () => {
    const result = applyCropTemplate(4000, 3000, template());
    expect(result).toEqual({ sx: 1000, sy: 300, side: 1500 });
  });

  it('scales proportionally to a different resolution', () => {
    const result = applyCropTemplate(2000, 1500, template());
    expect(result).toEqual({ sx: 500, sy: 150, side: 750 });
  });

  it('keeps the crop inside portrait photos (size over shortest side)', () => {
    const result = applyCropTemplate(3000, 4000, template({ sizeFraction: 1 }));
    expect(result?.side).toBe(3000);
    expect(result?.sx).toBeLessThanOrEqual(0);
    expect(result?.sy).toBeGreaterThanOrEqual(0);
  });

  it('clamps the origin so the square never leaves the image', () => {
    const result = applyCropTemplate(1000, 1000, template({ xFraction: 0.9, yFraction: 0.9 }));
    expect(result).toEqual({ sx: 500, sy: 500, side: 500 });
  });

  it('clamps fractions above 1', () => {
    const result = applyCropTemplate(1000, 1000, template({ sizeFraction: 2 }));
    expect(result?.side).toBe(1000);
  });

  it('rejects degenerate sizes', () => {
    expect(applyCropTemplate(0, 0, template())).toBeNull();
    expect(applyCropTemplate(10, 10, template({ sizeFraction: 0.01 }))).toBeNull();
    expect(applyCropTemplate(Number.NaN, 100, template())).toBeNull();
  });
});

describe('centerSquareTemplate (§18 default)', () => {
  it('centers the largest square on a landscape photo', () => {
    const t = centerSquareTemplate(4000, 3000);
    expect(t.sizeFraction).toBe(1);
    expect(Math.round(t.xFraction * 4000)).toBe(500);
    expect(t.yFraction).toBe(0);
  });

  it('centers the largest square on a portrait photo', () => {
    const t = centerSquareTemplate(3000, 4000);
    expect(Math.round(t.yFraction * 4000)).toBe(500);
    expect(t.xFraction).toBe(0);
  });

  it('is a no-op on an already square photo', () => {
    const t = centerSquareTemplate(2000, 2000);
    expect(t.xFraction).toBe(0);
    expect(t.yFraction).toBe(0);
    expect(t.sizeFraction).toBe(1);
  });
});

describe('outputMimeType (§31)', () => {
  it('keeps the original format', () => {
    expect(outputMimeType('IMG_001.jpg')).toBe('image/jpeg');
    expect(outputMimeType('IMG_001.JPEG')).toBe('image/jpeg');
    expect(outputMimeType('shot.png')).toBe('image/png');
  });

  it('falls back to JPEG for unknown extensions', () => {
    expect(outputMimeType('file.webp')).toBe('image/jpeg');
    expect(outputMimeType('noext')).toBe('image/jpeg');
  });
});
