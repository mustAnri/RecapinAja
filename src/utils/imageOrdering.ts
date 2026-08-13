/**
 * Photo ordering (PRDv2 §14) and output naming (§31).
 *
 * Photos are processed sequentially, so their order must be deterministic:
 * filename ascending with a natural numeric comparator (IMG_2 < IMG_10).
 * The detected order is displayed to the user before processing (§14).
 */

/** Natural-order comparator for filenames: case-insensitive, digits by value. */
export function comparePhotoNames(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Deterministic filename-ascending sort (never the upload order). */
export function sortPhotosByFilename(files: File[]): File[] {
  return [...files].sort((a, b) => comparePhotoNames(a.name, b.name));
}

/** Lower-case extension including the dot, e.g. ".jpg". */
export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot).toLowerCase() : '';
}

/** Base name without its extension. */
export function baseNameOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(0, dot) : filename;
}

/**
 * Output filename for a processed photo (§31):
 * `<original_name>_timestamp.<extension>` — original extension preserved,
 * originals are never overwritten (§30) because the name always differs.
 */
export function buildOutputFilename(originalFilename: string): string {
  const ext = extensionOf(originalFilename);
  const base = baseNameOf(originalFilename);
  return `${base}_timestamp${ext}`;
}
