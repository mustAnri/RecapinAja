import { describe, expect, it } from 'vitest';
import type { ImportedSheet, RowSelection, SpreadsheetRow } from '../../types/spreadsheet';
import {
  applyRowOverrides,
  buildTimeListRows,
  describeUnselectedRoles,
  extractTimestampRows,
  guessDateColumn,
  guessNameColumn,
  guessTimeColumn,
  isSelectionComplete,
  parseSheetValues,
  rowHeaders,
} from './parse';

const sheet = (headers: string[], rows: string[][]): ImportedSheet => ({
  sourceTitle: 'Test',
  spreadsheetId: null,
  gid: 0,
  headers,
  rows: [headers, ...rows],
});

const SHEET_SELECTION: RowSelection = {
  timeColumn: 2,
  dateColumn: 1,
  dateSource: 'sheet',
  timeSource: 'sheet',
  matchMode: 'sequential',
  nameColumn: null,
  headerRow: 1,
  startRow: 2,
};

describe('parseSheetValues', () => {
  it('treats the first row as headers and trims cells', () => {
    const parsed = parseSheetValues([
      [' No ', ' Jam Test Drive '],
      ['1', '14:09'],
    ]);
    expect(parsed.headers).toEqual(['No', 'Jam Test Drive']);
    expect(parsed.rows[1]).toEqual(['1', '14:09']);
  });

  it('handles undefined input', () => {
    const parsed = parseSheetValues(undefined);
    expect(parsed.headers).toEqual([]);
    expect(parsed.rows).toEqual([]);
  });
});

describe('column guessing', () => {
  it('finds Indonesian time headers', () => {
    expect(guessTimeColumn(['No', 'Nama', 'Tanggal', 'Jam Test Drive'])).toBe(3);
  });

  it('finds English time headers', () => {
    expect(guessTimeColumn(['Name', 'Date', 'Time'])).toBe(2);
  });

  it('finds Indonesian date headers', () => {
    expect(guessDateColumn(['No', 'Nama', 'Tanggal', 'Jam'])).toBe(2);
  });

  it('finds English date headers', () => {
    expect(guessDateColumn(['Name', 'Date', 'Time'])).toBe(1);
  });

  it('returns null when nothing matches', () => {
    expect(guessTimeColumn(['No', 'Nama'])).toBeNull();
    expect(guessDateColumn(['No', 'Nama'])).toBeNull();
  });

  it('prefers the customer column when several headers contain "nama"', () => {
    const headers = [
      'Timestamp',
      'Nama Sales',
      'Nama Customer',
      'No. Hp',
      'Tanggal Test Drive',
      'Start Test Drive',
    ];
    expect(guessNameColumn(headers)).toBe(2);
  });

  it('falls back to a plain name header', () => {
    expect(guessNameColumn(['No', 'Nama', 'Jam'])).toBe(1);
    expect(guessNameColumn(['Name', 'Time'])).toBe(0);
  });

  it('never mistakes the Timestamp column for the time column', () => {
    // Real export trap: "Timestamp" must not match the "time" hint.
    expect(guessTimeColumn(['Timestamp', 'Nama Customer', 'Start Test Drive'])).toBe(2);
  });
});

describe('selection completeness', () => {
  it('is complete when both columns are chosen (sheet sources)', () => {
    expect(isSelectionComplete(SHEET_SELECTION)).toBe(true);
  });

  it('lists missing roles per value source', () => {
    expect(
      describeUnselectedRoles({ ...SHEET_SELECTION, dateColumn: null, timeColumn: null }),
    ).toEqual(['Date', 'Time']);
    expect(describeUnselectedRoles(SHEET_SELECTION)).toEqual([]);
  });

  it('a manual source removes the need for that column', () => {
    expect(
      isSelectionComplete({ ...SHEET_SELECTION, dateColumn: null, dateSource: 'manual' }),
    ).toBe(true);
    expect(
      isSelectionComplete({ ...SHEET_SELECTION, timeColumn: null, timeSource: 'manual' }),
    ).toBe(true);
    expect(isSelectionComplete({ ...SHEET_SELECTION, dateColumn: null })).toBe(false);
    expect(isSelectionComplete({ ...SHEET_SELECTION, timeColumn: null })).toBe(false);
  });
});

