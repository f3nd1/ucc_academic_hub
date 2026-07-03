import type { ClassGroupConfig, HolidaySet } from './types';
import { DATE_PATTERN } from './dateUtils';

export type SchedulingMode = 'weekday' | 'permonth';

/** Raw form state — every field is a string as it comes off the inputs. */
export interface RawForm {
  courseName: string;
  classGroup: string;
  teacher: string;
  classroom: string;
  lessonNamesRaw: string; // one per line
  totalLessons: string;
  mode: SchedulingMode;
  lessonsPerMonth: string; // used only in per-month mode
  startDate: string;
  startTime: string;
  endTime: string;
  uccHolidaysRaw: string; // one per line
  publicHolidaysRaw: string; // one per line
}

export const EMPTY_FORM: RawForm = {
  courseName: '',
  classGroup: '',
  teacher: '',
  classroom: '',
  lessonNamesRaw: '',
  totalLessons: '',
  mode: 'weekday',
  lessonsPerMonth: '',
  startDate: '',
  startTime: '',
  endTime: '',
  uccHolidaysRaw: '',
  publicHolidaysRaw: '',
};

// Demo data the form starts with, so the app is testable in one click: hit
// "Generate timetable" and you get the acceptance-criteria result (20 sessions,
// no weekends, skipping the two public holidays). Use the "Clear" button to
// start from EMPTY_FORM.
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
  totalLessons: '20',
  mode: 'weekday',
  lessonsPerMonth: '8',
  startDate: '2026-07-06',
  startTime: '09:00',
  endTime: '10:00',
  uccHolidaysRaw: '2026-09-01',
  publicHolidaysRaw: ['2026-08-09', '2026-12-25'].join('\n'),
};

/** Split a textarea into trimmed, non-empty lines. */
export const parseLines = (raw: string): string[] =>
  raw
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

/**
 * Validate the form. Returns one message per failing rule (empty = valid).
 * The scheduler's "too many lessons for a month" error is surfaced separately
 * at generation time into the same message area.
 */
export function validateForm(form: RawForm): string[] {
  const errors: string[] = [];

  if (!form.courseName.trim()) errors.push('Course name is required.');
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

  if (!form.startDate.trim()) errors.push('Start date is required.');

  if (!form.startTime.trim() || !form.endTime.trim()) {
    errors.push('Start time and end time are required.');
  } else if (form.endTime <= form.startTime) {
    // HH:mm strings compare lexically because they are zero-padded.
    errors.push('End time must be later than start time.');
  }

  for (const value of parseLines(form.uccHolidaysRaw)) {
    if (!DATE_PATTERN.test(value))
      errors.push(`UCC holiday "${value}" must be in YYYY-MM-DD format.`);
  }
  for (const value of parseLines(form.publicHolidaysRaw)) {
    if (!DATE_PATTERN.test(value))
      errors.push(`Public holiday "${value}" must be in YYYY-MM-DD format.`);
  }

  return errors;
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
    totalLessons: Number(form.totalLessons),
    lessonsPerMonth:
      form.mode === 'permonth' ? Number(form.lessonsPerMonth) : null,
    startDate: form.startDate,
    startTime: form.startTime,
    endTime: form.endTime,
  };
}

/** Build a HolidaySet from a validated form. */
export function buildHolidays(form: RawForm): HolidaySet {
  return {
    uccHolidays: parseLines(form.uccHolidaysRaw),
    publicHolidays: parseLines(form.publicHolidaysRaw),
  };
}
