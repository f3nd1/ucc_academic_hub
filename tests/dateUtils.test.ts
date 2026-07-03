import { describe, it, expect } from 'vitest';
import {
  formatDate,
  parseLocal,
  formatDisplayDate,
  dayName,
  isWeekend,
  isValidIsoDate,
  DAY_NAMES,
  MONTH_NAMES,
} from '../src/shared/dates';

describe('formatDate / parseLocal', () => {
  it('round-trips an ISO date with no timezone shift', () => {
    expect(formatDate(parseLocal('2026-07-06'))).toBe('2026-07-06');
    expect(formatDate(parseLocal('2026-01-01'))).toBe('2026-01-01');
    expect(formatDate(parseLocal('2026-12-31'))).toBe('2026-12-31');
  });

  it('parses to local midnight (never the previous UTC day)', () => {
    const d = parseLocal('2026-07-06');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(6);
    expect(d.getDate()).toBe(6);
    expect(d.getHours()).toBe(0);
  });
});

describe('formatDisplayDate', () => {
  it('renders DD MMMM YYYY', () => {
    expect(formatDisplayDate('2026-07-06')).toBe('06 July 2026');
    expect(formatDisplayDate('2026-05-02')).toBe('02 May 2026');
    expect(formatDisplayDate('2026-12-25')).toBe('25 December 2026');
  });
});

describe('dayName / isWeekend', () => {
  it('2026-07-06 is a Monday', () => {
    expect(dayName(parseLocal('2026-07-06'))).toBe('Monday');
  });
  it('2026-08-09 (National Day) is a Sunday and a weekend', () => {
    expect(dayName(parseLocal('2026-08-09'))).toBe('Sunday');
    expect(isWeekend(parseLocal('2026-08-09'))).toBe(true);
  });
  it('weekdays are not weekends', () => {
    expect(isWeekend(parseLocal('2026-07-08'))).toBe(false);
  });
});

describe('isValidIsoDate', () => {
  it('accepts real dates', () => {
    expect(isValidIsoDate('2026-02-28')).toBe(true);
    expect(isValidIsoDate('2028-02-29')).toBe(true); // leap year
  });
  it('rejects rollover dates that JS Date would silently accept', () => {
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('2026-02-29')).toBe(false); // not a leap year
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-04-31')).toBe(false);
    expect(isValidIsoDate('2026-00-10')).toBe(false);
  });
  it('rejects wrong shapes', () => {
    expect(isValidIsoDate('26-07-06')).toBe(false);
    expect(isValidIsoDate('2026/07/06')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });
});

describe('name tables', () => {
  it('index by getDay/getMonth', () => {
    expect(DAY_NAMES[0]).toBe('Sunday');
    expect(DAY_NAMES[6]).toBe('Saturday');
    expect(MONTH_NAMES[0]).toBe('January');
    expect(MONTH_NAMES[11]).toBe('December');
  });
});
