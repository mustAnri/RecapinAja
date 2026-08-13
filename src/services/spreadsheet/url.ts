/**
 * Google Sheets URL handling (PRDv2 §7, §8).
 *
 * The user pastes a normal Google Sheets URL; the spreadsheet ID and the
 * worksheet `gid` are extracted automatically. Worksheet metadata cannot be
 * listed without OAuth, so the `gid` (visible in the sheet URL) is the
 * selection mechanism (§8).
 */

export class SpreadsheetUrlError extends Error {}

export interface GoogleSheetRef {
  /** Spreadsheet id; for "published to web" links, the `e/<pubId>` form. */
  spreadsheetId: string;
  /** Worksheet gid parsed from the URL, or null when absent. */
  gid: number | null;
  /** Which access strategy applies to this link. */
  kind: 'standard' | 'published' | 'direct-csv';
  /** The URL exactly as the user provided it (normalized). */
  originalUrl: string;
}

function parseGid(url: URL): number | null {
  const fromQuery = url.searchParams.get('gid');
  const fromHash = url.hash.match(/gid=(\d+)/)?.[1] ?? null;
  const raw = fromQuery ?? fromHash;
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Extract the spreadsheet id (and optional gid) from a Google Sheets URL.
 * Accepts:
 *  - `.../spreadsheets/d/<id>/edit#gid=N` (normal edit/view links)
 *  - `.../spreadsheets/d/e/<pubId>/pubhtml` (published-to-web links)
 *  - direct CSV endpoints (`export?format=csv`, `pub?output=csv`, gviz)
 */
export function parseGoogleSheetsUrl(input: string): GoogleSheetRef {
  const trimmed = input.trim();
  if (!trimmed) throw new SpreadsheetUrlError('Paste a Google Sheets URL first.');

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new SpreadsheetUrlError('That does not look like a valid URL.');
  }

  const host = url.hostname.toLowerCase();
  if (!host.endsWith('docs.google.com')) {
    throw new SpreadsheetUrlError(
      'The link must be a Google Sheets URL (docs.google.com/spreadsheets/...).',
    );
  }

  const gid = parseGid(url);

  const wantsCsv =
    url.pathname.includes('/export') ||
    url.searchParams.get('format') === 'csv' ||
    url.searchParams.get('output') === 'csv';
  if (wantsCsv) {
    return { spreadsheetId: 'direct', gid, kind: 'direct-csv', originalUrl: url.href };
  }

  const standard = url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{20,})\//);
  if (standard) {
    return { spreadsheetId: standard[1], gid, kind: 'standard', originalUrl: url.href };
  }

  const published = url.pathname.match(/\/spreadsheets\/d\/e\/([a-zA-Z0-9-_]{20,})\//);
  if (published) {
    return { spreadsheetId: published[1], gid, kind: 'published', originalUrl: url.href };
  }

  throw new SpreadsheetUrlError(
    'Could not find a spreadsheet id in that link. Copy the full URL from the browser address bar.',
  );
}

/**
 * Ordered CSV endpoints to try for a sheet reference (§5, §8). The first
 * endpoint that returns CSV data wins.
 */
export function csvEndpointsFor(ref: GoogleSheetRef, gid: number | null): string[] {
  const suffix = gid !== null ? `&gid=${gid}` : '';
  switch (ref.kind) {
    case 'standard':
      return [
        `https://docs.google.com/spreadsheets/d/${ref.spreadsheetId}/export?format=csv${suffix}`,
        `https://docs.google.com/spreadsheets/d/${ref.spreadsheetId}/gviz/tq?tqx=out:csv${suffix}`,
      ];
    case 'published':
      return [`https://docs.google.com/spreadsheets/d/e/${ref.spreadsheetId}/pub?output=csv${suffix}`];
    case 'direct-csv':
      return [ref.originalUrl];
  }
}
