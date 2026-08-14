/**
 * End-to-end pipeline regression test.
 *
 * Replays the real client scenario: a Google Forms "Test Drive" export whose
 * FIRST column is the form's submission "Timestamp" (e.g. "11/08/2026
 * 10:50:52"), with the actual schedule living in separate columns
 * ("Tanggal Test Drive" = date, "Start Test Drive" = time, dot-separated
 * like "14.00"). The pipeline must pick the schedule columns — never the
 * submission Timestamp column — and save one output file per photo.
 *
 * The image encoder is mocked (no canvas in Node); everything from CSV-style
 * rows to the written output files is the real production code.
 */

import { describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ timestamps: [] as string[] }));

vi.mock('./imageProcessor', () => ({
  async processPhoto(_file: File, options: { timestamp: string }) {
    harness.timestamps.push(options.timestamp);
    return {
      blob: new Blob([options.timestamp], { type: 'image/jpeg' }),
      mimeType: 'image/jpeg',
      width: 64,
      height: 64,
    };
  },
}));

import { DEFAULT_FORMAT_ID } from '../utils/dateFormatter';
import { buildOutputFilename } from '../utils/imageOrdering';
import { processBatch } from './batchProcessor';
import { buildSequentialMapping } from './mapping';
import { extractTimestampRows, guessDateColumn, guessTimeColumn } from './spreadsheet/parse';
import type { OutputFolder } from './filesystem';
import type { ImportedSheet } from '../types/spreadsheet';
import { EMPTY_SELECTION } from '../types/spreadsheet';

/** Real headers from "Form Test Drive Vinfast Cengkareng Agustus'26". */
const FORM_HEADERS = [
  'Timestamp',
  'Nama Sales',
  'Nama Customer',
  'No. Hp',
  'Email',
  'Unit',
  'Nomor SIM',
  'Foto SIM',
  'Tanggal Test Drive',
  'Start Test Drive',
  'Foto Test Drive (Wajib Pakai Timestamp)',
];

/** Real data rows: column 0 = submission moment, 8 = date, 9 = time. */
const FORM_DATA_ROWS = [
  ['11/08/2026 10:50:52', 'Sales A', 'Customer A', '0812', 'a@x.com', 'VinFast VF 3', 'SIM1', 'https://foto.sim/1', '08/08/2026', '14.00', 'https://foto.td/1'],
  ['11/08/2026 10:54:01', 'Sales B', 'Customer B', '0813', 'b@x.com', 'VinFast VF 5', 'SIM2', 'https://foto.sim/2', '08/08/2026', '11.00', 'https://foto.td/2'],
  ['11/08/2026 10:56:32', 'Sales C', 'Customer C', '0814', 'c@x.com', 'VinFast VF 6', 'SIM3', 'https://foto.sim/3', '10/08/2026', '21.30', 'https://foto.td/3'],
];

function formSheet(): ImportedSheet {
  return {
    sourceTitle: 'Form Test Drive',
    spreadsheetId: null,
    gid: 0,
    headers: FORM_HEADERS,
    rows: [FORM_HEADERS, ...FORM_DATA_ROWS],
  };
}

function makePhoto(name: string): File {
  return new File([`pixels of ${name}`], name, { type: 'image/jpeg' });
}

interface Written {
  folder: string;
  filename: string;
  blob: Blob;
}

function fakeOutputFolder() {
  const written: Written[] = [];
  const make = (name: string): OutputFolder => ({
    name,
    async write(filename: string, blob: Blob) {
      written.push({ folder: name, filename, blob });
    },
    async subfolder(child: string) {
      return make(`${name}/${child}`);
    },
  });
  return { folder: make('Processed test'), written };
}

describe('pipeline end-to-end — Google Forms export', () => {
  it('guesses the schedule columns, stamps every photo, and saves outputs', async () => {
    const dateColumn = guessDateColumn(FORM_HEADERS);
    const timeColumn = guessTimeColumn(FORM_HEADERS);

    // The schedule columns are found — never the submission Timestamp column.
    expect(dateColumn).toBe(8); // "Tanggal Test Drive"
    expect(timeColumn).toBe(9); // "Start Test Drive"

    const { rows } = extractTimestampRows(formSheet(), {
      ...EMPTY_SELECTION,
      dateColumn,
      timeColumn,
    });
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.error).toBeNull();
      expect(row.dateError).toBeNull();
    }

    const photos = ['IMG_0001.jpg', 'IMG_0002.jpg', 'IMG_0003.jpg'].map(makePhoto);
    const mapping = buildSequentialMapping(photos, rows);
    expect(mapping.extraPhotos).toHaveLength(0);

    const { folder, written } = fakeOutputFolder();
    harness.timestamps.length = 0;
    const output = await processBatch(mapping.entries, {
      crop: null,
      formatId: DEFAULT_FORMAT_ID,
      outputFolder: folder,
      extraPhotos: mapping.extraPhotos,
    });

    expect(output.summary).toEqual({ total: 3, successful: 3, failed: 0, copied: 0 });
    expect(written.map((w) => w.filename)).toEqual(photos.map((p) => buildOutputFilename(p.name)));
    expect(harness.timestamps).toEqual(['08/08/2026 14:00', '08/08/2026 11:00', '10/08/2026 21:30']);
  });

  it('produces no output when the Timestamp column is forced as the date source', async () => {
    // Regression for the client complaint: selecting the submission
    // "Timestamp" column ("11/08/2026 10:50:52") made every row fail, so
    // nothing was saved. The column is now hidden from every selector; this
    // test documents what happens if it is ever selected anyway.
    const { rows } = extractTimestampRows(formSheet(), {
      ...EMPTY_SELECTION,
      dateColumn: 0,
      timeColumn: 9,
    });

    for (const row of rows) {
      expect(row.dateError).not.toBeNull();
    }

    const photos = FORM_DATA_ROWS.map((_, i) => makePhoto(`IMG_000${i + 1}.jpg`));
    const mapping = buildSequentialMapping(photos, rows);

    const { folder, written } = fakeOutputFolder();
    const output = await processBatch(mapping.entries, {
      crop: null,
      formatId: DEFAULT_FORMAT_ID,
      outputFolder: folder,
    });

    expect(output.summary.successful).toBe(0);
    expect(output.summary.failed).toBe(3);
    expect(written).toHaveLength(0); // "output tidak keluar" — exactly the bug
  });
});
