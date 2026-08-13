/**
 * Data models for the spreadsheet source (PRDv2 §4–§12).
 *
 * No OAuth is ever used: the sheet is fetched from a publicly accessible
 * Google Sheets CSV endpoint (published or "anyone with the link").
 */

/**
 * A spreadsheet as read from a public CSV endpoint, before any column
 * semantics are assumed. Column roles are decided by the user.
 */
export interface ImportedSheet {
  /** Where the data came from — a link or worksheet label (for display). */
  sourceTitle: string;
  /** Spreadsheet id parsed from the URL, or null for direct CSV links. */
  spreadsheetId: string | null;
  /** Worksheet gid that was actually loaded (0 for the first worksheet). */
  gid: number;
  /** Headers exactly as read from the header row (trimmed). */
  headers: string[];
  /**
   * All rows as trimmed cell strings, including the header row at index 0.
   * Data rows normally start at index 1.
   */
  rows: string[][];
}

/**
 * User configuration for reading the time list from the sheet. Column
 * indices point into the header row. The date is NOT taken from the sheet —
 * it is typed manually once and applied to every photo.
 */
export interface RowSelection {
  /** Column holding the time, e.g. "Jam Test Drive". */
  timeColumn: number | null;
  /** 1-based spreadsheet row containing the headers (usually 1). */
  headerRow: number;
  /**
   * 1-based spreadsheet row where the first data row lives.
   * Default 2 (row 1 = header). Rows above it are ignored.
   */
  startRow: number;
}

export const DEFAULT_HEADER_ROW = 1;
export const DEFAULT_START_ROW = 2;

export const EMPTY_SELECTION: RowSelection = {
  timeColumn: null,
  headerRow: DEFAULT_HEADER_ROW,
  startRow: DEFAULT_START_ROW,
};

/**
 * One resolved time-list row. `error` carries a human-readable problem
 * (missing/invalid time); null means the row is usable. Invalid rows are
 * kept so their photo fails visibly instead of receiving a fabricated
 * timestamp.
 */
export interface SpreadsheetRow {
  /** Time cell exactly as written in the sheet, e.g. "14:09". */
  time: string;
  /** 1-based row number in the spreadsheet — used in user-facing messages. */
  sheetRowNumber: number;
  /** Validation problem, or null when the row is usable. */
  error: string | null;
}

/** One sequential pair: the Nth sorted photo <-> the Nth data row (§15). */
export interface SequentialMappingEntry {
  file: File;
  filename: string;
  row: SpreadsheetRow;
}

/** Full sequential mapping report used by the review screens (§16, §32). */
export interface SequentialMapping {
  entries: SequentialMappingEntry[];
  /** Photos with no spreadsheet row left to pair with (§32). */
  extraPhotos: File[];
  /** Spreadsheet rows with no photo (§32). */
  extraRows: SpreadsheetRow[];
  counts: {
    photos: number;
    rows: number;
    mapped: number;
    invalidRows: number;
  };
}
