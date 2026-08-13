import { describe, expect, it } from 'vitest';
import {
  MAX_FILE_SIZE_BYTES,
  formatBytes,
  isSupportedPhoto,
  validatePhotoEntry,
} from './validation';

describe('isSupportedPhoto', () => {
  it('accepts jpg/jpeg/png by extension', () => {
    expect(isSupportedPhoto('a.jpg')).toBe(true);
    expect(isSupportedPhoto('a.JPEG')).toBe(true);
    expect(isSupportedPhoto('a.png')).toBe(true);
  });

  it('rejects unsupported extensions without a MIME', () => {
    expect(isSupportedPhoto('a.webp')).toBe(false);
    expect(isSupportedPhoto('a.heic')).toBe(false);
    expect(isSupportedPhoto('notes.txt')).toBe(false);
  });

  it('accepts a supported MIME even with an unusual extension', () => {
    expect(isSupportedPhoto('upload', 'image/png')).toBe(true);
  });
});

describe('validatePhotoEntry', () => {
  it('returns null for a normal photo', () => {
    expect(validatePhotoEntry('a.jpg', 1024, 'image/jpeg')).toBeNull();
  });

  it('ignores non-photos (scan skips them silently)', () => {
    expect(validatePhotoEntry('readme.txt', 10)).toBeNull();
  });

  it('rejects empty files', () => {
    expect(validatePhotoEntry('a.jpg', 0, 'image/jpeg')).toMatch(/empty/i);
  });

  it('rejects files above the size cap', () => {
    expect(validatePhotoEntry('a.jpg', MAX_FILE_SIZE_BYTES + 1, 'image/jpeg')).toMatch(/too large/i);
  });
});

describe('formatBytes', () => {
  it('formats bytes, KB, MB and GB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });
});
