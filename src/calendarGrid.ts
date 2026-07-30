import type { ScheduledLesson } from './types';
import type { FirstDayOfWeek } from './shared/settings';
import { formatDate, parseLocal, MONTH_NAMES, DAY_NAMES_SHORT } from './shared/dates';

// Pure month-grid model shared by the Calendar-view PDF export (and testable
// without jsPDF). Mirrors MonthView's cell computation: rows of 7 weekday
// cells, first-day-of-week aware, entries mapped by ISO date.

export interface CalendarCell {
  iso: string;
  dayNum: number;
  inMonth: boolean;
  entries: ScheduledLesson[];
}

export interface CalendarMonth {
  year: number;
  month: number; // 0-based
  monthName: string;
  /** weeks[row][weekday 0..6] in first-day-of-week order. */
  weeks: CalendarCell[][];
}

/** Weekday header labels in first-day order (Mon..Sun or Sun..Sat). */
export const weekdayHeaders = (firstDayOfWeek: FirstDayOfWeek): string[] => {
  const offset = firstDayOfWeek === 'monday' ? 1 : 0;
  return Array.from({ length: 7 }, (_, i) => DAY_NAMES_SHORT[(offset + i) % 7]);
};

/** Build one grid per month spanned by the entries (lessons + AL). */
export function buildCalendarMonths(
  lessons: ScheduledLesson[],
  firstDayOfWeek: FirstDayOfWeek,
): CalendarMonth[] {
  if (lessons.length === 0) return [];
  const offset = firstDayOfWeek === 'monday' ? 1 : 0;

  const byDate = new Map<string, ScheduledLesson[]>();
  for (const l of lessons) {
    const arr = byDate.get(l.date);
    if (arr) arr.push(l);
    else byDate.set(l.date, [l]);
  }

  // Earliest/latest by scan, not by array position — an Amend edit or a
  // hand-added session leaves the list unsorted, and a backwards range would
  // render no months.
  let firstIso = lessons[0].date;
  let lastIso = lessons[0].date;
  for (const l of lessons) {
    if (l.date < firstIso) firstIso = l.date;
    if (l.date > lastIso) lastIso = l.date;
  }
  const first = parseLocal(firstIso);
  const last = parseLocal(lastIso);
  const months: CalendarMonth[] = [];
  const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
  const end = new Date(last.getFullYear(), last.getMonth(), 1);

  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const lead = (new Date(year, month, 1).getDay() - offset + 7) % 7;
    const rows = Math.ceil((lead + daysInMonth) / 7);

    const weeks: CalendarCell[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: CalendarCell[] = [];
      for (let c = 0; c < 7; c++) {
        const date = new Date(year, month, 1 - lead + r * 7 + c);
        const iso = formatDate(date);
        row.push({
          iso,
          dayNum: date.getDate(),
          inMonth: date.getMonth() === month,
          entries: date.getMonth() === month ? (byDate.get(iso) ?? []) : [],
        });
      }
      weeks.push(row);
    }

    months.push({ year, month, monthName: MONTH_NAMES[month], weeks });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}
