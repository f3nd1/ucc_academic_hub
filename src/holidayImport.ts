import type { HolidayRow } from './formModel';
import { emptyHolidayRow } from './formModel';
import { formatDate, isValidIsoDate } from './shared/dates';

// Bulk holiday entry from a spreadsheet, alongside the manual add/remove table
// rather than replacing it. Two columns: Date, then an optional Name. The
// sheet-reading half (SheetJS) lives at the UI edge; everything here is pure
// so the date coercion and the duplicate/invalid accounting are testable.

/** Excel's 1900 date system counts days from 1899-12-30. */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 86_400_000;

// Day-first, the Singapore convention: 09/08/2026 is 9 August, never 8
// September. Deliberately narrow — a month-first sheet would silently import
// the wrong days, so anything that is not this shape or a real ISO date is
// reported as invalid instead of guessed at.
const DAY_FIRST = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

const pad2 = (n: string) => n.padStart(2, '0');

/**
 * Coerce one spreadsheet cell to a YYYY-MM-DD string, or null when it is not a
 * date at all. Every branch ends at the SAME `isValidIsoDate` check the manual
 * date pickers use, so a rolled-over date (2026-02-30) is rejected here just as
 * it is when typed in by hand.
 */
export function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // SheetJS builds these at UTC midnight under `cellDates`, so the calendar
    // day must be read back with the UTC getters — reading it in a UTC+8
    // browser via the local getters is fine, but a negative-offset one would
    // shift every holiday back a day.
    const iso = formatDate(
      new Date(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
    );
    return isValidIsoDate(iso) ? iso : null;
  }
  // A date cell carrying no date NUMBER FORMAT arrives as its raw serial.
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const d = new Date(EXCEL_EPOCH_UTC + Math.round(value) * MS_PER_DAY);
    const iso = formatDate(
      new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
    return isValidIsoDate(iso) ? iso : null;
  }
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  if (isValidIsoDate(text)) return text;
  const m = DAY_FIRST.exec(text);
  if (m) {
    const iso = `${m[3]}-${pad2(m[2])}-${pad2(m[1])}`;
    if (isValidIsoDate(iso)) return iso;
  }
  return null;
}

/**
 * The blank template offered next to the upload control, so nobody has to
 * guess the column names or the date format.
 *
 * Deliberately written in DD/MM/YYYY rather than ISO: that is the shape
 * someone typing dates into Excel here will produce anyway, and it is the one
 * genuinely ambiguous case (09/08/2026 is 9 August, not 8 September), so the
 * template is what documents the day-first reading. The third row leaves Name
 * empty to show it is optional. Lives beside toIsoDate on purpose — the two
 * have to agree, and a test round-trips this exact text back through
 * importHolidayRows to prove they do.
 */
export const HOLIDAY_TEMPLATE_ROWS: string[][] = [
  ['Date', 'Name'],
  ['09/08/2026', 'National Day'],
  ['25/12/2026', 'Christmas Day'],
  ['01/01/2027', ''],
];

/** Escape a CSV field, doubling embedded quotes (RFC 4180). */
const csvField = (v: string): string =>
  /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;

/** The template as CSV text, ready to hand to a Blob. */
export const holidayTemplateCsv = (): string =>
  HOLIDAY_TEMPLATE_ROWS.map((row) => row.map(csvField).join(',')).join('\r\n');

export interface HolidayImportResult {
  /** New rows to APPEND to the existing table (never a replacement for it). */
  rows: HolidayRow[];
  added: number;
  /** Dates already present in the table, or repeated within the file itself. */
  duplicates: number;
  /** 1-based spreadsheet row numbers whose date cell could not be read. */
  invalidRows: number[];
  /** Plain-English outcome for the UI to show after an upload. */
  summary: string;
}

/** "1 holiday" / "3 holidays" */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Turn a sheet's cell matrix into rows to append to a holiday table.
 *
 * Appends rather than replaces, so an upload can top up a table someone has
 * already filled in by hand, and skips any date already present (in the table
 * or earlier in the same file) rather than creating two entries for one day —
 * a duplicate holiday is silently harmless in the scheduler but makes the
 * table impossible to review.
 *
 * A leading "Date"/"Name" header row is dropped when present. Rows with a
 * blank date cell are ignored outright (trailing blanks are normal in an
 * exported sheet); rows with a date cell that cannot be read are counted and
 * reported by row number, never silently dropped.
 */
export function importHolidayRows(
  matrix: unknown[][],
  existing: HolidayRow[],
): HolidayImportResult {
  const seen = new Set(
    existing.map((r) => r.date.trim()).filter((d) => d !== ''),
  );
  const rows: HolidayRow[] = [];
  const invalidRows: number[] = [];
  let duplicates = 0;

  const first = matrix[0]?.[0];
  const hasHeader =
    typeof first === 'string' && first.trim().toLowerCase() === 'date';

  matrix.forEach((cells, i) => {
    if (hasHeader && i === 0) return;
    const rawDate = cells?.[0];
    // A blank date cell is an empty row, not a bad one.
    if (rawDate === undefined || rawDate === null || String(rawDate).trim() === '')
      return;
    const iso = toIsoDate(rawDate);
    if (!iso) {
      invalidRows.push(i + 1);
      return;
    }
    if (seen.has(iso)) {
      duplicates += 1;
      return;
    }
    seen.add(iso);
    const name = cells?.[1];
    rows.push({
      ...emptyHolidayRow(),
      date: iso,
      name: typeof name === 'string' ? name.trim() : name == null ? '' : String(name).trim(),
    });
  });

  const skipped = duplicates + invalidRows.length;
  const reasons: string[] = [];
  if (duplicates > 0) reasons.push(`${plural(duplicates, 'date')} already in the table`);
  if (invalidRows.length > 0)
    reasons.push(
      `invalid ${invalidRows.length === 1 ? 'date' : 'dates'} on ${
        invalidRows.length === 1 ? 'row' : 'rows'
      } ${invalidRows.join(', ')}`,
    );
  const summary =
    rows.length === 0 && skipped === 0
      ? 'No holidays found in that file.'
      : `${plural(rows.length, 'holiday')} added${
          skipped > 0 ? `, ${skipped} skipped — ${reasons.join(', ')}` : ''
        }.`;

  return { rows, added: rows.length, duplicates, invalidRows, summary };
}
