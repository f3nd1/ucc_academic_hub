import type { ClassGroupConfig, HolidaySet, ScheduledLesson, Clash } from './types';
import { formatDate, parseLocal, dayName, isWeekend, MONTH_NAMES } from './shared/dates';

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
  moduleId: config.id,
  moduleName: config.courseName,
  kind: 'lesson',
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
// Multi-group scheduling + clash detection. No UI surface yet (the multi-group
// dashboard is a future pass); these are the engine pieces it will call.
// ---------------------------------------------------------------------------

/**
 * Schedule several groups against the same holiday calendar and merge the
 * results, ordered by date, then start time, then group. Each group keeps its
 * own one-session-per-day rule; DIFFERENT groups may land on the same date —
 * surfacing shared-teacher/room conflicts is detectClashes' job, so a future
 * dashboard can show them rather than silently reshuffling.
 */
export function generateMultiGroupSchedule(
  configs: ClassGroupConfig[],
  holidays: HolidaySet,
): ScheduledLesson[] {
  const all = configs.flatMap((config) => generateSchedule(config, holidays));
  return all.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.startTime.localeCompare(b.startTime) ||
      a.groupId.localeCompare(b.groupId),
  );
}

/** Two lessons overlap when their [start, end) windows intersect. */
const overlaps = (a: ScheduledLesson, b: ScheduledLesson): boolean =>
  a.startTime < b.endTime && b.startTime < a.endTime;

/** Group an array into a Map by key, skipping empty keys. */
const groupBy = (
  lessons: ScheduledLesson[],
  keyOf: (l: ScheduledLesson) => string,
): Map<string, ScheduledLesson[]> => {
  const map = new Map<string, ScheduledLesson[]>();
  for (const l of lessons) {
    const key = keyOf(l);
    if (!key) continue;
    const arr = map.get(key);
    if (arr) arr.push(l);
    else map.set(key, [l]);
  }
  return map;
};

/**
 * Detect scheduling conflicts in a (possibly multi-group) lesson list:
 *  - duplicateSession: one group scheduled more than once on a date.
 *  - teacher / classroom / classGroup: the same resource claimed by two or
 *    more DIFFERENT groups at overlapping times on the same date.
 *  - uccHoliday / publicHoliday: lessons landing on a holiday — impossible
 *    from generateSchedule, but reachable via imported or hand-merged data
 *    (pass the HolidaySet to enable these checks).
 * One Clash is emitted per (type, date, resource) with every involved lesson.
 */
export function detectClashes(
  lessons: ScheduledLesson[],
  holidays?: HolidaySet,
): Clash[] {
  const clashes: Clash[] = [];
  const byDate = groupBy(lessons, (l) => l.date);

  /** Resource contention: same key, ≥2 groups, at least one overlapping pair. */
  const checkResource = (
    day: ScheduledLesson[],
    date: string,
    type: Clash['type'],
    keyOf: (l: ScheduledLesson) => string,
    label: string,
  ) => {
    for (const [key, claimants] of groupBy(day, keyOf)) {
      const groups = new Set(claimants.map((l) => l.groupId));
      if (groups.size < 2) continue;
      const contested = claimants.some((a, i) =>
        claimants.some(
          (b, j) => j > i && a.groupId !== b.groupId && overlaps(a, b),
        ),
      );
      if (contested) {
        clashes.push({
          type,
          date,
          detail: `${label} "${key}" is claimed by ${groups.size} groups at overlapping times.`,
          lessons: claimants,
        });
      }
    }
  };

  for (const [date, day] of [...byDate.entries()].sort()) {
    // One session per day per group.
    for (const [, sessions] of groupBy(day, (l) => l.groupId)) {
      if (sessions.length > 1) {
        clashes.push({
          type: 'duplicateSession',
          date,
          detail: `Group "${sessions[0].classGroup}" has ${sessions.length} sessions on the same day.`,
          lessons: sessions,
        });
      }
    }
    checkResource(day, date, 'teacher', (l) => l.teacher, 'Teacher');
    checkResource(day, date, 'classroom', (l) => l.classroom, 'Classroom');
    checkResource(day, date, 'classGroup', (l) => l.classGroup, 'Class group');
  }

  if (holidays) {
    const named = (
      list: { date: string; name?: string }[],
      type: 'uccHoliday' | 'publicHoliday',
      label: string,
    ) => {
      for (const h of list) {
        const hit = byDate.get(h.date);
        if (hit && hit.length > 0) {
          clashes.push({
            type,
            date: h.date,
            detail: `${hit.length} lesson(s) fall on the ${label}${h.name ? ` "${h.name}"` : ''}.`,
            lessons: hit,
          });
        }
      }
    };
    named(holidays.uccHolidays, 'uccHoliday', 'school holiday');
    named(holidays.publicHolidays, 'publicHoliday', 'public holiday');
  }

  return clashes;
}
