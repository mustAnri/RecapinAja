/**
 * Pure spreadsheet parsing + timestamp row extraction.
 * Source-agnostic (any CSV matrix) and network-free so it is fully
 * unit-testable.
 *
 * Column semantics are decided by the user: date and time each come from a
 * sheet column or from one manually typed value applied to every row. No
 * specific header name is required — hints only pre-select defaults.
 */

import { parseDateCell, parseTimeCell } from '../../utils/dateFormatter';
import type { ImportedSheet, RowSelection, SpreadsheetRow } from '../../types/spreadsheet';

/** Lower-cased header hints used to pre-select the time column default. */
const TIME_HINTS = ['jam', 'waktu', 'time'];

/** Lower-cased header hints used to pre-select the date column default. */
const DATE_HINTS = ['tanggal', 'tgl', 'date'];

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

/** Pre-select the most likely date column (user can override). */
export function guessDateColumn(headers: string[]): number | null {
  return firstHeaderMatch(headers, DATE_HINTS);
}

/**
 * True when the selection can produce timestamp values. Each source is
 * checked independently: manual needs nothing, sheet needs its column.
 */
export function isSelectionComplete(selection: RowSelection): boolean {
  const dateOk = selection.dateSource === 'manual' || selection.dateColumn !== null;
  const timeOk = selection.timeSource === 'manual' || selection.timeColumn !== null;
  return dateOk && timeOk;
}

/** Human-readable list of roles that still need a column (sheet sources). */
export function describeUnselectedRoles(selection: RowSelection): string[] {
  const missing: string[] = [];
  if (selection.dateSource === 'sheet' && selection.dateColumn === null) missing.push('Date');
  if (selection.timeSource === 'sheet' && selection.timeColumn === null) missing.push('Time');
  return missing;
}

export interface ExtractedRows {
  rows: SpreadsheetRow[];
  /** Blank rows silently skipped (common at the end of exports). */
  skippedBlank: number;
}

/** The single typed values used for sources set to `'manual'`. */
export interface ManualTimestamps {
  /** Manually entered date applied to every row, e.g. "20/05/2022". */
  dateCell: string;
  /** Manually entered time applied to every row, e.g. "14:09". */
  timeCell: string;
}

/**
 * Per-row manual overrides keyed by `sheetRowNumber`. Lets the user fix a
 * wrong or invalid cell directly in the mapping preview without touching
 * the spreadsheet. An empty-string field means "not overridden".
 */
export type RowOverrides = Record<number, { date?: string; time?: string }>;

/**
 * Apply manual overrides onto extracted rows. Each override replaces the
 * cell text and re-validates it, so an edited value is judged exactly like
 * a spreadsheet value — never silently coerced. Rows without an override
 * pass through unchanged.
 */
export function applyRowOverrides(rows: SpreadsheetRow[], overrides: RowOverrides): SpreadsheetRow[] {
  return rows.map((row) => {
    const patch = overrides[row.sheetRowNumber];
    if (!patch) return row;
    const date = patch.date !== undefined ? patch.date : row.date;
    const time = patch.time !== undefined ? patch.time : row.time;
    return {
      ...row,
      date,
      dateError: dateErrorFor(date),
      time,
      error: timeErrorFor(time),
    };
  });
}

/**
 * Build timestamp rows from a typed list of times (Mode Cepat): one time
 * per line, all sharing one date. Blank lines are skipped without shifting
 * numbering gaps — line N maps to row number N. Invalid times keep their
 * error so the paired photo fails visibly, never guessed.
 */
export function buildTimeListRows(dateCell: string, timeLines: string[]): SpreadsheetRow[] {
  const date = dateCell.trim();
  const dateError = dateErrorFor(date);
  const rows: SpreadsheetRow[] = [];
  timeLines.forEach((line, index) => {
    const time = line.trim();
    if (!time) return;
    rows.push({
      date,
      dateError,
      time,
      sheetRowNumber: index + 1,
      error: timeErrorFor(time),
    });
  });
  return rows;
}

function dateErrorFor(cell: string): string | null {
  if (!cell) return 'Date is empty';
  return parseDateCell(cell) ? null : `Invalid date: "${cell}"`;
}

function timeErrorFor(cell: string): string | null {
  if (!cell) return 'Time is empty';
  return parseTimeCell(cell) ? null : `Invalid time: "${cell}"`;
}

/**
 * Extract one timestamp row per data row.
 *
 * - Data starts at `selection.startRow` (1-based spreadsheet numbering); when
 *   it is not after the header row, the row right after the header is used.
 * - Completely blank rows are skipped silently, so toggling a source never
 *   changes which rows get a photo.
 * - Rows with invalid/missing values are kept with clear errors so their
 *   photos fail visibly instead of receiving a fabricated timestamp.
 * - A manual source replicates its typed value onto every row.
 * - When BOTH sources are manual and the sheet has no data rows (e.g. no
 *   spreadsheet loaded at all), `fallbackRowCount` synthetic rows are
 *   created — one per photo — so a fully manual run still works.
 */
export function extractTimestampRows(
  sheet: ImportedSheet,
  selection: RowSelection,
  manual?: ManualTimestamps,
  fallbackRowCount = 0,
): ExtractedRows {
  const { headerRow, startRow } = selection;
  const rows: SpreadsheetRow[] = [];
  let skippedBlank = 0;

  const isManualDate = selection.dateSource === 'manual';
  const isManualTime = selection.timeSource === 'manual';

  // Sheet sources need their column; without it no rows can be extracted.
  if (!isManualDate && selection.dateColumn === null) return { rows, skippedBlank };
  if (!isManualTime && selection.timeColumn === null) return { rows, skippedBlank };

  const manualDate = isManualDate ? (manual?.dateCell ?? '').trim() : '';
  const manualTime = isManualTime ? (manual?.timeCell ?? '').trim() : '';
  const manualDateError = isManualDate ? dateErrorFor(manualDate) : null;
  const manualTimeError = isManualTime ? timeErrorFor(manualTime) : null;

  const firstIndex = Math.max(startRow, headerRow + 1) - 1; // 0-based
  for (let i = firstIndex; i < sheet.rows.length; i += 1) {
    const raw = sheet.rows[i] ?? [];
    if (raw.every((cell) => cell.trim() === '')) {
      skippedBlank += 1;
      continue;
    }

    const date = isManualDate ? manualDate : (raw[selection.dateColumn as number] ?? '').trim();
    const time = isManualTime ? manualTime : (raw[selection.timeColumn as number] ?? '').trim();
    rows.push({
      date,
      dateError: isManualDate ? manualDateError : dateErrorFor(date),
      time,
      sheetRowNumber: i + 1,
      error: isManualTime ? manualTimeError : timeErrorFor(time),
    });
  }

  // Fully manual run without any sheet data: one synthetic row per photo.
  if (isManualDate && isManualTime && rows.length === 0) {
    for (let i = 0; i < fallbackRowCount; i += 1) {
      rows.push({
        date: manualDate,
        dateError: manualDateError,
        time: manualTime,
        sheetRowNumber: i + 1,
        error: manualTimeError,
      });
    }
  }

  return { rows, skippedBlank };
}
