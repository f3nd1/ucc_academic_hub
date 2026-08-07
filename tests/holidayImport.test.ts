import { describe, it, expect } from 'vitest';
import {
  HOLIDAY_TEMPLATE_ROWS,
  holidayTemplateCsv,
  importHolidayRows,
  toIsoDate,
} from '../src/holidayImport';
import type { HolidayRow } from '../src/formModel';

const existing = (...dates: string[]): HolidayRow[] =>
  dates.map((date, i) => ({ id: `e${i}`, date, name: '' }));

describe('toIsoDate', () => {
  it('reads a SheetJS Date cell by its UTC parts', () => {
    // SheetJS builds cellDates values at UTC midnight. Reading them with the
    // LOCAL getters would shift the calendar day back in any negative-offset
    // timezone, so the day is taken from the UTC getters instead.
    expect(toIsoDate(new Date(Date.UTC(2026, 7, 9)))).toBe('2026-08-09');
  });

  it('converts a raw Excel serial (a date cell with no date number format)', () => {
    // 46243 days after Excel's 1899-12-30 epoch.
    expect(toIsoDate(46243)).toBe('2026-08-09');
  });

  it('accepts an ISO string unchanged', () => {
    expect(toIsoDate('2026-08-09')).toBe('2026-08-09');
    expect(toIsoDate('  2026-08-09  ')).toBe('2026-08-09');
  });

  it('reads a slashed date day-first, the Singapore convention', () => {
    // 09/08/2026 is 9 August, never 8 September.
    expect(toIsoDate('09/08/2026')).toBe('2026-08-09');
    expect(toIsoDate('9/8/2026')).toBe('2026-08-09');
    expect(toIsoDate('09.08.2026')).toBe('2026-08-09');
  });

  it('rejects a date that is not a real calendar day', () => {
    // Same round-trip check the manual date pickers use: JS silently rolls
    // 2026-02-30 over to 2 March, which would suppress the wrong day.
    expect(toIsoDate('2026-02-30')).toBeNull();
    expect(toIsoDate('30/02/2026')).toBeNull();
  });

  it('rejects text that is not a date at all', () => {
    expect(toIsoDate('National Day')).toBeNull();
    expect(toIsoDate('')).toBeNull();
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate(undefined)).toBeNull();
  });
});

describe('importHolidayRows', () => {
  it('imports date and name rows', () => {
    const r = importHolidayRows(
      [
        ['2026-08-09', 'National Day'],
        ['2026-12-25', 'Christmas'],
      ],
      [],
    );
    expect(r.added).toBe(2);
    expect(r.rows.map((x) => [x.date, x.name])).toEqual([
      ['2026-08-09', 'National Day'],
      ['2026-12-25', 'Christmas'],
    ]);
    expect(r.summary).toBe('2 holidays added.');
  });

  it('drops a leading Date/Name header row', () => {
    const r = importHolidayRows(
      [
        ['Date', 'Name'],
        ['2026-08-09', 'National Day'],
      ],
      [],
    );
    expect(r.added).toBe(1);
    expect(r.invalidRows).toEqual([]);
  });

  it('treats a first row that is already a date as data, not a header', () => {
    const r = importHolidayRows([['2026-08-09', 'National Day']], []);
    expect(r.added).toBe(1);
  });

  it('leaves the name blank when the column is absent', () => {
    const r = importHolidayRows([['2026-08-09']], []);
    expect(r.rows[0].name).toBe('');
  });

  it('gives every imported row its own unique id', () => {
    const r = importHolidayRows([['2026-08-09'], ['2026-12-25']], []);
    expect(r.rows[0].id).not.toBe(r.rows[1].id);
  });

  it('skips a date already in the table rather than adding a second entry for that day', () => {
    const r = importHolidayRows(
      [
        ['2026-08-09', 'National Day'],
        ['2026-12-25', 'Christmas'],
      ],
      existing('2026-08-09'),
    );
    expect(r.added).toBe(1);
    expect(r.duplicates).toBe(1);
    expect(r.rows.map((x) => x.date)).toEqual(['2026-12-25']);
    expect(r.summary).toBe('1 holiday added, 1 skipped — 1 date already in the table.');
  });

  it('skips a date repeated within the uploaded file itself', () => {
    const r = importHolidayRows([['2026-08-09'], ['09/08/2026']], []);
    expect(r.added).toBe(1);
    expect(r.duplicates).toBe(1);
  });

  it('ignores blank rows without counting them as errors', () => {
    const r = importHolidayRows([['2026-08-09'], ['', ''], ['   ']], []);
    expect(r.added).toBe(1);
    expect(r.invalidRows).toEqual([]);
  });

  it('reports unreadable dates by their 1-based sheet row number', () => {
    const r = importHolidayRows(
      [
        ['Date', 'Name'],
        ['2026-08-09', 'National Day'],
        ['not a date', 'Oops'],
      ],
      [],
    );
    expect(r.added).toBe(1);
    expect(r.invalidRows).toEqual([3]);
    expect(r.summary).toBe('1 holiday added, 1 skipped — invalid date on row 3.');
  });

  it('lists several bad rows together', () => {
    const r = importHolidayRows([['nope'], ['2026-02-30']], []);
    expect(r.invalidRows).toEqual([1, 2]);
    expect(r.summary).toBe(
      '0 holidays added, 2 skipped — invalid dates on rows 1, 2.',
    );
  });

  it('says so plainly when a file holds nothing to import', () => {
    expect(importHolidayRows([], []).summary).toBe('No holidays found in that file.');
    expect(importHolidayRows([['Date', 'Name']], []).summary).toBe(
      'No holidays found in that file.',
    );
  });

  it('never mutates the existing rows it is given', () => {
    const rows = existing('2026-08-09');
    importHolidayRows([['2026-12-25']], rows);
    expect(rows).toHaveLength(1);
  });
});

