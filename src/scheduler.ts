import type { ClassGroupConfig, HolidaySet, ScheduledLesson, Clash } from './types';
import { formatDate, parseLocal, dayName, isWeekend, MONTH_NAMES } from './dateUtils';

// Safety caps to guarantee termination if inputs can never satisfy totalLessons
// (e.g. everything is a holiday). Generous enough never to bite real use.
const MAX_DAYS_SCAN = 366 * 5; // ~5 years of every-weekday scanning
const MAX_MONTHS_SCAN = 12 * 6; // ~6 years of per-month advancing

/**
 * Pick the lesson name for a 1-based lesson number.
 *
 * DELIBERATE CYCLE: when totalLessons exceeds lessonNames.length the names wrap
 * by modulo. This is intentional for now and marked so it can later be swapped
 * for a full per-lesson name list without hunting for the behaviour.
 */
const lessonNameFor = (lessonNo: number, lessonNames: string[]): string =>
  lessonNames[(lessonNo - 1) % lessonNames.length];

/**
 * Activity paired to a lesson by index (same modulo cycle as the name). Returns
 * undefined when no activity is provided for that slot, so the cell shows the
 * label only.
 */
const activityFor = (
  lessonNo: number,
  lessonNames: string[],
  activities: string[],
): string | undefined => {
  if (activities.length === 0) return undefined;
  const value = activities[(lessonNo - 1) % lessonNames.length];
  return value ? value : undefined;
};

/**
 * A date is a valid teaching day only if all hold:
 *  - not Saturday, not Sunday
 *  - not a UCC holiday
 *  - not a Singapore public holiday
 *  - not already assigned a session for this timetable (one session per day)
 */
const isValidTeachingDay = (
  d: Date,
  ucc: Set<string>,
  publicH: Set<string>,
  assigned: Set<string>,
): boolean => {
  if (isWeekend(d)) return false;
  const key = formatDate(d);
  if (ucc.has(key)) return false;
  if (publicH.has(key)) return false;
  if (assigned.has(key)) return false;
  return true;
};

/** Build a ScheduledLesson from a date and running lesson number. */
const makeLesson = (
  config: ClassGroupConfig,
  lessonNo: number,
  d: Date,
): ScheduledLesson => ({
  groupId: config.id,
  lessonNo,
  lessonName: lessonNameFor(lessonNo, config.lessonNames),
  activity: activityFor(lessonNo, config.lessonNames, config.activities),
  date: formatDate(d),
  day: dayName(d),
  startTime: config.startTime,
  endTime: config.endTime,
  teacher: config.teacher,
  classroom: config.classroom,
  classGroup: config.classGroup,
});

/**
 * Generate a single group's timetable.
 *
 * Mode 1 (lessonsPerMonth === null): one session on every valid weekday from
 * startDate onward until totalLessons is reached.
 *
 * Mode 2 (lessonsPerMonth is a number): month by month, take the valid teaching
 * days in the month (on or after startDate) and spread that month's lessons
 * evenly across them. Throws if a month cannot fit its lessons.
 */
export function generateSchedule(
  config: ClassGroupConfig,
  holidays: HolidaySet,
): ScheduledLesson[] {
  const ucc = new Set(holidays.uccHolidays.map((h) => h.date));
  const publicH = new Set(holidays.publicHolidays.map((h) => h.date));
  const assigned = new Set<string>();
  const lessons: ScheduledLesson[] = [];

  const start = parseLocal(config.startDate);

  // ---- Mode 1: every valid weekday ----
  if (config.lessonsPerMonth === null) {
    const cursor = new Date(start);
    let scanned = 0;
    while (lessons.length < config.totalLessons && scanned < MAX_DAYS_SCAN) {
      if (isValidTeachingDay(cursor, ucc, publicH, assigned)) {
        const lessonNo = lessons.length + 1;
        lessons.push(makeLesson(config, lessonNo, cursor));
        assigned.add(formatDate(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
      scanned++;
    }
    return lessons;
  }

  // ---- Mode 2: even spread per month ----
  const perMonth = config.lessonsPerMonth;
  const startKey = config.startDate; // lexical compare is valid for YYYY-MM-DD

  const monthCursor = new Date(start.getFullYear(), start.getMonth(), 1);
  let months = 0;
  while (lessons.length < config.totalLessons && months < MAX_MONTHS_SCAN) {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Valid teaching days in this month, on or after startDate.
    const validDays: Date[] = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      if (formatDate(d) < startKey) continue;
      if (isValidTeachingDay(d, ucc, publicH, assigned)) validDays.push(d);
    }

    const remaining = config.totalLessons - lessons.length;
    const lessonsToPlace = Math.min(perMonth, remaining);

    if (lessonsToPlace > 0) {
      if (lessonsToPlace > validDays.length) {
        throw new Error(
          `Cannot schedule ${lessonsToPlace} lesson(s) in ${MONTH_NAMES[month]} ${year}: ` +
            `only ${validDays.length} valid teaching day(s) available.`,
        );
      }

      // Even-interval selection across the month's valid days.
      const picked: Date[] = [];
      if (lessonsToPlace === 1) {
        picked.push(validDays[0]);
      } else {
        const interval = (validDays.length - 1) / (lessonsToPlace - 1);
        for (let i = 0; i < lessonsToPlace; i++) {
          picked.push(validDays[Math.round(i * interval)]);
        }
      }

      for (const d of picked) {
        const lessonNo = lessons.length + 1;
        lessons.push(makeLesson(config, lessonNo, d));
        assigned.add(formatDate(d));
      }
    }

    monthCursor.setMonth(monthCursor.getMonth() + 1);
    months++;
  }

  return lessons;
}

// ---------------------------------------------------------------------------
// Future-proofing stubs. Typed signatures only, no behaviour this pass. These
// exist so multi-group scheduling and live clash detection can slot in without
// changing call sites or the data model.
// ---------------------------------------------------------------------------

/** TODO: schedule multiple groups together, resolving cross-group clashes. */
export function generateMultiGroupSchedule(
  configs: ClassGroupConfig[],
  holidays: HolidaySet,
): ScheduledLesson[] {
  // TODO: loop configs, merge results, and reconcile clashes via detectClashes.
  void configs;
  void holidays;
  return [];
}

/** TODO: detect teacher / classroom / class-group / holiday clashes. */
export function detectClashes(lessons: ScheduledLesson[]): Clash[] {
  // TODO: group by date and surface overlapping teacher/classroom/group usage.
  void lessons;
  return [];
}
