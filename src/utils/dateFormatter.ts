/**
 * Timestamp generation (PRDv2 §21, §23).
 *
 * Modular format registry: the default is `DD MMM YYYY HH:mm` with
 * Indonesian month names, e.g. "20 Mei 2022 14:09" (§23). Only
 * day / month / year / hour / minute are ever rendered (§22) — no GPS,
 * address, device, or any other metadata.
 *
 * Cells that cannot be parsed never fabricate a timestamp (§32): callers
 * validate rows first via `validateTimestampCells`, and `formatTimestamp`
 * falls back to the raw cell text only as a safety net.
 */

export interface DateParts {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
}

export interface TimestampParts extends DateParts {
  hour: number;
  minute: number;
}

export interface TimestampFormat {
  id: string;
  label: string;
  example: string;
  render: (parts: TimestampParts) => string;
}

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** Full Indonesian month names (§23 example: "20 Mei 2022"). */
export const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

/** Supported timestamp formats. The first entry is the default (§23). */
export const TIMESTAMP_FORMATS: TimestampFormat[] = [
  {
    id: 'id-dd-mmm-yyyy-hhmm',
    label: 'DD MMM YYYY HH:mm',
    example: '20 Mei 2022 14:09',
    render: (p) => `${pad2(p.day)} ${MONTHS_ID[p.month - 1]} ${p.year} ${pad2(p.hour)}:${pad2(p.minute)}`,
  },
  {
    id: 'dd-mm-yyyy-hhmm',
    label: 'DD/MM/YYYY HH:mm',
    example: '20/05/2022 14:09',
    render: (p) => `${pad2(p.day)}/${pad2(p.month)}/${p.year} ${pad2(p.hour)}:${pad2(p.minute)}`,
  },
];

export const DEFAULT_FORMAT_ID = TIMESTAMP_FORMATS[0].id;

export function getFormat(id: string): TimestampFormat {
  return TIMESTAMP_FORMATS.find((f) => f.id === id) ?? TIMESTAMP_FORMATS[0];
}

/**
 * Parse a date cell. Accepts:
 * - `DD/MM/YYYY`, `D/M/YYYY`, `DD-MM-YYYY`, `DD.MM.YYYY` (day first — the
 *   spreadsheet convention used in the PRD examples, e.g. 20/05/2022; the
 *   dot form matches Indonesian/European notation, e.g. 20.05.2022),
 * - `YYYY-MM-DD` / `YYYY/MM/DD` / `YYYY.MM.DD` (ISO).
 * The separator must be consistent within one cell. Returns null for
 * anything ambiguous or invalid.
 */
export function parseDateCell(raw: string): DateParts | null {
  const text = raw.trim();
  if (!text) return null;

  let day: number;
  let month: number;
  let year: number;

  const iso = text.match(/^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})$/);
  if (iso) {
    year = Number(iso[1]);
    month = Number(iso[3]);
    day = Number(iso[4]);
  } else {
    const dmy = text.match(/^(\d{1,2})([-/.])(\d{1,2})\2(\d{4})$/);
    if (!dmy) return null;
    day = Number(dmy[1]);
    month = Number(dmy[3]);
    year = Number(dmy[4]);
  }

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

/**
 * Parse a time cell. Accepts `HH:mm`, `H:mm` and `HH:mm:ss` (24-hour
 * clock), with `:` or `.` as the separator — Indonesian sheets commonly
 * write times with dots, e.g. "21.22" means 21:22.
 * Returns null when the value is not a valid time of day.
 */
export function parseTimeCell(raw: string): { hour: number; minute: number } | null {
  const match = raw.trim().match(/^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Validate the two cells of one spreadsheet row before they are ever
 * rendered (§32). Returns a human-readable error, or null when the pair is
 * usable. An invalid date or a missing/invalid time is never coerced.
 */
export function validateTimestampCells(dateCell: string, timeCell: string): string | null {
  const date = dateCell.trim();
  const time = timeCell.trim();
  if (!date) return 'Date is empty';
  if (!parseDateCell(date)) return `Invalid date: "${date}"`;
  if (!time) return 'Time is empty';
  if (!parseTimeCell(time)) return `Invalid time: "${time}"`;
  return null;
}

/**
 * Build the overlay text from the mapped date and time cells. Both cells
 * must already be valid (see `validateTimestampCells`); if they are not —
 * which callers prevent — the raw cells are returned verbatim so nothing
 * fabricated is ever stamped onto a photo.
 */
export function formatTimestamp(dateCell: string, timeCell: string, formatId: string): string {
  const date = parseDateCell(dateCell);
  const time = parseTimeCell(timeCell);
  if (!date || !time) return `${dateCell} ${timeCell}`.trim();
  return getFormat(formatId).render({ ...date, ...time });
}