describe('extractTimestampRows (sheet sources)', () => {
  it('extracts date + time with spreadsheet row numbers', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [
      ['1', '20/05/2022', '14:09'],
      ['2', '21/05/2022', '09:30'],
    ]);
    const { rows } = extractTimestampRows(data, SHEET_SELECTION);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      date: '20/05/2022',
      dateError: null,
      time: '14:09',
      sheetRowNumber: 2,
      error: null,
    });
    expect(rows[1].sheetRowNumber).toBe(3);
  });

  it('skips completely blank rows silently', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [
      ['1', '20/05/2022', '14:09'],
      ['', '', ''],
      ['2', '21/05/2022', '09:30'],
    ]);
    const { rows, skippedBlank } = extractTimestampRows(data, SHEET_SELECTION);
    expect(rows).toHaveLength(2);
    expect(skippedBlank).toBe(1);
  });

  it('keeps invalid cells with errors instead of dropping them', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [['1', 'bukan tanggal', 'bukan jam']]);
    const { rows } = extractTimestampRows(data, SHEET_SELECTION);
    expect(rows[0].dateError).toMatch(/Invalid date/);
    expect(rows[0].error).toMatch(/Invalid time/);
  });

  it('flags empty cells', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [['1', '', '']]);
    const { rows } = extractTimestampRows(data, SHEET_SELECTION);
    expect(rows[0].dateError).toMatch(/Date is empty/);
    expect(rows[0].error).toMatch(/Time is empty/);
  });

  it('honours a later start row', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [
      ['x', '01/01/2020', '00:00'],
      ['1', '20/05/2022', '14:09'],
    ]);
    const { rows } = extractTimestampRows(data, { ...SHEET_SELECTION, startRow: 3 });
    expect(rows).toHaveLength(1);
    expect(rows[0].sheetRowNumber).toBe(3);
  });

  it('never starts before the header row', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [['1', '20/05/2022', '14:09']]);
    const { rows } = extractTimestampRows(data, { ...SHEET_SELECTION, startRow: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].sheetRowNumber).toBe(2);
  });

  it('returns nothing until a needed sheet column is chosen', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [['1', '20/05/2022', '14:09']]);
    expect(extractTimestampRows(data, { ...SHEET_SELECTION, timeColumn: null }).rows).toEqual([]);
    expect(extractTimestampRows(data, { ...SHEET_SELECTION, dateColumn: null }).rows).toEqual([]);
  });
});

describe('extractTimestampRows (independent sources)', () => {
  it('manual time keeps per-row dates from the sheet', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [
      ['1', '20/05/2022', '14:09'],
      ['2', '21/05/2022', '09:30'],
    ]);
    const { rows } = extractTimestampRows(
      data,
      { ...SHEET_SELECTION, timeSource: 'manual' },
      { dateCell: '', timeCell: '10:00' },
    );
    expect(rows.map((r) => r.date)).toEqual(['20/05/2022', '21/05/2022']);
    expect(rows.map((r) => r.time)).toEqual(['10:00', '10:00']);
    expect(rows.every((r) => r.error === null)).toBe(true);
  });

  it('manual date keeps per-row times from the sheet', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [
      ['1', '20/05/2022', '14:09'],
      ['2', '21/05/2022', '09:30'],
    ]);
    const { rows } = extractTimestampRows(
      data,
      { ...SHEET_SELECTION, dateSource: 'manual' },
      { dateCell: '01/06/2022', timeCell: '' },
    );
    expect(rows.map((r) => r.date)).toEqual(['01/06/2022', '01/06/2022']);
    expect(rows.map((r) => r.time)).toEqual(['14:09', '09:30']);
    expect(rows.every((r) => r.dateError === null)).toBe(true);
  });

  it('invalid manual values mark every row', () => {
    const data = sheet(['No', 'Jam'], [['1', '14:09'], ['2', '09:30']]);
    const { rows } = extractTimestampRows(
      data,
      {
        timeColumn: 1,
        dateColumn: null,
        dateSource: 'manual',
        timeSource: 'sheet',
        matchMode: 'sequential',
        nameColumn: null,
        headerRow: 1,
        startRow: 2,
      },
      { dateCell: 'salah', timeCell: '' },
    );
    expect(rows.every((r) => r.dateError !== null)).toBe(true);
    expect(rows.every((r) => r.error === null)).toBe(true);
  });
});

