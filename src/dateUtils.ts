// Timezone-safe, local date helpers.
//
// CRITICAL: never derive a YYYY-MM-DD string via Date.prototype.toISOString().
// Singapore is UTC+8, so a date built with new Date(year, month, day) is
// midnight local time, which is the PREVIOUS day in UTC. Serialising through
// UTC (as toISOString does) shifts every date back by one. All formatting and
// parsing here stays in local time to keep the calendar day intact.

const pad = (n: number) => String(n).padStart(2, '0');

/** Format a Date as a local YYYY-MM-DD string (no UTC conversion). */
export const formatDate = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Parse a YYYY-MM-DD string as a local Date (midnight local time). */
export const parseLocal = (s: string): Date => {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(y, m - 1, day);
};

// Single source for calendar name lists — indexed by Date#getDay / #getMonth.
export const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const DAY_NAMES_SHORT = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
] as const;

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/** Weekday name for a local Date, e.g. "Monday". */
export const dayName = (d: Date): string => DAY_NAMES[d.getDay()];

/**
 * Human display format for an ISO date: "01 July 2026".
 * ISO stays the internal value everywhere; this is presentation only. The
 * explicit "T00:00:00" pins parsing to local midnight so the day never shifts.
 */
export const formatDisplayDate = (iso: string): string =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

/** True for Saturday (6) or Sunday (0). */
export const isWeekend = (d: Date): boolean => {
  const g = d.getDay();
  return g === 0 || g === 6;
};

/** Matches the required date shape for holiday inputs. */
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * True when `s` is YYYY-MM-DD AND a real calendar date. JS Date silently rolls
 * invalid dates over (2026-02-30 → 02 March), which would suppress the wrong
 * day if used as a holiday — the round-trip check catches that.
 */
export const isValidIsoDate = (s: string): boolean =>
  DATE_PATTERN.test(s) && formatDate(parseLocal(s)) === s;

/** Matches the YYYY-MM shape used for the course start month. */
export const MONTH_PATTERN = /^\d{4}-\d{2}$/;

/** True when `s` is a real YYYY-MM month (01–12). */
export const isValidIsoMonth = (s: string): boolean => {
  if (!MONTH_PATTERN.test(s)) return false;
  const m = Number(s.slice(5, 7));
  return m >= 1 && m <= 12;
};

/** Parse YYYY-MM into { year, month } with month 0-based (Date convention). */
export const parseMonth = (s: string): { year: number; month: number } => {
  const [y, m] = s.split('-').map(Number);
  return { year: y, month: m - 1 };
};

/** Human display for a YYYY-MM month: "July 2026". */
export const formatDisplayMonth = (ym: string): string => {
  const { year, month } = parseMonth(ym);
  return `${MONTH_NAMES[month]} ${year}`;
};
