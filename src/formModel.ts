import type { ClassGroupConfig, HolidaySet, NamedHoliday } from './types';
import { DATE_PATTERN, isValidIsoDate } from './dateUtils';

export type SchedulingMode = 'weekday' | 'permonth';

/** Raw form state — every field is a string as it comes off the inputs. */
export interface RawForm {
  courseName: string;
  classGroup: string;
  teacher: string;
  classroom: string;
  lessonNamesRaw: string; // one per line
  activitiesRaw: string; // one per line, paired to lesson names by index
  totalLessons: string;
  mode: SchedulingMode;
  lessonsPerMonth: string; // used only in per-month mode
  startDate: string;
  startTime: string;
  endTime: string;
  uccHolidaysRaw: string; // one per line: "YYYY-MM-DD" or "YYYY-MM-DD, name"
  publicHolidaysRaw: string; // one per line: "YYYY-MM-DD" or "YYYY-MM-DD, name"
}

export const EMPTY_FORM: RawForm = {
  courseName: '',
  classGroup: '',
  teacher: '',
  classroom: '',
  lessonNamesRaw: '',
  activitiesRaw: '',
  totalLessons: '',
  mode: 'weekday',
  lessonsPerMonth: '',
  startDate: '',
  startTime: '',
  endTime: '',
  uccHolidaysRaw: '',
  publicHolidaysRaw: '',
};

// Demo data loaded by the "Load demo data" button, so the app is testable in
// two clicks: load the demo, then "Generate timetable" for the acceptance
// result (20 sessions, no weekends, skipping the two public holidays).
export const DEMO_FORM: RawForm = {
  courseName: 'Foundations of Data Science',
  classGroup: 'DS-2026A',
  teacher: 'Ms Tan',
  classroom: 'Room 3-01',
  lessonNamesRaw: [
    'Introduction',
    'Data Types',
    'Control Flow',
    'Functions',
    'Data Structures',
  ].join('\n'),
  activitiesRaw: ['Listening', 'Reading', 'Writing', 'Speaking', 'Grammar'].join(
    '\n',
  ),
  // Per-month so the demo spans July–September and showcases the planner's
  // public/school-holiday cells (National Day, Term Break) across months.
  totalLessons: '24',
  mode: 'permonth',
  lessonsPerMonth: '8',
  startDate: '2026-07-06',
  startTime: '09:00',
  endTime: '10:00',
  uccHolidaysRaw: '2026-09-01, Term Break',
  publicHolidaysRaw: ['2026-08-09, National Day', '2026-12-25, Christmas'].join(
    '\n',
  ),
};

/** Split a textarea into trimmed, non-empty lines. */
export const parseLines = (raw: string): string[] =>
  raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/**
 * Split a textarea into trimmed lines PRESERVING interior blanks, so entries
 * keep their line positions. Used for activities, which pair to lesson names
 * by index — a blank line means "this lesson has no activity" and must not
 * shift later lines up. Trailing blank lines are dropped.
 */
export const parseAlignedLines = (raw: string): string[] => {
  const lines = raw.split('\n').map((s) => s.trim());
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
};

/**
 * Parse one holiday line into { date, name }. Accepts "YYYY-MM-DD" or
 * "YYYY-MM-DD, name" (only the first comma splits date from name).
 */
export function parseHolidayLine(line: string): NamedHoliday {
  const comma = line.indexOf(',');
  if (comma === -1) return { date: line.trim() };
  const date = line.slice(0, comma).trim();
  const name = line.slice(comma + 1).trim();
  return name ? { date, name } : { date };
}

/** Parse a holiday textarea into NamedHoliday[]. */
export const parseNamedHolidays = (raw: string): NamedHoliday[] =>
  parseLines(raw).map(parseHolidayLine);

/**
 * Validate the "details" inputs (everything except holidays). `primaryLabel`
 * names the primary field per the chosen scope (e.g. "Module name").
 */
