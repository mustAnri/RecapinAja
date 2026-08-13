import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseDelimitedText, stripBom } from './csvParser';

describe('stripBom', () => {
  it('removes a leading UTF-8 BOM', () => {
    expect(stripBom('\uFEFFfilename,date,time')).toBe('filename,date,time');
  });

  it('leaves text without a BOM untouched', () => {
    expect(stripBom('filename,date,time')).toBe('filename,date,time');
    expect(stripBom('')).toBe('');
  });
});

describe('detectDelimiter', () => {
  it('detects commas', () => {
    expect(detectDelimiter('filename,date,time\nIMG_001.jpg,12/08/2026,08:15')).toBe(',');
  });

  it('detects tabs', () => {
    expect(detectDelimiter('filename\tdate\ttime\nIMG_001.jpg\t12/08/2026\t08:15')).toBe('\t');
  });

  it('detects semicolons (locale CSV exports)', () => {
    expect(detectDelimiter('filename;date;time\nIMG_001.jpg;12/08/2026;08:15')).toBe(';');
  });

  it('prefers tabs on ties', () => {
    expect(detectDelimiter('a\tb,c')).toBe('\t');
  });

  it('ignores delimiters inside quoted fields of the header line', () => {
    expect(detectDelimiter('"a,b;b"\tx\ty')).toBe('\t');
  });

  it('strips a BOM before inspecting the first line', () => {
    expect(detectDelimiter('\uFEFFfilename\tdate\ttime')).toBe('\t');
  });

  it('falls back to comma when nothing matches', () => {
    expect(detectDelimiter('justoneword')).toBe(',');
  });
});

describe('parseDelimitedText', () => {
  const delimiter = ',';

  it('parses a simple CSV matrix', () => {
    expect(parseDelimitedText('filename,date,time\nIMG_001.jpg,12/08/2026,08:15', delimiter)).toEqual([
      ['filename', 'date', 'time'],
      ['IMG_001.jpg', '12/08/2026', '08:15'],
    ]);
  });

  it('handles CRLF line endings', () => {
    expect(parseDelimitedText('a,b\r\nc,d\r\n', delimiter)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('drops completely empty rows', () => {
    expect(parseDelimitedText('a,b\n\n,,\nc,d\n\n', delimiter)).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps quoted fields containing the delimiter', () => {
    expect(parseDelimitedText('a,b\n"hello, world",x', delimiter)).toEqual([
      ['a', 'b'],
      ['hello, world', 'x'],
    ]);
  });

  it('unescapes doubled quotes inside quoted fields', () => {
    expect(parseDelimitedText('a\n"say ""hi"""', delimiter)).toEqual([['a'], ['say "hi"']]);
  });

  it('supports newlines inside quoted fields', () => {
    expect(parseDelimitedText('a,b\n"line1\nline2",x', delimiter)).toEqual([
      ['a', 'b'],
      ['line1\nline2', 'x'],
    ]);
  });

  it('trims surrounding whitespace from cells', () => {
    expect(parseDelimitedText(' filename , date \n IMG_001.jpg , 08:15 ', delimiter)).toEqual([
      ['filename', 'date'],
      ['IMG_001.jpg', '08:15'],
    ]);
  });

  it('strips a BOM from the first cell', () => {
    expect(parseDelimitedText('\uFEFFfilename,date', delimiter)[0][0]).toBe('filename');
  });

  it('returns an empty matrix for empty input', () => {
    expect(parseDelimitedText('', delimiter)).toEqual([]);
    expect(parseDelimitedText('\n\n', delimiter)).toEqual([]);
  });
});