describe('extractTimestampRows (fully manual — no sheet)', () => {
  const empty: ImportedSheet = {
    sourceTitle: '',
    spreadsheetId: null,
    gid: 0,
    headers: [],
    rows: [],
  };

  const MANUAL_SELECTION: RowSelection = {
    timeColumn: null,
    dateColumn: null,
    dateSource: 'manual',
    timeSource: 'manual',
    matchMode: 'sequential',
    nameColumn: null,
    headerRow: 1,
    startRow: 2,
  };

  it('creates one row per photo with the typed date and time', () => {
    const { rows } = extractTimestampRows(
      empty,
      { ...MANUAL_SELECTION, startRow: 1 },
      { dateCell: '20/05/2022', timeCell: '14:09' },
      3,
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      date: '20/05/2022',
      dateError: null,
      time: '14:09',
      sheetRowNumber: 1,
      error: null,
    });
    expect(rows.map((r) => r.sheetRowNumber)).toEqual([1, 2, 3]);
  });

  it('defaults the count to zero', () => {
    const { rows } = extractTimestampRows(
      empty,
      { ...MANUAL_SELECTION, startRow: 1 },
      { dateCell: '20/05/2022', timeCell: '14:09' },
    );
    expect(rows).toEqual([]);
  });

  it('marks every synthetic row when the typed values are invalid', () => {
    const { rows } = extractTimestampRows(
      empty,
      { ...MANUAL_SELECTION, startRow: 1 },
      { dateCell: '', timeCell: '' },
      2,
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.dateError !== null && r.error !== null)).toBe(true);
  });
});

describe('rowHeaders', () => {
  it('returns headers for the selected header row', () => {
    const data: ImportedSheet = {
      sourceTitle: 't',
      spreadsheetId: null,
      gid: 0,
      headers: ['a', 'b'],
      rows: [
        ['judul laporan', ''],
        ['No', 'Jam'],
        ['1', '14:09'],
      ],
    };
    expect(rowHeaders(data, 2)).toEqual(['No', 'Jam']);
  });
});

describe('applyRowOverrides (§edit manual per baris)', () => {
  const rows: SpreadsheetRow[] = [
    { date: '20/05/2022', dateError: null, time: '99:99', sheetRowNumber: 2, error: 'Invalid time: "99:99"' },
    { date: '20/05/2022', dateError: null, time: '14:09', sheetRowNumber: 3, error: null },
  ];

  it('replaces a time and re-validates it', () => {
    const patched = applyRowOverrides(rows, { 2: { time: '21:22' } });
    expect(patched[0].time).toBe('21:22');
    expect(patched[0].error).toBeNull();
  });

  it('accepts a dotted-time override (21.22)', () => {
    const patched = applyRowOverrides(rows, { 2: { time: '21.22' } });
    expect(patched[0].error).toBeNull();
  });

  it('re-validates an edited date', () => {
    const patched = applyRowOverrides(rows, { 3: { date: 'bukan-tanggal' } });
    expect(patched[1].date).toBe('bukan-tanggal');
    expect(patched[1].dateError).toMatch(/invalid date/i);
  });

  it('leaves rows without an override untouched', () => {
    expect(applyRowOverrides(rows, {})).toEqual(rows);
    expect(applyRowOverrides(rows, { 9: { time: '10:00' } })).toEqual(rows);
  });
});

describe('buildTimeListRows (Mode Cepat)', () => {
  it('builds one row per non-empty line sharing the date', () => {
    const rows = buildTimeListRows('20/05/2022', ['08:15', '', '09.30']);
    expect(rows.map((r) => r.time)).toEqual(['08:15', '09.30']);
    expect(rows.every((r) => r.date === '20/05/2022' && r.dateError === null)).toBe(true);
  });

  it('numbers rows by line position, skipping blanks without shifting', () => {
    const rows = buildTimeListRows('20/05/2022', ['', '10:00']);
    expect(rows).toHaveLength(1);
    expect(rows[0].sheetRowNumber).toBe(2);
  });

  it('flags invalid times but keeps the row', () => {
    const rows = buildTimeListRows('20/05/2022', ['99:99']);
    expect(rows[0].error).toMatch(/invalid time/i);
  });

  it('flags an invalid date on every row', () => {
    const rows = buildTimeListRows('salah', ['10:00']);
    expect(rows[0].dateError).toMatch(/invalid date/i);
  });
});
