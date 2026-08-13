import { describe, expect, it } from 'vitest';
import { EXTRAS_SUBFOLDER_NAME, processBatch } from './batchProcessor';
import type { OutputFolder } from './filesystem';
import type { SequentialMappingEntry } from '../types/spreadsheet';
import type { CropTemplate } from '../types/processing';

const CROP: CropTemplate = {
  xFraction: 0.25,
  yFraction: 0.25,
  sizeFraction: 0.5,
  sourceWidth: 800,
  sourceHeight: 600,
};

function makeFile(name: string): File {
  return new File([`content of ${name}`], name, { type: 'image/jpeg' });
}

interface Written {
  folder: string;
  filename: string;
  blob: Blob;
}

function fakeOutputFolder(options?: { subfolderThrows?: boolean }) {
  const written: Written[] = [];
  const make = (name: string): OutputFolder => ({
    name,
    async write(filename, blob) {
      written.push({ folder: name, filename, blob });
    },
    async subfolder(childName) {
      if (options?.subfolderThrows) throw new Error('denied');
      return make(childName);
    },
  });
  return { folder: make('Processed test'), written };
}

const entry = (name: string): SequentialMappingEntry => ({
  file: makeFile(name),
  filename: name,
  row: { time: '14:09', sheetRowNumber: 2, error: 'The time cell is empty.' },
});

describe('processBatch — extra photos', () => {
  it('copies photos beyond the spreadsheet data as-is into the extras subfolder', async () => {
    const { folder, written } = fakeOutputFolder();
    const extras = [makeFile('d.jpg'), makeFile('e.jpg')];

    const output = await processBatch([], {
      crop: CROP,
      dateCell: '20/05/2022',
      formatId: 'default',
      outputFolder: folder,
      extraPhotos: extras,
    });

    expect(output.summary).toEqual({ total: 2, successful: 0, failed: 0, copied: 2 });
    expect(output.results.map((r) => [r.filename, r.status])).toEqual([
      ['d.jpg', 'copied'],
      ['e.jpg', 'copied'],
    ]);
    expect(written.map((w) => [w.folder, w.filename])).toEqual([
      [EXTRAS_SUBFOLDER_NAME, 'd.jpg'],
      [EXTRAS_SUBFOLDER_NAME, 'e.jpg'],
    ]);
    // Copied bytes are the untouched originals (no crop / timestamp).
    expect(await written[0].blob.text()).toBe('content of d.jpg');
  });

  it('counts mapped failures and copied extras together', async () => {
    const { folder } = fakeOutputFolder();
    const output = await processBatch([entry('a.jpg')], {
      crop: CROP,
      dateCell: '20/05/2022',
      formatId: 'default',
      outputFolder: folder,
      extraPhotos: [makeFile('b.jpg')],
    });

    expect(output.summary).toEqual({ total: 2, successful: 0, failed: 1, copied: 1 });
    expect(output.results.map((r) => r.status)).toEqual(['failed', 'copied']);
  });

  it('reports every extra as failed when the extras subfolder cannot be created', async () => {
    const { folder, written } = fakeOutputFolder({ subfolderThrows: true });
    const output = await processBatch([], {
      crop: CROP,
      dateCell: '20/05/2022',
      formatId: 'default',
      outputFolder: folder,
      extraPhotos: [makeFile('d.jpg')],
    });

    expect(output.summary).toEqual({ total: 1, successful: 0, failed: 1, copied: 0 });
    expect(output.results[0].error).toContain(EXTRAS_SUBFOLDER_NAME);
    expect(written).toEqual([]);
  });

  it('reports progress for the combined total (mapped + extras)', async () => {
    const { folder } = fakeOutputFolder();
    const totals: Array<{ total: number; processed: number }> = [];
    await processBatch([], {
      crop: CROP,
      dateCell: '20/05/2022',
      formatId: 'default',
      outputFolder: folder,
      extraPhotos: [makeFile('d.jpg'), makeFile('e.jpg')],
      onProgress: (p) => totals.push({ total: p.total, processed: p.processed }),
    });

    expect(totals).toEqual([
      { total: 2, processed: 1 },
      { total: 2, processed: 2 },
    ]);
  });
});
