import { describe, expect, it } from 'vitest';
import { SpreadsheetUrlError, csvEndpointsFor, parseGoogleSheetsUrl } from './url';

describe('parseGoogleSheetsUrl (§7)', () => {
  it('parses a normal edit link with gid in the hash', () => {
    const ref = parseGoogleSheetsUrl(
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=42',
    );
    expect(ref.kind).toBe('standard');
    expect(ref.spreadsheetId).toBe('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
    expect(ref.gid).toBe(42);
  });

  it('parses gid from the query string', () => {
    const ref = parseGoogleSheetsUrl(
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?gid=7',
    );
    expect(ref.gid).toBe(7);
  });

  it('returns null gid when absent', () => {
    const ref = parseGoogleSheetsUrl(
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
    );
    expect(ref.gid).toBeNull();
  });

  it('recognises published-to-web links', () => {
    const ref = parseGoogleSheetsUrl(
      'https://docs.google.com/spreadsheets/d/e/2PACX-1vTnF8d6rQxXkY/pubhtml',
    );
    expect(ref.kind).toBe('published');
    expect(ref.spreadsheetId).toBe('2PACX-1vTnF8d6rQxXkY');
  });

  it('recognises direct CSV export links', () => {
    const ref = parseGoogleSheetsUrl(
      'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/export?format=csv&gid=3',
    );
    expect(ref.kind).toBe('direct-csv');
    expect(ref.gid).toBe(3);
  });

  it('adds the protocol when missing', () => {
    const ref = parseGoogleSheetsUrl(
      'docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
    );
    expect(ref.kind).toBe('standard');
  });

  it('rejects empty input', () => {
    expect(() => parseGoogleSheetsUrl('   ')).toThrow(SpreadsheetUrlError);
  });

  it('rejects non-Google URLs', () => {
    expect(() => parseGoogleSheetsUrl('https://example.com/spreadsheets')).toThrow(
      SpreadsheetUrlError,
    );
  });

  it('rejects links without a spreadsheet id', () => {
    expect(() => parseGoogleSheetsUrl('https://docs.google.com/forms/u/0/')).toThrow(
      SpreadsheetUrlError,
    );
  });
});

describe('csvEndpointsFor (§5, §8)', () => {
  it('tries export then gviz for standard sheets', () => {
    const endpoints = csvEndpointsFor(
      { spreadsheetId: 'ABC', gid: null, kind: 'standard', originalUrl: '' },
      null,
    );
    expect(endpoints).toHaveLength(2);
    expect(endpoints[0]).toContain('/export?format=csv');
    expect(endpoints[1]).toContain('gviz');
  });

  it('appends the gid when selecting a worksheet', () => {
    const endpoints = csvEndpointsFor(
      { spreadsheetId: 'ABC', gid: 5, kind: 'standard', originalUrl: '' },
      5,
    );
    expect(endpoints[0]).toContain('gid=5');
  });

  it('uses the pub endpoint for published sheets', () => {
    const endpoints = csvEndpointsFor(
      { spreadsheetId: 'PUB', gid: null, kind: 'published', originalUrl: '' },
      null,
    );
    expect(endpoints[0]).toContain('/pub?output=csv');
  });

  it('uses the direct URL unchanged for direct CSV links', () => {
    const endpoints = csvEndpointsFor(
      { spreadsheetId: 'direct', gid: null, kind: 'direct-csv', originalUrl: 'https://x/y.csv' },
      null,
    );
    expect(endpoints).toEqual(['https://x/y.csv']);
  });
});
