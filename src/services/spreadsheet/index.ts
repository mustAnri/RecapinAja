/**
 * Spreadsheet loading (PRDv2 §4–§6, §35) — OAuth-free.
 *
 * A normal Google Sheets URL is turned into a public CSV endpoint and the
 * tabular data is fetched client-side. No Google login, API key, or Cloud
 * project is involved. Sheets must be shared as "Anyone with the link" or
 * published to the web (§5, §6).
 */

import { parseDelimitedText } from './csvParser';
import { parseSheetValues } from './parse';
import { SpreadsheetUrlError, csvEndpointsFor, parseGoogleSheetsUrl } from './url';
import type { ImportedSheet } from '../../types/spreadsheet';

export class SpreadsheetLoadError extends Error {}

export { SpreadsheetUrlError, parseGoogleSheetsUrl };
export type { GoogleSheetRef } from './url';

/** Friendly loading failure message per §35 (raw errors never lead). */
function unreachable(detail?: string): SpreadsheetLoadError {
  return new SpreadsheetLoadError(
    'Unable to load spreadsheet.\n\n' +
      'Make sure:\n' +
      '1. The Google Sheet URL is correct.\n' +
      '2. The sheet is shared as "Anyone with the link can view" or published to the web.\n' +
      '3. The sheet can be opened in a private window without Google login.' +
      (detail ? `\n\n(Technical detail: ${detail})` : ''),
  );
}

/** Parse raw CSV/TSV text into a raw sheet (headers + cell rows). */
export function sheetFromCsvText(
  text: string,
  sourceTitle: string,
  spreadsheetId: string | null,
  gid: number,
): ImportedSheet {
  const sheet = parseSheetValues(parseDelimitedText(text));
  if (sheet.headers.every((h) => h === '')) {
    throw new SpreadsheetLoadError(
      'The spreadsheet appears to be empty — no header row was found.',
    );
  }
  return { ...sheet, sourceTitle, spreadsheetId, gid };
}

/**
 * Load a Google Spreadsheet from its URL (§7). `gidOverride` selects the
 * worksheet when the URL has no `gid` (§8); null means the first sheet.
 */
export async function loadSpreadsheet(
  url: string,
  gidOverride: number | null = null,
): Promise<ImportedSheet> {
  let ref;
  try {
    ref = parseGoogleSheetsUrl(url);
  } catch (error) {
    if (error instanceof SpreadsheetUrlError) throw new SpreadsheetLoadError(error.message);
    throw error;
  }

  const gid = gidOverride ?? ref.gid;
  const endpoints = csvEndpointsFor(ref, gid);
  const sheetId = ref.kind === 'direct-csv' ? null : ref.spreadsheetId;

  for (const endpoint of endpoints) {
    let response: Response;
    try {
      response = await fetch(endpoint, { redirect: 'follow' });
    } catch {
      continue; // try the next endpoint
    }
    if (!response.ok) continue;

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) continue; // login page / not public

    const text = await response.text();
    const shortId = sheetId ? ` ${sheetId.slice(0, 16)}…` : '';
    const title = `Google Sheet${shortId}${gid !== null ? ` (gid ${gid})` : ''}`;
    try {
      return sheetFromCsvText(text, title, sheetId, gid ?? 0);
    } catch {
      continue;
    }
  }

  throw unreachable();
}
