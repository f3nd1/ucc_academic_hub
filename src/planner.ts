import type { Course, HolidaySet, ScheduledLesson } from './types';
import type { FirstDayOfWeek } from './shared/settings';
import { AL_LABEL } from './constants';
import {
  formatDisplayDate,
  formatDate,
  parseLocal,
  isWeekend,
  DAY_NAMES,
  MONTH_NAMES,
} from './shared/dates';

// The course-planner (Hybrid) model. Rows are weekdays (in first-day-of-week
// order), columns are the calendar weeks of a month, and each intersection is
// one date's cell. Built once from the generated schedule and consumed by both
// the on-screen Hybrid view and the planner exports.

export type PlannerCellKind =
  | 'teaching'
  | 'al' // AL buffer day (series-mode fill)
  | 'weekend'
  | 'schoolHoliday'
  | 'publicHoliday'
  | 'blank' // in-month non-teaching weekday with no lesson
  | 'empty'; // grid slot outside the current month

/** One lesson inside a teaching cell (parallel mode can stack several). */
export interface PlannerEntry {
  moduleId: string;
  moduleName: string;
  lessonName: string;
  teacher: string;
  activity?: string;
  /** True when the underlying lesson carries cross-module conflicts. */
  conflict: boolean;
}

export interface PlannerCell {
  kind: PlannerCellKind;
  dateIso?: string;
  dateDisplay?: string; // DD MMMM YYYY
  /** Teaching cells: one entry per lesson on this date. */
  entries?: PlannerEntry[];
  holidayName?: string;
  /** True when any entry in the cell is conflicted. */
  conflict?: boolean;
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
  byDate: Map<string, ScheduledLesson[]>,
  ucc: Map<string, string | undefined>,
  publicH: Map<string, string | undefined>,
): PlannerCell {
  const dateDisplay = formatDisplayDate(iso);

  // Precedence: scheduled entries only ever land on valid teaching days, so
  // they never collide with a holiday/weekend. Holidays outrank weekend so a
  // public holiday falling on a weekend still shows its name.
  const dayLessons = byDate.get(iso) ?? [];
  const real = dayLessons.filter((l) => l.kind === 'lesson');
  if (real.length > 0) {
    const entries: PlannerEntry[] = real.map((l) => ({
      moduleId: l.moduleId,
      moduleName: l.moduleName,
      lessonName: l.lessonName,
      teacher: l.teacher,
      activity: l.activity,
      conflict: (l.conflicts?.length ?? 0) > 0,
    }));
    return {
      kind: 'teaching',
      dateIso: iso,
      dateDisplay,
      entries,
      conflict: entries.some((e) => e.conflict),
    };
  }
  if (dayLessons.some((l) => l.kind === 'AL')) {
    return { kind: 'al', dateIso: iso, dateDisplay };
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
  course: Course,
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

  const byDate = new Map<string, ScheduledLesson[]>();
  for (const l of lessons) {
    const arr = byDate.get(l.date);
    if (arr) arr.push(l);
    else byDate.set(l.date, [l]);
  }
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
        grid[row][week] = cellForDate(d, iso, byDate, ucc, publicH);
      }

      months.push({ year, month, monthName: MONTH_NAMES[month], weeks, grid });
      cursor.setMonth(cursor.getMonth() + 1);
    }
  }

  // Timing line: the shared window when every module keeps the same times,
  // otherwise flag that it varies (parallel courses often stagger modules).
  const first = course.modules[0];
  const uniform =
    !!first &&
    course.modules.every(
      (m) => m.startTime === first.startTime && m.endTime === first.endTime,
    );
  return {
    scopeLabel,
    course: course.name,
    timing: uniform && first
      ? `${first.startTime} to ${first.endTime}`
      : 'varies by module',
    updatedDisplay: formatDisplayDate(todayIso),
    weekdayLabels,
    months,
  };
}

/** Activity text for a cell (used by view + exports so wording matches). */
export function activityText(cell: PlannerCell): string {
  switch (cell.kind) {
    case 'teaching':
      return (cell.entries ?? [])
        .map((e) => e.activity ?? '')
        .filter(Boolean)
        .join(' / ');
    case 'al':
      return AL_LABEL;
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

/** Lesson sub-column: one lesson label per entry when teaching, else "-". */
export function lessonLines(cell: PlannerCell): string[] {
  if (cell.kind === 'teaching') {
    return (cell.entries ?? []).map((e) => e.lessonName).filter(Boolean);
  }
  if (cell.kind === 'empty' || cell.kind === 'blank') return [];
  return ['-'];
}

/** Teacher sub-column: one teacher name per entry when teaching, else "-". */
export function teacherLines(cell: PlannerCell): string[] {
  if (cell.kind === 'teaching') {
    return (cell.entries ?? []).map((e) => e.teacher).filter(Boolean);
  }
  if (cell.kind === 'empty' || cell.kind === 'blank') return [];
  return ['-'];
}
