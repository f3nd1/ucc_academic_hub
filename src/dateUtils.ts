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

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

/** Weekday name for a local Date, e.g. "Monday". */
export const dayName = (d: Date): string => DAY_NAMES[d.getDay()];

/** Weekday name for an ISO YYYY-MM-DD string. */
export const dayNameFromIso = (iso: string): string => dayName(parseLocal(iso));

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
