import type {
  Conflict,
  Course,
  HolidaySet,
  Module,
  NamedHoliday,
  ScheduledLesson,
} from './types';
import {
  formatDate,
  formatDisplayDate,
  parseLocal,
  dayName,
  isWeekend,
} from './shared/dates';

// Course scheduling engine (windowed model). Each module carries its OWN
// Module Start Date and Module End Date; its lessons are scheduled only on
// valid teaching days inside that window. A day is blocked (no lessons) when it
// is a Saturday, a Sunday, a Singapore public holiday, an OBSERVED public
// holiday (the Monday after a Sunday public holiday), or a UCC school holiday.

// --- Holidays: observed dates + the blocked-day set --------------------------

/** Advance an ISO date by whole days (local, no UTC round-trip). */
const addDaysIso = (iso: string, days: number): string => {
  const d = parseLocal(iso);
  d.setDate(d.getDate() + days);
  return formatDate(d);
};

const isSundayIso = (iso: string): boolean => parseLocal(iso).getDay() === 0;

/**
 * Observed public holidays: when a Singapore public holiday falls on a Sunday,
 * the FOLLOWING Monday is also a public holiday ("<name> observed"). Both the
 * original Sunday and the observed Monday are blocked for scheduling.
 */
export function observedPublicHolidays(
  publicHolidays: NamedHoliday[],
): NamedHoliday[] {
  return publicHolidays
    .filter((h) => h.date && isSundayIso(h.date))
    .map((h) => ({
      date: addDaysIso(h.date, 1),
      name: h.name ? `${h.name} observed` : 'Observed public holiday',
    }));
}

/** Every blocked ISO date: UCC + public + observed-public holidays. */
export const blockedDates = (holidays: HolidaySet): Set<string> =>
  new Set(
    [
      ...holidays.uccHolidays,
      ...holidays.publicHolidays,
      ...observedPublicHolidays(holidays.publicHolidays),
    ].map((h) => h.date),
  );

/** A date is a valid teaching day: a weekday that is not a blocked holiday. */
export const isValidTeachingDay = (d: Date, blocked: Set<string>): boolean =>
  !isWeekend(d) && !blocked.has(formatDate(d));

/** All valid teaching days of a month (0-based month), in date order. */
export function validTeachingDaysOfMonth(
  year: number,
  month: number,
  holidays: HolidaySet,
): Date[] {
  const blocked = blockedDates(holidays);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const out: Date[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month, day);
    if (isValidTeachingDay(d, blocked)) out.push(d);
  }
  return out;
}

