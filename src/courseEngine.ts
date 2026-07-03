import type {
  Conflict,
  Course,
  HolidaySet,
  Module,
  ScheduledLesson,
} from './types';
import { AL_LABEL } from './constants';
import { formatDate, dayName, isWeekend, parseMonth } from './dateUtils';

// Course scheduling engine (v5). Modules start month-anchored: on the 1st of
// their start month, or the next valid teaching day when the 1st is blocked.
// Series mode runs modules sequentially with per-month spreading and AL buffer
// fill; parallel mode runs all modules concurrently in contiguous blocks.

const MAX_MONTHS = 120; // termination cap: no realistic course spans 10 years

/** Set of holiday ISO dates (both lists). */
const holidayDates = (holidays: HolidaySet): Set<string> =>
  new Set(
    [...holidays.uccHolidays, ...holidays.publicHolidays].map((h) => h.date),
  );

/** A date is a valid teaching day: weekday, not a UCC/public holiday. */
export const isValidTeachingDay = (d: Date, blocked: Set<string>): boolean =>
  !isWeekend(d) && !blocked.has(formatDate(d));

/** All valid teaching days of a month (0-based month), in date order. */
export function validTeachingDaysOfMonth(
  year: number,
  month: number,
  holidays: HolidaySet,
): Date[] {
  const blocked = holidayDates(holidays);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const out: Date[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    if (isValidTeachingDay(d, blocked)) out.push(d);
  }
  return out;
}

/**
 * The month-anchored start: the 1st of the month, or the next valid teaching
 * day when the 1st is a weekend or holiday. Null if the whole month is blocked.
 */
export function firstTeachingDayOfMonth(
  year: number,
  month: number,
  holidays: HolidaySet,
): Date | null {
  return validTeachingDaysOfMonth(year, month, holidays)[0] ?? null;
}

/** Lesson label / activity by 1-based number (modulo cycle, as v1). */
const labelFor = (lessonNo: number, names: string[]): string =>
  names[(lessonNo - 1) % names.length];

const activityFor = (lessonNo: number, mod: Module): string | undefined => {
  const activities = mod.activities ?? [];
  if (activities.length === 0) return undefined;
  const value = activities[(lessonNo - 1) % mod.lessonNames.length];
  return value ? value : undefined;
};

/** Build a real lesson entry for a module on a date. */
export const makeModuleLesson = (
  mod: Module,
  lessonNo: number,
  d: Date,
): ScheduledLesson => ({
  groupId: mod.id,
  moduleId: mod.id,
  moduleName: mod.name,
  kind: 'lesson',
  lessonNo,
  lessonName: labelFor(lessonNo, mod.lessonNames),
  activity: activityFor(lessonNo, mod),
  date: formatDate(d),
  day: dayName(d),
  startTime: mod.startTime,
  endTime: mod.endTime,
  teacher: mod.teacher,
  classroom: mod.classroom,
  classGroup: mod.classGroup,
});

/** Build an AL (buffer) entry: no teacher, no room, no times. */
export const makeAlEntry = (mod: Module, d: Date): ScheduledLesson => ({
  groupId: mod.id,
  moduleId: mod.id,
  moduleName: mod.name,
  kind: 'AL',
  lessonNo: 0,
  lessonName: AL_LABEL,
  date: formatDate(d),
  day: dayName(d),
  startTime: '',
  endTime: '',
  teacher: '',
  classroom: '',
  classGroup: mod.classGroup,
});

/** Stable ordering: date, then start time (AL's '' first), then module. */
export const sortLessons = (lessons: ScheduledLesson[]): ScheduledLesson[] =>
  [...lessons].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.moduleId.localeCompare(b.moduleId),
  );

/** Even-interval selection of `take` days across a month's valid days. */
function evenPick(validDays: Date[], take: number): Date[] {
  if (take >= validDays.length) return [...validDays];
  if (take === 1) return [validDays[0]];
  const interval = (validDays.length - 1) / (take - 1);
  const picked: Date[] = [];
  for (let i = 0; i < take; i++) picked.push(validDays[Math.round(i * interval)]);
  return picked;
}

/** Result of placing one module: its entries plus its final lesson month. */
export interface ModulePlacement {
  entries: ScheduledLesson[];
  /** Month (0-based) and year of the module's final lesson. */
  endYear: number;
  endMonth: number;
}

const nextMonth = (y: number, m: number): [number, number] =>
  m === 11 ? [y + 1, 0] : [y, m + 1];

/**
 * SERIES placement for one module. Starting at its start month (the 1st, or
 * the next valid teaching day), each active month takes
 * min(remaining, validDays) lessons spread evenly across the month's valid
 * teaching days; every remaining valid weekday in an active month becomes an
 * AL buffer entry. Overflow continues into the following month.
 */
export function scheduleSeriesModule(
  mod: Module,
  startYear: number,
  startMonth: number,
  holidays: HolidaySet,
): ModulePlacement {
  const entries: ScheduledLesson[] = [];
  let remaining = mod.totalLessons;
  let lessonNo = 1;
  let y = startYear;
  let m = startMonth;
  let endYear = startYear;
  let endMonth = startMonth;

  for (let months = 0; months < MAX_MONTHS && remaining > 0; months++) {
    const validDays = validTeachingDaysOfMonth(y, m, holidays);
    if (validDays.length > 0) {
      const take = Math.min(remaining, validDays.length);
      const picked = new Set(evenPick(validDays, take).map((d) => formatDate(d)));
      for (const d of validDays) {
        if (picked.has(formatDate(d))) {
          entries.push(makeModuleLesson(mod, lessonNo++, d));
        } else {
          entries.push(makeAlEntry(mod, d));
        }
      }
      remaining -= take;
      if (remaining === 0) {
        endYear = y;
        endMonth = m;
      }
    }
    [y, m] = nextMonth(y, m);
  }

  return { entries, endYear, endMonth };
}

