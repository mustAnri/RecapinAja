import { describe, expect, it } from 'vitest';
import {
  baseNameOf,
  buildOutputFilename,
  comparePhotoNames,
  extensionOf,
  sortPhotosByFilename,
} from './imageOrdering';

const file = (name: string) => new File(['x'], name, { type: 'image/jpeg' });

describe('comparePhotoNames', () => {
  it('orders numbers by value, not by digit string (IMG_2 < IMG_10)', () => {
    expect(comparePhotoNames('IMG_2.jpg', 'IMG_10.jpg')).toBeLessThan(0);
    expect(comparePhotoNames('IMG_10.jpg', 'IMG_2.jpg')).toBeGreaterThan(0);
  });

  it('is case-insensitive', () => {
    expect(comparePhotoNames('img_001.JPG', 'IMG_001.jpg')).toBe(0);
  });
});

describe('sortPhotosByFilename', () => {
  it('sorts deterministically regardless of upload order (§14)', () => {
    const input = [file('IMG_10.jpg'), file('IMG_2.jpg'), file('IMG_1.jpg'), file('IMG_100.jpg')];
    expect(sortPhotosByFilename(input).map((f) => f.name)).toEqual([
      'IMG_1.jpg',
      'IMG_2.jpg',
      'IMG_10.jpg',
      'IMG_100.jpg',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [file('b.jpg'), file('a.jpg')];
    sortPhotosByFilename(input);
    expect(input.map((f) => f.name)).toEqual(['b.jpg', 'a.jpg']);
  });
});

describe('extensionOf / baseNameOf', () => {
  it('extracts a lower-case extension', () => {
    expect(extensionOf('PHOTO.JPG')).toBe('.jpg');
    expect(extensionOf('no-extension')).toBe('');
  });

  it('extracts the base name', () => {
    expect(baseNameOf('IMG_001.jpg')).toBe('IMG_001');
    expect(baseNameOf('plain')).toBe('plain');
  });
});

describe('buildOutputFilename', () => {
  it('appends _timestamp and preserves the extension (§31)', () => {
    expect(buildOutputFilename('IMG_001.jpg')).toBe('IMG_001_timestamp.jpg');
    expect(buildOutputFilename('foto.PNG')).toBe('foto_timestamp.png');
  });

  it('never matches the original name (§30 originals untouched)', () => {
    const original = 'IMG_001.jpg';
    expect(buildOutputFilename(original)).not.toBe(original);
  });
});
