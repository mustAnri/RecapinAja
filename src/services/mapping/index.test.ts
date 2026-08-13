import { describe, expect, it } from 'vitest';
import type { SpreadsheetRow } from '../../types/spreadsheet';
import { buildSequentialMapping } from './index';

const file = (name: string): File => new File(['x'], name, { type: 'image/jpeg' });

const row = (
  n: number,
  error: string | null = null,
  dateError: string | null = null,
): SpreadsheetRow => ({
  date: '20/05/2022',
  dateError,
  time: '14:09',
  sheetRowNumber: n,
  error,
});

describe('buildSequentialMapping (§14, §15)', () => {
  it('pairs photos with rows one-to-one in order', () => {
    const mapping = buildSequentialMapping(
      [file('IMG_001.jpg'), file('IMG_002.jpg')],
      [row(2), row(3)],
    );
    expect(mapping.entries).toHaveLength(2);
    expect(mapping.entries[0].filename).toBe('IMG_001.jpg');
    expect(mapping.entries[0].row.sheetRowNumber).toBe(2);
    expect(mapping.entries[1].filename).toBe('IMG_002.jpg');
    expect(mapping.counts).toEqual({ photos: 2, rows: 2, mapped: 2, invalidRows: 0 });
    expect(mapping.extraPhotos).toEqual([]);
    expect(mapping.extraRows).toEqual([]);
  });

  it('reports photos without rows (§32)', () => {
    const mapping = buildSequentialMapping(
      [file('a.jpg'), file('b.jpg'), file('c.jpg')],
      [row(2)],
    );
    expect(mapping.counts.mapped).toBe(1);
    expect(mapping.extraPhotos.map((f) => f.name)).toEqual(['b.jpg', 'c.jpg']);
  });

  it('reports rows without photos (§32)', () => {
    const mapping = buildSequentialMapping([file('a.jpg')], [row(2), row(3)]);
    expect(mapping.counts.mapped).toBe(1);
    expect(mapping.extraRows.map((r) => r.sheetRowNumber)).toEqual([3]);
  });

  it('counts invalid rows inside the mapped pairs', () => {
    const mapping = buildSequentialMapping(
      [file('a.jpg'), file('b.jpg'), file('c.jpg')],
      [row(2, 'Invalid time: "x"'), row(3, null, 'Invalid date: "y"'), row(4)],
    );
    expect(mapping.counts.invalidRows).toBe(2);
  });

  it('handles empty inputs', () => {
    const mapping = buildSequentialMapping([], []);
    expect(mapping.entries).toEqual([]);
    expect(mapping.counts.mapped).toBe(0);
  });
});
