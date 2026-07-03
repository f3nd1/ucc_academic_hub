// Module & Course Review planner — data model, timezone-safe date maths, live
// calculations, and validation. No date here ever round-trips through UTC
// (never toISOString): every computed date is built with local Date parts and
// serialised via formatDate, mirroring the timetable tool's date rules.

import {
  parseLocal,
  formatDate,
  isValidIsoDate,
} from '../../shared/dates';

/** One module's review row. */
export interface ModuleReview {
  id: string;
  courseName: string;
  moduleName: string;
  plannedStartDate: string; // YYYY-MM-DD or ''
  actualStartDate: string; // YYYY-MM-DD or ''
}

/** One course's review row. */
export interface CourseReview {
  id: string;
  courseName: string;
  numberOfModules: string; // free text off the input; validated as a positive int
  plannedStartDate: string; // YYYY-MM-DD or ''
  actualStartDate: string; // YYYY-MM-DD or ''
  /** Used as the Per Cycle date only when no matching modules exist. */
  manualPerCycleReviewDate: string; // YYYY-MM-DD or ''
}

let seq = 0;
const uid = (prefix: string): string =>
  `${prefix}-${++seq}-${Math.random().toString(36).slice(2, 7)}`;

export const emptyModuleReview = (): ModuleReview => ({
  id: uid('mr'),
  courseName: '',
  moduleName: '',
  plannedStartDate: '',
  actualStartDate: '',
});

export const emptyCourseReview = (): CourseReview => ({
  id: uid('cr'),
  courseName: '',
  numberOfModules: '',
  plannedStartDate: '',
  actualStartDate: '',
  manualPerCycleReviewDate: '',
});

// --- Date maths (month-end safe, timezone-safe) -----------------------------

/**
 * Add whole months to an ISO date, clamping the day to the target month's last
 * day when the target month is shorter (31 Jan + 1 month -> 28/29 Feb). Built
 * from local Date parts only.
 */
export function addMonthsClamped(iso: string, months: number): string {
  if (!isValidIsoDate(iso)) return '';
  const d = parseLocal(iso);
  const day = d.getDate();
  const firstOfTarget = new Date(d.getFullYear(), d.getMonth() + months, 1);
  const ty = firstOfTarget.getFullYear();
  const tm = firstOfTarget.getMonth();
  // Day 0 of the following month is the last day of the target month.
  const lastDay = new Date(ty, tm + 1, 0).getDate();
  return formatDate(new Date(ty, tm, Math.min(day, lastDay)));
}

/** Add whole years, reusing the month clamp so 29 Feb + 2y -> 28 Feb. */
export const addYearsClamped = (iso: string, years: number): string =>
  addMonthsClamped(iso, years * 12);

// --- Live calculations ------------------------------------------------------

/** Module Review Date = Actual Start Date + 1 month (blank if no valid start). */
export const moduleReviewDate = (m: ModuleReview): string =>
  addMonthsClamped(m.actualStartDate, 1);

const normalise = (name: string): string => name.trim().toLowerCase();

export interface PerCycleResult {
  /** The Per Cycle Review Date, or '' when it cannot be computed. */
  date: string;
  /** True when the date came from matching modules (manual field is disabled). */
  auto: boolean;
  /** True when any module row shares this course's name (trim + case-insensitive). */
  hasMatchingModules: boolean;
}

/**
 * Course Per Cycle Review Date: the latest Module Review Date among modules
 * whose courseName matches this course (trim + case-insensitive). With no
 * matching modules, the manually entered Per Cycle date is used instead.
 */
export function coursePerCycleDate(
  course: CourseReview,
  modules: ModuleReview[],
): PerCycleResult {
  const key = normalise(course.courseName);
  const matching = key
    ? modules.filter((m) => normalise(m.courseName) === key)
    : [];
  const hasMatchingModules = matching.length > 0;

  if (hasMatchingModules) {
    // ISO date strings compare lexically in chronological order.
    const dates = matching
      .map(moduleReviewDate)
      .filter((d) => d !== '')
      .sort();
    const date = dates.length ? dates[dates.length - 1] : '';
    return { date, auto: true, hasMatchingModules };
  }

  const manual = isValidIsoDate(course.manualPerCycleReviewDate)
    ? course.manualPerCycleReviewDate
    : '';
  return { date: manual, auto: false, hasMatchingModules };
}

/** Course Scheduled Review Date = Per Cycle Review Date + 2 years. */
export const courseScheduledDate = (perCycle: string): string =>
  perCycle ? addYearsClamped(perCycle, 2) : '';

/** Everything computed for one course row, ready for the table to render. */
export interface CourseComputed {
  perCycle: PerCycleResult;
  scheduled: string;
}

export const computeCourse = (
  course: CourseReview,
  modules: ModuleReview[],
): CourseComputed => {
  const perCycle = coursePerCycleDate(course, modules);
  return { perCycle, scheduled: courseScheduledDate(perCycle.date) };
};

// --- Validation -------------------------------------------------------------

/** A date field is invalid only when it holds a non-blank, non-real date. */
const badDate = (v: string): boolean =>
  v.trim() !== '' && !isValidIsoDate(v.trim());

export const isPositiveInt = (v: string): boolean => {
  const n = Number(v);
  return v.trim() !== '' && Number.isInteger(n) && n > 0;
};

export function moduleReviewErrors(m: ModuleReview): string[] {
  const errs: string[] = [];
  if (!m.courseName.trim()) errs.push('Course name is required.');
  if (!m.moduleName.trim()) errs.push('Module name is required.');
  if (badDate(m.plannedStartDate)) errs.push('Planned start is not a real date.');
  if (badDate(m.actualStartDate)) errs.push('Actual start is not a real date.');
  return errs;
}

export function courseReviewErrors(c: CourseReview): string[] {
  const errs: string[] = [];
  if (!c.courseName.trim()) errs.push('Course name is required.');
  if (!isPositiveInt(c.numberOfModules))
    errs.push('Number of modules must be a whole number greater than 0.');
  if (badDate(c.plannedStartDate)) errs.push('Planned start is not a real date.');
  if (badDate(c.actualStartDate)) errs.push('Actual start is not a real date.');
  if (badDate(c.manualPerCycleReviewDate))
    errs.push('Per Cycle date is not a real date.');
  return errs;
}

/** Per-field invalid flags for input styling (kept in sync with the errors above). */
export const moduleFieldInvalid = (m: ModuleReview) => ({
  courseName: !m.courseName.trim(),
  moduleName: !m.moduleName.trim(),
  plannedStartDate: badDate(m.plannedStartDate),
  actualStartDate: badDate(m.actualStartDate),
});

export const courseFieldInvalid = (c: CourseReview) => ({
  courseName: !c.courseName.trim(),
  numberOfModules: !isPositiveInt(c.numberOfModules),
  plannedStartDate: badDate(c.plannedStartDate),
  actualStartDate: badDate(c.actualStartDate),
  manualPerCycleReviewDate: badDate(c.manualPerCycleReviewDate),
});
