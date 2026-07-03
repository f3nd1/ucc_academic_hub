import type {
  ClassGroupConfig,
  HolidaySet,
  ScheduledLesson,
} from './types';
import type { FirstDayOfWeek } from './settings';
import {
  formatDisplayDate,
  formatDate,
  parseLocal,
  isWeekend,
  DAY_NAMES,
  MONTH_NAMES,
} from './dateUtils';

// The course-planner (Hybrid) model. Rows are weekdays (in first-day-of-week
// order), columns are the calendar weeks of a month, and each intersection is
// one date's cell. Built once from the generated schedule and consumed by both
// the on-screen Hybrid view and the planner exports.

export type PlannerCellKind =
  | 'teaching'
  | 'weekend'
  | 'schoolHoliday'
  | 'publicHoliday'
  | 'blank' // in-month non-teaching weekday with no lesson
  | 'empty'; // grid slot outside the current month

export interface PlannerCell {
  kind: PlannerCellKind;
  dateIso?: string;
  dateDisplay?: string; // DD MMMM YYYY
  activity?: string;
  lessonName?: string;
  teacher?: string;
  holidayName?: string;
}

export interface PlannerMonth {
  year: number;
  month: number; // 0-based
  monthName: string;
  weeks: number; // number of week columns (1..6)
  /** grid[weekdayRow][weekColumn] */
  grid: PlannerCell[][];
}

export interface PlannerModel {
  /** Label for the primary name row per scope, e.g. "Course" / "Module". */
  scopeLabel: string;
  course: string;
  timing: string;
  updatedDisplay: string;
  weekdayLabels: string[]; // 7, in first-day-of-week order
  months: PlannerMonth[];
}

/** Classify + populate the cell for a given in-month date. */
function cellForDate(
  d: Date,
  iso: string,
  lessons: Map<string, ScheduledLesson>,
  ucc: Map<string, string | undefined>,
  publicH: Map<string, string | undefined>,
): PlannerCell {
  const dateDisplay = formatDisplayDate(iso);

  // Precedence: a scheduled lesson only ever lands on a valid teaching day, so
  // it never collides with a holiday/weekend. Holidays outrank weekend so a
  // public holiday falling on a weekend still shows its name.
  const lesson = lessons.get(iso);
  if (lesson) {
    return {
      kind: 'teaching',
      dateIso: iso,
      dateDisplay,
      activity: lesson.activity,
      lessonName: lesson.lessonName,
      teacher: lesson.teacher,
    };
  }
  if (publicH.has(iso)) {
    return {
      kind: 'publicHoliday',
      dateIso: iso,
      dateDisplay,
      holidayName: publicH.get(iso),
    };
  }
  if (ucc.has(iso)) {
    return {
      kind: 'schoolHoliday',
      dateIso: iso,
      dateDisplay,
      holidayName: ucc.get(iso),
    };
  }
  if (isWeekend(d)) {
    return { kind: 'weekend', dateIso: iso, dateDisplay };
  }
  return { kind: 'blank', dateIso: iso, dateDisplay };
}

/** Build the planner model for the given schedule. `todayIso` feeds "Updated". */
export function buildPlanner(
  lessons: ScheduledLesson[],
  config: ClassGroupConfig,
  holidays: HolidaySet,
  firstDayOfWeek: FirstDayOfWeek,
  todayIso: string,
  scopeLabel = 'Course',
): PlannerModel {
  const startOffset = firstDayOfWeek === 'monday' ? 1 : 0;
  const weekdayLabels = Array.from(
    { length: 7 },
    (_, i) => DAY_NAMES[(startOffset + i) % 7],
  );

  const lessonMap = new Map(lessons.map((l) => [l.date, l]));
  const ucc = new Map(holidays.uccHolidays.map((h) => [h.date, h.name]));
  const publicH = new Map(holidays.publicHolidays.map((h) => [h.date, h.name]));

  const months: PlannerMonth[] = [];

  if (lessons.length > 0) {
    const first = parseLocal(lessons[0].date);
    const last = parseLocal(lessons[lessons.length - 1].date);
    const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
    const end = new Date(last.getFullYear(), last.getMonth(), 1);

    while (cursor <= end) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const lead = (new Date(year, month, 1).getDay() - startOffset + 7) % 7;
      const weeks = Math.ceil((lead + daysInMonth) / 7);

      // Initialise a 7 × weeks grid of empty slots.
      const grid: PlannerCell[][] = Array.from({ length: 7 }, () =>
        Array.from({ length: weeks }, () => ({ kind: 'empty' }) as PlannerCell),
      );

      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month, day);
        const iso = formatDate(d);
        const cellIndex = lead + (day - 1);
        const week = Math.floor(cellIndex / 7);
        const row = cellIndex % 7;
        grid[row][week] = cellForDate(d, iso, lessonMap, ucc, publicH);
      }

      months.push({ year, month, monthName: MONTH_NAMES[month], weeks, grid });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  return {
    scopeLabel,
    course: config.courseName,
    timing: `${config.startTime} to ${config.endTime}`,
    updatedDisplay: formatDisplayDate(todayIso),
    weekdayLabels,
    months,
  };
}

/** Activity text for a cell (used by view + exports so wording matches). */
export function activityText(cell: PlannerCell): string {
  switch (cell.kind) {
    case 'teaching':
      return cell.activity ?? '';
    case 'weekend':
      return 'Weekend';
    case 'schoolHoliday':
      return cell.holidayName
        ? `SchoolHoliday — ${cell.holidayName}`
        : 'SchoolHoliday';
    case 'publicHoliday':
      return cell.holidayName
        ? `PublicHoliday — ${cell.holidayName}`
        : 'PublicHoliday';
    default:
      return '';
  }
}

/** Date sub-column text. Weekend shows "-" per the planner spec. */
export function dateText(cell: PlannerCell): string {
  if (cell.kind === 'empty' || cell.kind === 'blank') return '';
  if (cell.kind === 'weekend') return '-';
  return cell.dateDisplay ?? '';
}

/** Teacher sub-column: lesson label (line 1) + teacher (line 2) when teaching. */
export function teacherLines(cell: PlannerCell): string[] {
  if (cell.kind === 'teaching') {
    return [cell.lessonName ?? '', cell.teacher ?? ''].filter(Boolean);
  }
  if (cell.kind === 'empty' || cell.kind === 'blank') return [];
  return ['-'];
}