describe('holiday upload template', () => {
  it('leads with the Date, Name header the importer looks for', () => {
    expect(HOLIDAY_TEMPLATE_ROWS[0]).toEqual(['Date', 'Name']);
  });

  it('writes its example dates day-first, the format the hint promises', () => {
    for (const [date] of HOLIDAY_TEMPLATE_ROWS.slice(1)) {
      expect(date).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    }
  });

  it('shows Name filled in on some rows and left blank on another', () => {
    const names = HOLIDAY_TEMPLATE_ROWS.slice(1).map(([, name]) => name);
    expect(names.some((n) => n !== '')).toBe(true);
    expect(names.some((n) => n === '')).toBe(true);
  });

  // The point of the template is that it is genuinely correct, not merely
  // plausible: feeding it straight back to the importer must add every
  // example row with nothing skipped and nothing flagged.
  it('round-trips through the importer with no skips and no invalid rows', () => {
    const result = importHolidayRows(HOLIDAY_TEMPLATE_ROWS, []);
    expect(result.added).toBe(HOLIDAY_TEMPLATE_ROWS.length - 1);
    expect(result.invalidRows).toEqual([]);
    expect(result.duplicates).toBe(0);
    expect(result.rows.map((r) => r.date)).toEqual([
      '2026-08-09',
      '2026-12-25',
      '2027-01-01',
    ]);
  });

  it('round-trips day-first, not month-first', () => {
    // 09/08/2026 must land on 9 August. Reading it month-first would give
    // 8 September and silently schedule around the wrong day.
    const [first] = importHolidayRows(HOLIDAY_TEMPLATE_ROWS, []).rows;
    expect(first.date).toBe('2026-08-09');
    expect(first.name).toBe('National Day');
  });

  it('serialises to CSV that parses back to the same matrix', () => {
    const parsed = holidayTemplateCsv()
      .split('\r\n')
      .map((line) => line.split(','));
    expect(parsed).toEqual(HOLIDAY_TEMPLATE_ROWS);
    expect(importHolidayRows(parsed, []).invalidRows).toEqual([]);
  });

  it('survives the byte-order mark the download prepends for Excel', () => {
    // trim() treats U+FEFF as whitespace, so the header still matches — if it
    // ever stopped doing so the header row would import as a bad date.
    const withBom = `\ufeff${holidayTemplateCsv()}`
      .split('\r\n')
      .map((line) => line.split(','));
    const result = importHolidayRows(withBom, []);
    expect(result.added).toBe(3);
    expect(result.invalidRows).toEqual([]);
  });
});
