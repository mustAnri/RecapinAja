/**
 * Pure spreadsheet parsing + time-list row extraction.
 * Source-agnostic (any CSV matrix) and network-free so it is fully
 * unit-testable.
 *
 * Column semantics are decided by the user: they pick the time column and
 * the starting data row. No specific header name is required — time hints
 * only pre-select a default. The date is entered manually in the UI, not
 * read from the sheet.
 */

import { parseTimeCell } from '../../utils/dateFormatter';
import type { ImportedSheet, RowSelection, SpreadsheetRow } from '../../types/spreadsheet';

/** Lower-cased header hints used to pre-select the time column default. */
const TIME_HINTS = ['jam', 'waktu', 'time'];

/**
 * Parse a raw cell matrix (row 1 = header by default) into an ImportedSheet.
 * No column semantics are assumed — the user assigns them later.
 */
export function parseSheetValues(values: string[][] | undefined): Pick<ImportedSheet, 'headers' | 'rows'> {
  const matrix = (values ?? []).map((row) => row.map((cell) => (cell ?? '').trim()));
  const headers = matrix[0] ?? [];
  return { headers, rows: matrix };
}

/** Headers for a 1-based header row (falls back to row 1). */
export function rowHeaders(sheet: ImportedSheet, headerRow: number): string[] {
  const row = sheet.rows[Math.max(0, headerRow - 1)];
  return row ?? sheet.headers;
}

function firstHeaderMatch(headers: string[], hints: string[]): number | null {
  const lower = headers.map((h) => h.toLowerCase());
  // exact hint match first, then substring match
  for (const hint of hints) {
    const exact = lower.findIndex((h) => h === hint);
    if (exact >= 0) return exact;
  }
  for (const hint of hints) {
    const partial = lower.findIndex((h) => h !== '' && h.includes(hint));
    if (partial >= 0) return partial;
  }
  return null;
}

/** Pre-select the most likely time column (user can override). */
export function guessTimeColumn(headers: string[]): number | null {
  return firstHeaderMatch(headers, TIME_HINTS);
}

/** True when the time column is selected. */
export function isSelectionComplete(selection: RowSelection): boolean {
  return selection.timeColumn !== null;
}

/** Human-readable list of roles that still need a column. */
export function describeUnselectedRoles(selection: RowSelection): string[] {
  const missing: string[] = [];
  if (selection.timeColumn === null) missing.push('Time');
  return missing;
}

export interface ExtractedRows {
  rows: SpreadsheetRow[];
  /** Blank rows silently skipped (common at the end of exports). */
  skippedBlank: number;
}

/**
 * Extract the time list from the selected column.
 *
 * - Data starts at `selection.startRow` (1-based spreadsheet numbering); when
 *   it is not after the header row, the row right after the header is used.
 * - Completely blank rows are skipped silently.
 * - Rows with an invalid or missing time are kept with a clear error so the
 *   corresponding photo fails visibly instead of receiving a fabricated
 *   timestamp.
 */
export function extractTimestampRows(sheet: ImportedSheet, selection: RowSelection): ExtractedRows {
  const { timeColumn, headerRow, startRow } = selection;
  const rows: SpreadsheetRow[] = [];
  let skippedBlank = 0;
  if (timeColumn === null) return { rows, skippedBlank };

  const firstIndex = Math.max(startRow, headerRow + 1) - 1; // 0-based
  for (let i = firstIndex; i < sheet.rows.length; i += 1) {
    const raw = sheet.rows[i] ?? [];
    if (raw.every((cell) => cell.trim() === '')) {
      skippedBlank += 1;
      continue;
    }

    const time = (raw[timeColumn] ?? '').trim();
    const error = !time ? 'Time is empty' : parseTimeCell(time) ? null : `Invalid time: "${time}"`;
    rows.push({ time, sheetRowNumber: i + 1, error });
  }

  return { rows, skippedBlank };
}
