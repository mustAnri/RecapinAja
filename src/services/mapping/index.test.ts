import { describe, expect, it } from 'vitest';
import type { SpreadsheetRow } from '../../types/spreadsheet';
import {
  applyManualPairs,
  buildNameMapping,
  buildSequentialMapping,
  mappingFromPairs,
  sequentialPairs,
} from './index';

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

const rows3 = (): SpreadsheetRow[] => [row(2), row(3), row(4)];
const photos3 = (): File[] => [file('a.jpg'), file('b.jpg'), file('c.jpg')];

describe('applyManualPairs (manual photo → row overrides)', () => {
  it('returns the auto pairs untouched when there are no overrides', () => {
    const auto = sequentialPairs(photos3(), rows3());
    const merged = applyManualPairs(photos3(), rows3(), auto, new Map());
    expect([...merged]).toEqual([...auto]);
  });

  it('reassigns a photo to a free row', () => {
    const photos = [file('a.jpg'), file('b.jpg')];
    const rows = rows3();
    const auto = sequentialPairs(photos, rows); // a↔0, b↔1; row index 2 is free
    const merged = applyManualPairs(photos, rows, auto, new Map([['a.jpg', 2]]));
    expect(merged.get('a.jpg')).toBe(2);
    expect(merged.get('b.jpg')).toBe(1); // untouched
    const mapping = mappingFromPairs(photos, rows, merged);
    expect(mapping.counts.mapped).toBe(2);
    expect(mapping.entries.find((e) => e.filename === 'a.jpg')?.row.sheetRowNumber).toBe(4);
  });

  it('stealing a row un-pairs its previous owner (§32 — no double stamps)', () => {
    const photos = photos3();
    const rows = rows3();
    const auto = sequentialPairs(photos, rows); // a↔0, b↔1, c↔2
    const merged = applyManualPairs(photos, rows, auto, new Map([['a.jpg', 1]]));
    expect(merged.get('a.jpg')).toBe(1);
    expect(merged.has('b.jpg')).toBe(false); // evicted, lands in extraPhotos
    const mapping = mappingFromPairs(photos, rows, merged);
    expect(mapping.extraPhotos.map((f) => f.name)).toEqual(['b.jpg']);
    expect(mapping.extraRows.map((r) => r.sheetRowNumber)).toEqual([2]);
  });

  it('null explicitly un-pairs a photo (copied as-is later)', () => {
    const photos = photos3();
    const rows = rows3();
    const auto = sequentialPairs(photos, rows);
    const merged = applyManualPairs(photos, rows, auto, new Map([['c.jpg', null]]));
    expect(merged.has('c.jpg')).toBe(false);
    const mapping = mappingFromPairs(photos, rows, merged);
    expect(mapping.extraPhotos.map((f) => f.name)).toEqual(['c.jpg']);
    expect(mapping.extraRows.map((r) => r.sheetRowNumber)).toEqual([4]);
  });

  it('an un-paired photo can claim a row (extraPhotos becomes mapped)', () => {
    const photos = [file('a.jpg'), file('b.jpg'), file('c.jpg'), file('d.jpg')];
    const rows = rows3(); // only 3 rows — d.jpg starts un-paired
    const auto = sequentialPairs(photos, rows);
    const merged = applyManualPairs(photos, rows, auto, new Map([['d.jpg', 2]]));
    const mapping = mappingFromPairs(photos, rows, merged);
    expect(mapping.counts.mapped).toBe(3);
    expect(mapping.extraPhotos.map((f) => f.name)).toEqual(['c.jpg']); // evicted owner
  });

  it('later overrides win over earlier ones for the same row', () => {
    const photos = photos3();
    const rows = rows3();
    const auto = sequentialPairs(photos, rows);
    const manual = new Map<string, number | null>([
      ['a.jpg', 2],
      ['b.jpg', 2],
    ]);
    const merged = applyManualPairs(photos, rows, auto, manual);
    expect(merged.get('b.jpg')).toBe(2);
    expect(merged.has('a.jpg')).toBe(false);
  });

  it('ignores stale entries: unknown photos and out-of-range rows', () => {
    const photos = photos3();
    const rows = rows3();
    const auto = sequentialPairs(photos, rows);
    const manual = new Map<string, number | null>([
      ['ghost.jpg', 1],
      ['a.jpg', 99],
    ]);
    const merged = applyManualPairs(photos, rows, auto, manual);
    expect(merged.has('ghost.jpg')).toBe(false);
    expect(merged.get('a.jpg')).toBe(0); // untouched
  });
});

describe('buildNameMapping (§32 ambiguity rules)', () => {
  const namedRow = (n: number, name: string): SpreadsheetRow => ({ ...row(n), name });

  it('pairs a photo with the uniquely named row', () => {
    const mapping = buildNameMapping(
      [file('ERDI MAYARDI.jpg')],
      [namedRow(2, 'Erdi  mayardi.')],
    );
    expect(mapping.counts.mapped).toBe(1);
    expect(mapping.entries[0].row.sheetRowNumber).toBe(2);
  });

  it('does not match when the name differs (no fuzzy guessing)', () => {
    const mapping = buildNameMapping(
      [file('ERDI MAYARDI.jpg')],
      [namedRow(2, 'ERDI MAYADI')], // one letter off
    );
    expect(mapping.counts.mapped).toBe(0);
    expect(mapping.extraPhotos).toHaveLength(1);
  });

  it('maps nothing when a name is ambiguous', () => {
    const mapping = buildNameMapping(
      [file('ERDI MAYARDI.jpg')],
      [namedRow(2, 'Erdi Mayardi'), namedRow(3, 'ERDI MAYARDI')],
    );
    expect(mapping.counts.mapped).toBe(0);
    expect(mapping.extraPhotos).toHaveLength(1);
  });
});
