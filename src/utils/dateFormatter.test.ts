import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FORMAT_ID,
  formatTimestamp,
  getFormat,
  parseDateCell,
  parseTimeCell,
  validateTimestampCells,
} from './dateFormatter';

describe('parseDateCell', () => {
  it('parses DD/MM/YYYY (PRD example 20/05/2022)', () => {
    expect(parseDateCell('20/05/2022')).toEqual({ year: 2022, month: 5, day: 20 });
  });

  it('parses single-digit D/M/YYYY', () => {
    expect(parseDateCell('3/1/2026')).toEqual({ year: 2026, month: 1, day: 3 });
  });

  it('parses DD-MM-YYYY', () => {
    expect(parseDateCell('31-12-2026')).toEqual({ year: 2026, month: 12, day: 31 });
  });

  it('parses ISO YYYY-MM-DD', () => {
    expect(parseDateCell('2026-02-28')).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it('trims surrounding whitespace', () => {
    expect(parseDateCell('  20/05/2022  ')).toEqual({ year: 2022, month: 5, day: 20 });
  });

  it('rejects impossible dates', () => {
    expect(parseDateCell('31/02/2022')).toBeNull(); // Feb 31
    expect(parseDateCell('29/02/2023')).toBeNull(); // not a leap year
    expect(parseDateCell('00/05/2022')).toBeNull();
    expect(parseDateCell('12/13/2022')).toBeNull(); // month > 12
  });

  it('accepts Feb 29 on leap years only', () => {
    expect(parseDateCell('29/02/2024')).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseDateCell('29/02/2026')).toBeNull();
  });

  it('rejects empty and malformed input', () => {
    expect(parseDateCell('')).toBeNull();
    expect(parseDateCell('20 Mei 2022')).toBeNull();
    expect(parseDateCell('2022')).toBeNull();
    expect(parseDateCell('20/05/22')).toBeNull(); // two-digit year is ambiguous
  });

  it('parses dotted DD.MM.YYYY', () => {
    expect(parseDateCell('20.05.2022')).toEqual({ year: 2022, month: 5, day: 20 });
  });

  it('parses dotted ISO YYYY.MM.DD', () => {
    expect(parseDateCell('2026.02.28')).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it('rejects mixed separators in one date', () => {
    expect(parseDateCell('20/05.2022')).toBeNull();
    expect(parseDateCell('20.05/2022')).toBeNull();
  });
});

describe('parseTimeCell', () => {
  it('parses HH:mm', () => {
    expect(parseTimeCell('14:09')).toEqual({ hour: 14, minute: 9 });
  });

  it('parses H:mm', () => {
    expect(parseTimeCell('8:15')).toEqual({ hour: 8, minute: 15 });
  });

  it('parses HH:mm:ss', () => {
    expect(parseTimeCell('08:15:30')).toEqual({ hour: 8, minute: 15 });
  });

  it('rejects invalid times of day', () => {
    expect(parseTimeCell('24:00')).toBeNull();
    expect(parseTimeCell('12:60')).toBeNull();
    expect(parseTimeCell('1260')).toBeNull();
    expect(parseTimeCell('')).toBeNull();
  });

  it('parses dotted HH.mm (Indonesian notation)', () => {
    expect(parseTimeCell('21.22')).toEqual({ hour: 21, minute: 22 });
  });

  it('parses dotted H.mm and HH.mm.ss', () => {
    expect(parseTimeCell('8.15')).toEqual({ hour: 8, minute: 15 });
    expect(parseTimeCell('08.15.30')).toEqual({ hour: 8, minute: 15 });
  });

  it('rejects invalid dotted times of day', () => {
    expect(parseTimeCell('24.00')).toBeNull();
    expect(parseTimeCell('12.60')).toBeNull();
  });
});

describe('validateTimestampCells', () => {
  it('accepts a valid pair', () => {
    expect(validateTimestampCells('20/05/2022', '14:09')).toBeNull();
  });

  it('reports empty date', () => {
    expect(validateTimestampCells('', '14:09')).toMatch(/date/i);
  });

  it('reports invalid date', () => {
    expect(validateTimestampCells('bukan-tanggal', '14:09')).toMatch(/invalid date/i);
  });

  it('reports empty time', () => {
    expect(validateTimestampCells('20/05/2022', '')).toMatch(/time/i);
  });

  it('reports invalid time', () => {
    expect(validateTimestampCells('20/05/2022', '99:99')).toMatch(/invalid time/i);
  });
});

describe('formatTimestamp', () => {
  it('renders the default Indonesian format (§23 example)', () => {
    expect(formatTimestamp('20/05/2022', '14:09', DEFAULT_FORMAT_ID)).toBe('20 Mei 2022 14:09');
  });

  it('pads day and minutes', () => {
    expect(formatTimestamp('3/1/2026', '8:05', DEFAULT_FORMAT_ID)).toBe('03 Januari 2026 08:05');
  });

  it('renders DD/MM/YYYY HH:mm when selected', () => {
    expect(formatTimestamp('20/05/2022', '14:09', 'dd-mm-yyyy-hhmm')).toBe('20/05/2022 14:09');
  });

  it('falls back to the raw cells when parsing fails — never fabricates', () => {
    expect(formatTimestamp('??', '!!', DEFAULT_FORMAT_ID)).toBe('?? !!');
  });

  it('falls back to the default format for unknown ids', () => {
    expect(getFormat('does-not-exist').id).toBe(DEFAULT_FORMAT_ID);
  });
});
