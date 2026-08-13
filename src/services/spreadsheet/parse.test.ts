import { describe, expect, it } from 'vitest';
import type { ImportedSheet, RowSelection } from '../../types/spreadsheet';
import {
  describeUnselectedRoles,
  extractTimestampRows,
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

describe('time column guessing', () => {
  it('finds Indonesian time headers', () => {
    expect(guessTimeColumn(['No', 'Nama', 'Tanggal', 'Jam Test Drive'])).toBe(3);
  });

  it('finds English headers', () => {
    expect(guessTimeColumn(['Name', 'Date', 'Time'])).toBe(2);
  });

  it('returns null when nothing matches', () => {
    expect(guessTimeColumn(['No', 'Nama'])).toBeNull();
  });
});

describe('selection completeness', () => {
  const base: RowSelection = { timeColumn: 2, headerRow: 1, startRow: 2 };

  it('is complete when the time column is chosen', () => {
    expect(isSelectionComplete(base)).toBe(true);
  });

  it('lists the missing role', () => {
    expect(describeUnselectedRoles({ ...base, timeColumn: null })).toHaveLength(1);
    expect(describeUnselectedRoles(base)).toHaveLength(0);
  });
});

describe('extractTimestampRows (time list)', () => {
  const selection: RowSelection = { timeColumn: 2, headerRow: 1, startRow: 2 };

  it('extracts times with spreadsheet row numbers', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [
      ['1', '20/05/2022', '14:09'],
      ['2', '21/05/2022', '09:30'],
    ]);
    const { rows } = extractTimestampRows(data, selection);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ time: '14:09', sheetRowNumber: 2, error: null });
    expect(rows[1].sheetRowNumber).toBe(3);
  });

  it('skips completely blank rows silently', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [
      ['1', '20/05/2022', '14:09'],
      ['', '', ''],
      ['2', '21/05/2022', '09:30'],
    ]);
    const { rows, skippedBlank } = extractTimestampRows(data, selection);
    expect(rows).toHaveLength(2);
    expect(skippedBlank).toBe(1);
  });

  it('keeps invalid rows with an error instead of dropping them', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [['1', '20/05/2022', 'bukan jam']]);
    const { rows } = extractTimestampRows(data, selection);
    expect(rows[0].error).toMatch(/Invalid time/);
  });

  it('flags empty time cells', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [['1', '20/05/2022', '']]);
    const { rows } = extractTimestampRows(data, selection);
    expect(rows[0].error).toMatch(/Time is empty/);
  });

  it('honours a later start row', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [
      ['x', '01/01/2020', '00:00'],
      ['1', '20/05/2022', '14:09'],
    ]);
    const { rows } = extractTimestampRows(data, { ...selection, startRow: 3 });
    expect(rows).toHaveLength(1);
    expect(rows[0].sheetRowNumber).toBe(3);
  });

  it('never starts before the header row', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [['1', '20/05/2022', '14:09']]);
    const { rows } = extractTimestampRows(data, { ...selection, startRow: 1 });
    expect(rows).toHaveLength(1);
    expect(rows[0].sheetRowNumber).toBe(2);
  });

  it('returns nothing until the time column is chosen', () => {
    const data = sheet(['No', 'Tanggal', 'Jam'], [['1', '20/05/2022', '14:09']]);
    const { rows } = extractTimestampRows(data, { ...selection, timeColumn: null });
    expect(rows).toEqual([]);
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