export function validateDetails(
  form: RawForm,
  primaryLabel = 'Course name',
): string[] {
  const errors: string[] = [];

  if (!form.courseName.trim()) errors.push(`${primaryLabel} is required.`);
  if (!form.classGroup.trim()) errors.push('Class group is required.');

  const lessonNames = parseLines(form.lessonNamesRaw);
  if (lessonNames.length === 0)
    errors.push('At least one lesson name is required.');

  const total = Number(form.totalLessons);
  if (!form.totalLessons.trim() || !Number.isFinite(total) || total <= 0)
    errors.push('Total lessons must be a number greater than 0.');

  if (form.mode === 'permonth') {
    const perMonth = Number(form.lessonsPerMonth);
    if (
      !form.lessonsPerMonth.trim() ||
      !Number.isFinite(perMonth) ||
      perMonth <= 0
    )
      errors.push(
        'Lessons per month must be a number greater than 0 in Per month mode.',
      );
  }

  if (!form.startDate.trim()) {
    errors.push('Start date is required.');
  } else if (!isValidIsoDate(form.startDate.trim())) {
    // The date picker always emits valid dates, but ERPNext import can inject
    // arbitrary values — catch rollover dates before they shift silently.
    errors.push('Start date must be a real YYYY-MM-DD calendar date.');
  }

  if (!form.startTime.trim() || !form.endTime.trim()) {
    errors.push('Start time and end time are required.');
  } else if (form.endTime <= form.startTime) {
    // HH:mm strings compare lexically because they are zero-padded.
    errors.push('End time must be later than start time.');
  }

  return errors;
}

/** Validate the "calendar rules" inputs (holiday date formats). */
export function validateRules(form: RawForm): string[] {
  const errors: string[] = [];
  // Validate the DATE PART only; an optional ", name" may follow. Two tiers:
  // shape (YYYY-MM-DD) and reality (no 2026-02-30 rollover).
  for (const line of parseLines(form.uccHolidaysRaw)) {
    const { date } = parseHolidayLine(line);
    if (!DATE_PATTERN.test(date))
      errors.push(`UCC holiday "${line}" must start with a YYYY-MM-DD date.`);
    else if (!isValidIsoDate(date))
      errors.push(`UCC holiday "${line}" is not a real calendar date.`);
  }
  for (const line of parseLines(form.publicHolidaysRaw)) {
    const { date } = parseHolidayLine(line);
    if (!DATE_PATTERN.test(date))
      errors.push(`Public holiday "${line}" must start with a YYYY-MM-DD date.`);
    else if (!isValidIsoDate(date))
      errors.push(`Public holiday "${line}" is not a real calendar date.`);
  }
  return errors;
}

/**
 * Validate the whole form. Returns one message per failing rule (empty = valid).
 * The scheduler's "too many lessons for a month" error is surfaced separately
 * at generation time into the same message area.
 */
export function validateForm(form: RawForm, primaryLabel = 'Course name'): string[] {
  return [...validateDetails(form, primaryLabel), ...validateRules(form)];
}

/** Build a ClassGroupConfig from a validated form. */
export function buildConfig(form: RawForm): ClassGroupConfig {
  return {
    // Stable-enough id for a single-group pass; multi-group will assign real ids.
    id: form.classGroup.trim() || 'group',
    courseName: form.courseName.trim(),
    classGroup: form.classGroup.trim(),
    teacher: form.teacher.trim(),
    classroom: form.classroom.trim(),
    lessonNames: parseLines(form.lessonNamesRaw),
    // Aligned (blank-preserving) so activities stay paired to lesson lines.
    activities: parseAlignedLines(form.activitiesRaw),
    totalLessons: Number(form.totalLessons),
    lessonsPerMonth:
      form.mode === 'permonth' ? Number(form.lessonsPerMonth) : null,
    startDate: form.startDate,
    startTime: form.startTime,
    endTime: form.endTime,
  };
}

/** Build a HolidaySet (named) from a validated form. */
export function buildHolidays(form: RawForm): HolidaySet {
  return {
    uccHolidays: parseNamedHolidays(form.uccHolidaysRaw),
    publicHolidays: parseNamedHolidays(form.publicHolidaysRaw),
  };
}
