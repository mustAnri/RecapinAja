/**
 * Sequential photo-to-spreadsheet mapping (PRDv2 §14, §15).
 *
 * Photos sorted by filename are paired 1:1 with the extracted spreadsheet
 * rows in row order: photo #1 -> first data row, photo #2 -> second, and so
 * on. Filename matching is deliberately NOT part of the MVP (§42).
 */

import type { SequentialMapping, SpreadsheetRow } from '../../types/spreadsheet';

/**
 * Build the sequential mapping. Never throws: count mismatches are surfaced
 * in the returned report so the UI can warn before processing (§16, §32).
 */
export function buildSequentialMapping(
  sortedPhotos: File[],
  rows: SpreadsheetRow[],
): SequentialMapping {
  const pairCount = Math.min(sortedPhotos.length, rows.length);
  const entries = sortedPhotos.slice(0, pairCount).map((file, index) => ({
    file,
    filename: file.name,
    row: rows[index],
  }));

  return {
    entries,
    extraPhotos: sortedPhotos.slice(pairCount),
    extraRows: rows.slice(pairCount),
    counts: {
      photos: sortedPhotos.length,
      rows: rows.length,
      mapped: pairCount,
      invalidRows: entries.filter((e) => e.row.error !== null || e.row.dateError !== null).length,
    },
  };
}
