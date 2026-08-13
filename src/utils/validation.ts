/**
 * Input validation helpers (PRDv2 §13, §32).
 */

/** MIME types accepted (§13). */
export const SUPPORTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png']);

/** Extensions accepted when scanning a folder (§13). */
export const SUPPORTED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

/** Per-file safety cap; well beyond any camera JPG/PNG. */
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024; // 100 MB

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/** Check one folder entry against the supported-format rules (§13). */
export function validatePhotoEntry(name: string, size: number, mime = ''): string | null {
  const extensionOk = SUPPORTED_EXTENSIONS.has(extensionOf(name));
  const typeOk = mime !== '' && SUPPORTED_IMAGE_TYPES.has(mime);
  if (!extensionOk && !typeOk) return null; // not a photo — ignored by the scan
  if (size === 0) return 'File is empty';
  if (size > MAX_FILE_SIZE_BYTES) {
    return `File too large (${formatBytes(size)}; limit is ${formatBytes(MAX_FILE_SIZE_BYTES)})`;
  }
  return null;
}

/** True when a folder entry is a supported photo (by extension or MIME). */
export function isSupportedPhoto(name: string, mime = ''): boolean {
  return SUPPORTED_EXTENSIONS.has(extensionOf(name)) || SUPPORTED_IMAGE_TYPES.has(mime);
}

