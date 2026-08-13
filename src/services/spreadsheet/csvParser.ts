/**
 * Delimited-text parsing for CSV/TSV imports.
 *
 * Handles the shapes produced by Google Sheets ("File -> Download -> CSV"),
 * Excel and manual exports:
 *  - UTF-8 BOM stripping (Excel/Sheets prepend it)
 *  - auto-detected delimiter (tab, comma or semicolon)
 *  - RFC 4180 quoting: embedded delimiters, "" escapes, newlines in quotes
 *  - CRLF and LF line endings
 */

export type CsvDelimiter = '\t' | ',' | ';';

const DELIMITER_CANDIDATES: CsvDelimiter[] = ['\t', ',', ';'];

/** Remove a UTF-8 byte-order mark if present. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Count delimiter occurrences outside quoted fields in one line. */
function countOutsideQuotes(line: string, delimiter: CsvDelimiter): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes && char === delimiter) {
      count += 1;
    }
  }
  return count;
}

/**
 * Pick the most likely delimiter from the first non-empty line.
 * Only candidates that actually occur can win; tabs win ties (TSV pastes),
 * and comma is the default when nothing is found.
 */
export function detectDelimiter(text: string): CsvDelimiter {
  const firstLine = stripBom(text).split(/\r?\n/, 1)[0] ?? '';
  let best: CsvDelimiter = ',';
  let bestCount = 0;
  for (const candidate of DELIMITER_CANDIDATES) {
    const count = countOutsideQuotes(firstLine, candidate);
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Parse delimited text into a matrix of trimmed cell strings.
 * The delimiter is auto-detected from the first line unless given explicitly.
 * Completely empty rows are dropped.
 */
export function parseDelimitedText(text: string, delimiter: CsvDelimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field.trim());
    field = '';
  };
  const pushRow = () => {
    pushField();
    if (row.some((cell) => cell !== '')) rows.push(row);
    row = [];
  };

  const source = stripBom(text);
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];

    if (inQuotes) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field === '') {
      inQuotes = true;
    } else if (char === delimiter) {
      pushField();
    } else if (char === '\n') {
      pushRow();
    } else if (char === '\r') {
      // CRLF: skip the \r, the \n closes the row. Lone \r also closes.
      if (source[i + 1] !== '\n') pushRow();
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) pushRow();

  return rows;
}
