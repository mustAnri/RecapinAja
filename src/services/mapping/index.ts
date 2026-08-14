/**
 * Photo-to-spreadsheet mapping (PRDv2 §14, §15).
 *
 * Two deterministic auto strategies:
 * - sequential: photos sorted by filename pair 1:1 with rows in row order.
 * - byName: each photo's base filename is matched against a name column in
 *   the sheet (e.g. "Nama Customer" ↔ "ERDI MAYADI.jpg"). Matching is exact
 *   after normalization — ambiguity is never resolved by guessing (§32).
 *
 * On top of either strategy the user may place pairs by hand:
 * `applyManualPairs` layers explicit photo → row choices over the auto
 * pairs. A manual choice always wins; taking a row away from another photo
 * un-pairs that photo visibly (it becomes an extra photo) instead of ever
 * guessing a replacement.
 */

import type { SequentialMapping, SpreadsheetRow } from '../../types/spreadsheet';
import { baseNameOf } from '../../utils/imageOrdering';

/**
 * Normalize a name for matching: case-folded, diacritics stripped, every
 * run of non-alphanumeric characters collapsed to a single space.
 * "Erdi  mayardi." and "ERDI MAYADI" become the same key.
 */
export function normalizeNameKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/ +/g, ' ');
}

/**
 * Sequential auto pairs: photo index N ↔ row index N.
 * Returns a map of filename → index into `rows`.
 */
export function sequentialPairs(sortedPhotos: File[], rows: SpreadsheetRow[]): Map<string, number> {
  const pairCount = Math.min(sortedPhotos.length, rows.length);
  const pairs = new Map<string, number>();
  sortedPhotos.slice(0, pairCount).forEach((file, index) => pairs.set(file.name, index));
  return pairs;
}

/**
 * Filename-based auto pairs: a photo pairs with the single row whose name
 * cell normalizes to the photo's base filename. Ambiguity maps nothing (§32):
 * - a name claimed by 2+ rows, or requested by 2+ photos, pairs nothing;
 * - blank name cells can never match.
 * Returns a map of filename → index into `rows`.
 */
export function namePairs(sortedPhotos: File[], rows: SpreadsheetRow[]): Map<string, number> {
  // key -> row indexes sharing that normalized name
  const rowsByKey = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const key = normalizeNameKey(row.name ?? '');
    if (!key) return;
    const list = rowsByKey.get(key);
    if (list) list.push(index);
    else rowsByKey.set(key, [index]);
  });

  // key -> photo count requesting it (detect photo-side collisions too)
  const photoCountByKey = new Map<string, number>();
  for (const file of sortedPhotos) {
    const key = normalizeNameKey(baseNameOf(file.name));
    if (!key) continue;
    photoCountByKey.set(key, (photoCountByKey.get(key) ?? 0) + 1);
  }

  const pairs = new Map<string, number>();
  for (const file of sortedPhotos) {
    const key = normalizeNameKey(baseNameOf(file.name));
    const rowIndexes = key ? rowsByKey.get(key) : undefined;
    const photoCount = key ? (photoCountByKey.get(key) ?? 0) : 0;
    if (rowIndexes && rowIndexes.length === 1 && photoCount === 1) {
      pairs.set(file.name, rowIndexes[0]);
    }
  }
  return pairs;
}

/** Auto pairs for the chosen match mode. */
export function buildAutoPairs(
  mode: 'sequential' | 'byName',
  sortedPhotos: File[],
  rows: SpreadsheetRow[],
): Map<string, number> {
  return mode === 'byName' ? namePairs(sortedPhotos, rows) : sequentialPairs(sortedPhotos, rows);
}

/**
 * Materialize a mapping report from a set of unique pairs.
 * Photos appear in sorted order; unpaired photos land in `extraPhotos`,
 * unclaimed rows in `extraRows`.
 */
export function mappingFromPairs(
  sortedPhotos: File[],
  rows: SpreadsheetRow[],
  pairs: ReadonlyMap<string, number>,
): SequentialMapping {
  const usedRows = new Set<number>();
  const entries: SequentialMapping['entries'] = [];
  const extraPhotos: File[] = [];

  for (const file of sortedPhotos) {
    const rowIndex = pairs.get(file.name);
    if (rowIndex !== undefined && rowIndex >= 0 && rowIndex < rows.length && !usedRows.has(rowIndex)) {
      usedRows.add(rowIndex);
      entries.push({ file, filename: file.name, row: rows[rowIndex] });
    } else {
      extraPhotos.push(file);
    }
  }

  const extraRows = rows.filter((_row, index) => !usedRows.has(index));

  return {
    entries,
    extraPhotos,
    extraRows,
    counts: {
      photos: sortedPhotos.length,
      rows: rows.length,
      mapped: entries.length,
      invalidRows: entries.filter((e) => e.row.error !== null || e.row.dateError !== null).length,
    },
  };
}

/**
 * Layer the user's manual photo → row choices over the auto pairs.
 *
 * Rules (all explicit, never guessed):
 * - `null` value: the photo is deliberately un-paired (copied as-is later).
 * - taking a row already paired to another photo un-pairs that photo.
 * - overriding back to the row the auto strategy chose is fine — it simply
 *   becomes an explicit choice.
 * - entries naming an unknown photo or an out-of-range row are ignored.
 */
export function applyManualPairs(
  sortedPhotos: File[],
  rows: SpreadsheetRow[],
  autoPairs: ReadonlyMap<string, number>,
  manual: ReadonlyMap<string, number | null>,
): Map<string, number> {
  const photoNames = new Set(sortedPhotos.map((file) => file.name));
  const pairs = new Map<string, number>();

  // Seed with valid auto pairs, tracking who owns each row.
  const rowOwner = new Map<number, string>();
  for (const file of sortedPhotos) {
    const rowIndex = autoPairs.get(file.name);
    if (rowIndex === undefined || rowIndex < 0 || rowIndex >= rows.length) continue;
    pairs.set(file.name, rowIndex);
    rowOwner.set(rowIndex, file.name);
  }

  // Apply manual choices in insertion order — later choices win.
  for (const [filename, rowIndex] of manual) {
    if (!photoNames.has(filename)) continue;
    // Stale/out-of-range entries are ignored entirely — the auto pair stands.
    if (rowIndex !== null && (rowIndex < 0 || rowIndex >= rows.length)) continue;

    // Release the row this photo owned, if any.
    const previous = pairs.get(filename);
    if (previous !== undefined && rowOwner.get(previous) === filename) {
      rowOwner.delete(previous);
    }
    pairs.delete(filename);

    if (rowIndex === null) continue; // explicitly un-paired

    // Steal the target row: its previous owner becomes un-paired.
    const owner = rowOwner.get(rowIndex);
    if (owner !== undefined) pairs.delete(owner);
    pairs.set(filename, rowIndex);
    rowOwner.set(rowIndex, filename);
  }

  return pairs;
}

/**
 * Build the sequential mapping (kept for callers/tests). Never throws:
 * count mismatches are surfaced in the returned report (§16, §32).
 */
export function buildSequentialMapping(
  sortedPhotos: File[],
  rows: SpreadsheetRow[],
): SequentialMapping {
  return mappingFromPairs(sortedPhotos, rows, sequentialPairs(sortedPhotos, rows));
}

/**
 * Build the filename-based mapping (kept for callers/tests). Anything
 * ambiguous or unmatched is reported, never guessed (§32).
 */
export function buildNameMapping(
  sortedPhotos: File[],
  rows: SpreadsheetRow[],
): SequentialMapping {
  return mappingFromPairs(sortedPhotos, rows, namePairs(sortedPhotos, rows));
}