/** Valid teaching ISO dates within [startISO, endISO] (inclusive), in order. */
export function validTeachingDatesInRange(
  startISO: string,
  endISO: string,
  blocked: Set<string>,
): string[] {
  const start = parseLocal(startISO);
  const end = parseLocal(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  if (start.getTime() > end.getTime()) return [];

  const out: string[] = [];
  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    if (isValidTeachingDay(cur, blocked)) out.push(formatDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

// --- Lesson construction -----------------------------------------------------

/** Lesson label by 1-based number (modulo cycle). */
const labelFor = (lessonNo: number, names: string[]): string =>
  names.length ? names[(lessonNo - 1) % names.length] : `Lesson ${lessonNo}`;

const activityFor = (lessonNo: number, mod: Module): string | undefined => {
  const activities = mod.activities ?? [];
  const names = mod.lessonNames.length || 1;
  if (activities.length === 0) return undefined;
  const value = activities[(lessonNo - 1) % names];
  return value ? value : undefined;
};

/** Build a real lesson entry for a module on an ISO date. */
export const makeModuleLesson = (
  mod: Module,
  lessonNo: number,
  iso: string,
): ScheduledLesson => {
  const d = parseLocal(iso);
  return {
    groupId: mod.id,
    moduleId: mod.id,
    moduleName: mod.name,
    kind: 'lesson',
    lessonNo,
    lessonName: labelFor(lessonNo, mod.lessonNames),
    activity: activityFor(lessonNo, mod),
    date: iso,
    day: dayName(d),
    startTime: mod.startTime,
    endTime: mod.endTime,
    teacher: mod.teacher,
    classroom: mod.classroom,
    classGroup: mod.classGroup,
  };
};

/** Stable ordering: date, then start time, then module. */
export const sortLessons = (lessons: ScheduledLesson[]): ScheduledLesson[] =>
  [...lessons].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.moduleId.localeCompare(b.moduleId),
  );

// --- Fit validation ----------------------------------------------------------

export const FIT_MESSAGE =
  'does not fit within the selected start and end dates after excluding ' +
  'weekends, public holidays, observed public holidays, and school holidays. ' +
  'Please extend the date range or reduce the number of lessons.';

/**
 * Warn about modules whose lessons cannot fit their window. Checks the number
 * of available valid teaching days between each module's start and end date
 * against its total lessons, and flags missing/invalid windows.
 */
export function validateModuleFit(
  course: Course,
  holidays: HolidaySet,
): string[] {
  const blocked = blockedDates(holidays);
  const warnings: string[] = [];

  for (const mod of course.modules) {
    const label = mod.name || 'Unnamed module';
    if (!mod.moduleStartDate || !mod.moduleEndDate) {
      warnings.push(`${label} is missing a module start date or module end date.`);
      continue;
    }
    const available = validTeachingDatesInRange(
      mod.moduleStartDate,
      mod.moduleEndDate,
      blocked,
    ).length;
    if (available < mod.totalLessons) {
      warnings.push(
        `${label} has ${mod.totalLessons} lesson(s), but only ${available} ` +
          `valid teaching day(s) are available between ` +
          `${formatDisplayDate(mod.moduleStartDate)} and ` +
          `${formatDisplayDate(mod.moduleEndDate)}. The number of lessons ` +
          FIT_MESSAGE,
      );
    }
  }

  return warnings;
}

// --- Generation --------------------------------------------------------------

/**
 * Generate the whole course's schedule. Each module's lessons are placed on the
 * EARLIEST valid teaching days within its own [Module Start, Module End]
 * window. Lessons never land on a blocked day and never fall outside the
 * window; if fewer teaching days are available than lessons requested, only the
 * days that fit are scheduled (validateModuleFit surfaces the shortfall).
 */
export function generateCourseSchedule(
  course: Course,
  holidays: HolidaySet,
): ScheduledLesson[] {
  const blocked = blockedDates(holidays);
  const all: ScheduledLesson[] = [];

  for (const mod of course.modules) {
    const dates = validTeachingDatesInRange(
      mod.moduleStartDate,
      mod.moduleEndDate,
      blocked,
    );
    const take = Math.min(mod.totalLessons, dates.length);
    for (let i = 0; i < take; i++) {
      all.push(makeModuleLesson(mod, i + 1, dates[i]));
    }
  }

  return sortLessons(all);
}

// --- Conflict detection (amended rule) --------------------------------------
//
// A conflict is flagged ONLY when, for two DIFFERENT modules, all three of
// these hold: same teacher, same time (overlapping range on the same date),
// AND same classroom. Matching only one or two of the fields is not a conflict.

/** Time ranges overlap when startA < endB && startB < endA. */
const overlaps = (a: ScheduledLesson, b: ScheduledLesson): boolean =>
  a.startTime < b.endTime && b.startTime < a.endTime;

const sameText = (a: string, b: string): boolean =>
  a.trim() !== '' && a.trim().toLowerCase() === b.trim().toLowerCase();

export interface ConflictScan {
  /** Copy of the input with `conflicts` attached to every affected lesson. */
  lessons: ScheduledLesson[];
  conflicts: Conflict[];
}

/**
 * Scan real lessons for same-date, overlapping-time clashes between different
 * modules that share BOTH the same teacher AND the same classroom. Applies to
 * generated and manually amended entries alike. Returns the conflict list plus
 * a lesson list with `conflicts` attached for highlighting.
 */
export function detectConflicts(lessons: ScheduledLesson[]): ConflictScan {
  const conflicts: Conflict[] = [];
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
        if (a.moduleId === b.moduleId) continue;
        // ALL THREE must match: teacher, time (overlap), classroom.
        if (
          !overlaps(a, b) ||
          !sameText(a.teacher, b.teacher) ||
          !sameText(a.classroom, b.classroom)
        )
          continue;

        const conflict: Conflict = {
          type: 'teacherRoomTime',
          date,
          moduleIds: [a.moduleId, b.moduleId],
          detail:
            `Same teacher "${a.teacher}", same classroom "${a.classroom}", ` +
            `overlapping time: ${a.moduleName} (${a.startTime}–${a.endTime}) ` +
            `and ${b.moduleName} (${b.startTime}–${b.endTime}).`,
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

  return {
    lessons: lessons.map((l) => {
      const found = hits.get(l);
      return found ? { ...l, conflicts: found } : { ...l, conflicts: undefined };
    }),
    conflicts,
  };
}
