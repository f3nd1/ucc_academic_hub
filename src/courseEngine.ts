import type {
  Conflict,
  Course,
  HolidaySet,
  Module,
  ScheduledLesson,
} from './types';
import { AL_LABEL, CLASS_GROUP_LABEL } from './constants';
import {
  formatDate,
  formatDisplayDate,
  parseLocal,
  dayName,
  isWeekend,
  parseMonth,
} from './dateUtils';

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

/**
 * Even selection of `take` days across a month's valid days, anchored at the
 * month's first teaching day: index i = floor(i * n / take).
 *
 * Deliberately floor-strided rather than end-anchored: spacing stays roughly
 * equal, but the LAST lesson lands before the month's final valid day whenever
 * take < n, leaving trailing AL buffer. The module-shift feature depends on
 * that slack — an end-anchored spread would put every module's last lesson on
 * its deadline and make every shift impossible.
 */
function evenPick(validDays: Date[], take: number): Date[] {
  if (take >= validDays.length) return [...validDays];
  const n = validDays.length;
  const picked: Date[] = [];
  for (let i = 0; i < take; i++) picked.push(validDays[Math.floor((i * n) / take)]);
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
  { type: 'classGroup', key: (l) => l.classGroup, label: CLASS_GROUP_LABEL },
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

// ---------------------------------------------------------------------------
// Module shift (requirement 5): move a module later by whole valid teaching
// days, consuming its AL buffer, without passing its end-of-month deadline.
// ---------------------------------------------------------------------------

export type ShiftResult =
  | { ok: true; lessons: ScheduledLesson[] }
  | { ok: false; message: string };

/** Advance an ISO date by `steps` valid teaching days. */
function advanceValidDays(iso: string, steps: number, blocked: Set<string>): Date {
  const d = parseLocal(iso);
  let left = steps;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (isValidTeachingDay(d, blocked)) left--;
  }
  return d;
}

/**
 * Shift every lesson of `moduleId` to the valid teaching day `days` steps
 * later. The module's window (the months it currently occupies, lessons + AL)
 * is FIXED: its last lesson must stay on or before the last valid teaching
 * day of its final month — the end-of-module deadline. A shift that would
 * pass the deadline is rejected with a warning instead of applied.
 *
 * In series mode the vacated days become AL and consumed AL days become
 * lessons (the AL fill is rebuilt across the window). Callers re-run
 * detectConflicts on the returned list.
 */
export function shiftModuleLater(
  lessons: ScheduledLesson[],
  moduleId: string,
  days: 1 | 2,
  holidays: HolidaySet,
): ShiftResult {
  const blocked = holidayDates(holidays);
  const moduleEntries = lessons.filter((l) => l.moduleId === moduleId);
  const real = moduleEntries.filter((l) => l.kind === 'lesson');
  if (real.length === 0)
    return { ok: false, message: 'That module has no lessons to shift.' };

  const moduleName = real[0].moduleName;
  const hadAl = moduleEntries.some((l) => l.kind === 'AL');

  // Window months are fixed by the current occupancy (lessons + AL).
  const windowMonths = [...new Set(moduleEntries.map((l) => l.date.slice(0, 7)))].sort();
  const lastMonth = windowMonths[windowMonths.length - 1];
  const { year, month } = parseMonth(lastMonth);
  const monthDays = validTeachingDaysOfMonth(year, month, holidays);
  const deadline = monthDays.length > 0
    ? formatDate(monthDays[monthDays.length - 1])
    : lastMonth + '-01';

  // Move every lesson the same number of valid-day steps (order preserved).
  const moved = real.map((l) => ({
    lesson: l,
    newDate: advanceValidDays(l.date, days, blocked),
  }));
  const lastNew = formatDate(moved[moved.length - 1].newDate);
  if (lastNew > deadline) {
    return {
      ok: false,
      message:
        `Cannot shift "${moduleName}" by ${days} day(s): its last lesson would ` +
        `land after the module deadline of ${formatDisplayDate(deadline)}.`,
    };
  }

  const shifted: ScheduledLesson[] = moved.map(({ lesson, newDate }) => ({
    ...lesson,
    date: formatDate(newDate),
    day: dayName(newDate),
    conflicts: undefined, // re-scanned by the caller
  }));

  // Rebuild the AL fill across the fixed window (series mode only).
  const rebuilt: ScheduledLesson[] = [...shifted];
  if (hadAl) {
    const lessonDates = new Set(shifted.map((l) => l.date));
    const template = moduleEntries.find((l) => l.kind === 'AL')!;
    for (const ym of windowMonths) {
      const { year: y, month: m } = parseMonth(ym);
      for (const d of validTeachingDaysOfMonth(y, m, holidays)) {
        const iso = formatDate(d);
        if (!lessonDates.has(iso)) {
          rebuilt.push({ ...template, date: iso, day: dayName(d) });
        }
      }
    }
  }

  const others = lessons.filter((l) => l.moduleId !== moduleId);
  return { ok: true, lessons: sortLessons([...others, ...rebuilt]) };
}
