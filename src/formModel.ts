import type {
  Course,
  DeliveryMode,
  HolidaySet,
  Module,
  NamedHoliday,
} from './types';
import {
  DATE_PATTERN,
  isValidIsoDate,
  isValidIsoMonth,
} from './dateUtils';

/** Raw per-module form state — every field a string off the inputs. */
export interface ModuleForm {
  id: string;
  name: string;
  classGroup: string;
  teacher: string;
  classroom: string;
  lessonNamesRaw: string; // one per line
  activitiesRaw: string; // one per line, paired to lesson names by index
  totalLessons: string;
  startTime: string;
  endTime: string;
}

/** Raw course form state: course-level fields plus one or more modules. */
export interface CourseForm {
  courseName: string;
  startMonth: string; // YYYY-MM
  deliveryMode: DeliveryMode;
  modules: ModuleForm[];
  uccHolidaysRaw: string; // one per line: "YYYY-MM-DD" or "YYYY-MM-DD, name"
  publicHolidaysRaw: string; // one per line
}

let moduleSeq = 0;
/** Fresh empty module row with a unique id. */
export const emptyModule = (): ModuleForm => ({
  id: `mod-${++moduleSeq}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  classGroup: '',
  teacher: '',
  classroom: '',
  lessonNamesRaw: '',
  activitiesRaw: '',
  totalLessons: '',
  startTime: '',
  endTime: '',
});

export const EMPTY_FORM: CourseForm = {
  courseName: '',
  startMonth: '',
  deliveryMode: 'series',
  modules: [
    {
      id: 'mod-initial',
      name: '',
      classGroup: '',
      teacher: '',
      classroom: '',
      lessonNamesRaw: '',
      activitiesRaw: '',
      totalLessons: '',
      startTime: '',
      endTime: '',
    },
  ],
  uccHolidaysRaw: '',
  publicHolidaysRaw: '',
};

// Demo course: two modules sharing a class group and classroom. Series mode
// runs them cleanly month after month; switching to Parallel makes their
// overlapping time ranges clash on classroom + class group — demonstrating
// the conflict panel and highlighting in two clicks.
export const DEMO_FORM: CourseForm = {
  courseName: 'Foundations of Data Science',
  startMonth: '2026-07',
  deliveryMode: 'series',
  modules: [
    {
      id: 'mod-demo-1',
      name: 'Data Fundamentals',
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
      activitiesRaw: ['Listening', 'Reading', 'Writing', 'Speaking', 'Grammar'].join('\n'),
      totalLessons: '12',
      startTime: '09:00',
      endTime: '10:00',
    },
    {
      id: 'mod-demo-2',
      name: 'Applied Analytics',
      classGroup: 'DS-2026A',
      teacher: 'Mr Lim',
      classroom: 'Room 3-01',
      lessonNamesRaw: ['Statistics', 'Visualisation', 'Modelling'].join('\n'),
      activitiesRaw: '',
      totalLessons: '10',
      startTime: '09:30',
      endTime: '10:30',
    },
  ],
  uccHolidaysRaw: '2026-09-01, Term Break',
  publicHolidaysRaw: ['2026-08-09, National Day', '2026-12-25, Christmas'].join('\n'),
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
 * Validate the "details" inputs (course + modules; holidays live in rules).
 * `primaryLabel` names the primary field per the chosen scope. When a single
 * module is edited (module/class-group scope) its name is taken from the
 * primary field, so the per-module name is only required with multiple rows.
 */
export function validateDetails(
  form: CourseForm,
  primaryLabel = 'Course name',
): string[] {
  const errors: string[] = [];

  if (!form.courseName.trim()) errors.push(`${primaryLabel} is required.`);

  if (!form.startMonth.trim()) {
    errors.push('Start month is required.');
  } else if (!isValidIsoMonth(form.startMonth.trim())) {
    errors.push('Start month must be a real YYYY-MM month.');
  }

  if (form.modules.length === 0) errors.push('Add at least one module.');

  form.modules.forEach((mod, i) => {
    const tag = form.modules.length > 1 ? `Module ${i + 1}: ` : '';

    if (form.modules.length > 1 && !mod.name.trim())
      errors.push(`${tag}module name is required.`);
    if (!mod.classGroup.trim()) errors.push(`${tag}class group is required.`);

    if (parseLines(mod.lessonNamesRaw).length === 0)
      errors.push(`${tag}at least one lesson name is required.`);

    const total = Number(mod.totalLessons);
    if (!mod.totalLessons.trim() || !Number.isInteger(total) || total <= 0)
      errors.push(`${tag}total lessons must be a whole number greater than 0.`);

    if (!mod.startTime.trim() || !mod.endTime.trim()) {
      errors.push(`${tag}start time and end time are required.`);
    } else if (mod.endTime <= mod.startTime) {
      // HH:mm strings compare lexically because they are zero-padded.
      errors.push(`${tag}end time must be later than start time.`);
    }
  });

  return errors;
}

/** Validate the "calendar rules" inputs (holiday date formats). */
export function validateRules(form: CourseForm): string[] {
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

/** Validate the whole form. Returns one message per failing rule. */
export function validateForm(
  form: CourseForm,
  primaryLabel = 'Course name',
): string[] {
  return [...validateDetails(form, primaryLabel), ...validateRules(form)];
}

/** Build a Module from a validated module row. */
function buildModule(mod: ModuleForm, fallbackName: string): Module {
  return {
    id: mod.id,
    name: mod.name.trim() || fallbackName,
    classGroup: mod.classGroup.trim(),
    teacher: mod.teacher.trim(),
    classroom: mod.classroom.trim(),
    lessonNames: parseLines(mod.lessonNamesRaw),
    // Aligned (blank-preserving) so activities stay paired to lesson lines.
    activities: parseAlignedLines(mod.activitiesRaw),
    totalLessons: Number(mod.totalLessons),
    startTime: mod.startTime,
    endTime: mod.endTime,
  };
}

/** Build a Course from a validated form. */
export function buildCourse(form: CourseForm): Course {
  return {
    name: form.courseName.trim(),
    startMonth: form.startMonth.trim(),
    deliveryMode: form.deliveryMode,
    // A lone module without its own name takes the primary (course) name —
    // that is the "Per module" scope where one field names both.
    modules: form.modules.map((m) => buildModule(m, form.courseName.trim())),
  };
}

/** Build a HolidaySet (named) from a validated form. */
export function buildHolidays(form: CourseForm): HolidaySet {
  return {
    uccHolidays: parseNamedHolidays(form.uccHolidaysRaw),
    publicHolidays: parseNamedHolidays(form.publicHolidaysRaw),
  };
}
