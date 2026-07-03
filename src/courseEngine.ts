import type {
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

/**
 * FIRST-CUT placement (step 1 of the v5 build): every module starts at the
 * course start month's first teaching day and takes contiguous valid days.
 * Step 2 replaces this with real series (per-month spread + AL fill) and
 * parallel (clustered) distribution.
 */
function scheduleContiguous(
  mod: Module,
  startYear: number,
  startMonth: number,
  holidays: HolidaySet,
): ScheduledLesson[] {
  const out: ScheduledLesson[] = [];
  let y = startYear;
  let m = startMonth;
  let lessonNo = 1;
  for (let months = 0; months < MAX_MONTHS && lessonNo <= mod.totalLessons; months++) {
    for (const d of validTeachingDaysOfMonth(y, m, holidays)) {
      if (lessonNo > mod.totalLessons) break;
      out.push(makeModuleLesson(mod, lessonNo++, d));
    }
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  return out;
}

/** Generate the whole course's schedule (all modules, full span). */
export function generateCourseSchedule(
  course: Course,
  holidays: HolidaySet,
): ScheduledLesson[] {
  const { year, month } = parseMonth(course.startMonth);
  const all = course.modules.flatMap((mod) =>
    scheduleContiguous(mod, year, month, holidays),
  );
  return sortLessons(all);
}