/**
 * PARALLEL placement for one module: start at the month's first teaching day
 * and take CONTIGUOUS valid teaching days (a block), crossing months as
 * needed. No AL fill in parallel mode.
 */
export function scheduleParallelModule(
  mod: Module,
  startYear: number,
  startMonth: number,
  holidays: HolidaySet,
): ModulePlacement {
  const entries: ScheduledLesson[] = [];
  let lessonNo = 1;
  let y = startYear;
  let m = startMonth;
  let endYear = startYear;
  let endMonth = startMonth;

  for (let months = 0; months < MAX_MONTHS && lessonNo <= mod.totalLessons; months++) {
    for (const d of validTeachingDaysOfMonth(y, m, holidays)) {
      if (lessonNo > mod.totalLessons) break;
      entries.push(makeModuleLesson(mod, lessonNo++, d));
      endYear = y;
      endMonth = m;
    }
    [y, m] = nextMonth(y, m);
  }

  return { entries, endYear, endMonth };
}

/**
 * Generate the whole course's schedule (all modules, full span).
 *
 * Series: modules run sequentially — module N+1 starts on the 1st of the month
 * AFTER module N's final lesson month. Parallel: every module starts at the
 * course start month and runs concurrently.
 */
export function generateCourseSchedule(
  course: Course,
  holidays: HolidaySet,
): ScheduledLesson[] {
  const start = parseMonth(course.startMonth);
  const all: ScheduledLesson[] = [];

  if (course.deliveryMode === 'series') {
    let y = start.year;
    let m = start.month;
    for (const mod of course.modules) {
      const placed = scheduleSeriesModule(mod, y, m, holidays);
      all.push(...placed.entries);
      [y, m] = nextMonth(placed.endYear, placed.endMonth);
    }
  } else {
    for (const mod of course.modules) {
      all.push(
        ...scheduleParallelModule(mod, start.year, start.month, holidays)
          .entries,
      );
    }
  }

  return sortLessons(all);
}

// ---------------------------------------------------------------------------
// Conflict detection (requirement 4). Real lessons only — AL days are buffers.
// ---------------------------------------------------------------------------

/** Time ranges overlap when startA < endB && startB < endA. */
const overlaps = (a: ScheduledLesson, b: ScheduledLesson): boolean =>
  a.startTime < b.endTime && b.startTime < a.endTime;

export interface ConflictScan {
  /** Copy of the input with `conflicts` attached to every affected lesson. */
  lessons: ScheduledLesson[];
  conflicts: Conflict[];
}

const CONFLICT_CHECKS: {
  type: Conflict['type'];
  key: (l: ScheduledLesson) => string;
  label: string;
}[] = [
  { type: 'teacher', key: (l) => l.teacher, label: 'Teacher' },
  { type: 'classroom', key: (l) => l.classroom, label: 'Classroom' },
  { type: 'classGroup', key: (l) => l.classGroup, label: 'Class group' },
];

/**
 * Scan all real lessons (AL excluded) for same-date, overlapping-time clashes
 * between DIFFERENT modules sharing a teacher, classroom, or class group.
 * Returns the conflict list plus a lesson list with `conflicts` attached to
 * each affected lesson, ready for highlighting in every view.
 */
export function detectConflicts(lessons: ScheduledLesson[]): ConflictScan {
  const conflicts: Conflict[] = [];
  // moduleId|date|index → conflicts hitting that lesson.
  const hits = new Map<ScheduledLesson, Conflict[]>();

  const byDate = new Map<string, ScheduledLesson[]>();
  for (const l of lessons) {
    if (l.kind !== 'lesson') continue;
    const arr = byDate.get(l.date);
    if (arr) arr.push(l);
    else byDate.set(l.date, [l]);
  }

  for (const [date, day] of [...byDate.entries()].sort()) {
    for (let i = 0; i < day.length; i++) {
      for (let j = i + 1; j < day.length; j++) {
        const a = day[i];
        const b = day[j];
        if (a.moduleId === b.moduleId || !overlaps(a, b)) continue;
        for (const check of CONFLICT_CHECKS) {
          const ka = check.key(a);
          if (!ka || ka !== check.key(b)) continue;
          const conflict: Conflict = {
            type: check.type,
            date,
            moduleIds: [a.moduleId, b.moduleId],
            detail:
              `${check.label} "${ka}": ${a.moduleName} (${a.startTime}–${a.endTime}) ` +
              `and ${b.moduleName} (${b.startTime}–${b.endTime}) overlap.`,
          };
          conflicts.push(conflict);
          for (const l of [a, b]) {
            const list = hits.get(l);
            if (list) list.push(conflict);
            else hits.set(l, [conflict]);
          }
        }
      }
    }
  }

  return {
    lessons: lessons.map((l) => {
      const found = hits.get(l);
      return found ? { ...l, conflicts: found } : { ...l, conflicts: undefined };
    }),
    conflicts,
  };
}
