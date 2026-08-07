import type {
  Course,
  DeliveryMode,
  HolidaySet,
  Module,
  NamedHoliday,
} from './types';
import { isValidIsoDate } from './shared/dates';

/** Raw per-module form state — every field a string off the inputs. */
export interface ModuleForm {
  id: string;
  name: string;
  classGroup: string;
  teacher: string;
  classroom: string;
  moduleStartDate: string; // YYYY-MM-DD — the module's own scheduling window
  moduleEndDate: string; // YYYY-MM-DD
  lessonNamesRaw: string; // one per line
  activitiesRaw: string; // one per line, paired to lesson names by index
  totalLessons: string;
  startTime: string;
  endTime: string;
}

/** One row of a holiday table: date from a date picker, optional name. */
export interface HolidayRow {
  id: string;
  date: string; // YYYY-MM-DD (ISO) or '' for a blank row
  name: string;
}

/** Raw course form state: course-level fields plus one or more modules. */
export interface CourseForm {
  courseName: string;
  startMonth: string; // YYYY-MM
  deliveryMode: DeliveryMode;
  modules: ModuleForm[];
  uccHolidays: HolidayRow[];
  publicHolidays: HolidayRow[];
}

let rowSeq = 0;
/** Fresh blank holiday-table row with a unique id. */
export const emptyHolidayRow = (): HolidayRow => ({
  id: `hol-${++rowSeq}-${Math.random().toString(36).slice(2, 7)}`,
  date: '',
  name: '',
});

let moduleSeq = 0;
/** Fresh empty module row with a unique id. */
export const emptyModule = (): ModuleForm => ({
  id: `mod-${++moduleSeq}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  classGroup: '',
  teacher: '',
  classroom: '',
  moduleStartDate: '',
  moduleEndDate: '',
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
      moduleStartDate: '',
      moduleEndDate: '',
      lessonNamesRaw: '',
      activitiesRaw: '',
      totalLessons: '',
      startTime: '',
      endTime: '',
    },
  ],
  uccHolidays: [],
  publicHolidays: [],
};

// Demo course: two modules with their own scheduling windows. National Day
// 2026-08-09 falls on a Sunday, so 2026-08-10 (Monday) is auto-observed and
// blocked — module 2's window spans it, showing observed-holiday skipping. The
// windows and rooms don't overlap, so the demo generates cleanly; editing an
// entry to share a teacher + room + time on one date reveals the conflict rule.
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
      moduleStartDate: '2026-07-01',
      moduleEndDate: '2026-07-20',
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
      classroom: 'Room 3-02',
      moduleStartDate: '2026-07-21',
      moduleEndDate: '2026-08-14',
      lessonNamesRaw: ['Statistics', 'Visualisation', 'Modelling'].join('\n'),
      activitiesRaw: '',
      totalLessons: '10',
      startTime: '11:00',
      endTime: '12:00',
    },
  ],
  uccHolidays: [{ id: 'hol-demo-1', date: '2026-09-01', name: 'Term Break' }],
  publicHolidays: [
    { id: 'hol-demo-2', date: '2026-08-09', name: 'National Day' },
    { id: 'hol-demo-3', date: '2026-12-25', name: 'Christmas' },
  ],
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

  if (form.modules.length === 0) errors.push('Add at least one module.');

  form.modules.forEach((mod, i) => {
    const tag = form.modules.length > 1 ? `Module ${i + 1}: ` : '';

    if (form.modules.length > 1 && !mod.name.trim())
      errors.push(`${tag}module name is required.`);

    // Module Class Details, Teacher, and Classroom are all deliberately
    // unvalidated: some course types (AEIS Primary, say) genuinely have none
    // of them, and requiring them blocked generating a timetable at all.
    // Every view and export omits a blank one rather than printing filler.

    // Each module schedules within its own start/end window.
    const start = mod.moduleStartDate.trim();
    const end = mod.moduleEndDate.trim();
    if (!start || !end) {
      errors.push(`${tag}module start date and module end date are required.`);
    } else {
      if (!isValidIsoDate(start))
        errors.push(`${tag}module start date is not a real calendar date.`);
      if (!isValidIsoDate(end))
        errors.push(`${tag}module end date is not a real calendar date.`);
      if (isValidIsoDate(start) && isValidIsoDate(end) && end < start)
        errors.push(`${tag}module end date must be on or after the start date.`);
    }

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

/**
 * A holiday-table row is invalid only when it HAS a date that is not a real
 * calendar day (round-trip check catches 2026-02-30 rollover). Blank rows are
 * ignored everywhere. The same predicate drives per-row inline errors in the
 * table editor and the step-gate messages below.
 */
export const holidayRowInvalid = (row: HolidayRow): boolean =>
  row.date.trim() !== '' && !isValidIsoDate(row.date.trim());

/** Validate the "calendar rules" inputs (holiday tables). */
export function validateRules(form: CourseForm): string[] {
  const errors: string[] = [];
  form.uccHolidays.forEach((row, i) => {
    if (holidayRowInvalid(row))
      errors.push(
        `UCC holiday row ${i + 1} ("${row.date}") is not a real calendar date.`,
      );
  });
  form.publicHolidays.forEach((row, i) => {
    if (holidayRowInvalid(row))
      errors.push(
        `Public holiday row ${i + 1} ("${row.date}") is not a real calendar date.`,
      );
  });
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
    moduleStartDate: mod.moduleStartDate.trim(),
    moduleEndDate: mod.moduleEndDate.trim(),
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

/** Rows with a date become NamedHoliday entries; blank rows are ignored. */
const rowsToHolidays = (rows: HolidayRow[]): NamedHoliday[] =>
  rows
    .filter((r) => r.date.trim() !== '')
    .map((r) =>
      r.name.trim() ? { date: r.date.trim(), name: r.name.trim() } : { date: r.date.trim() },
    );

/** Build a HolidaySet (named) from a validated form — same shape as v3-v5. */
export function buildHolidays(form: CourseForm): HolidaySet {
  return {
    uccHolidays: rowsToHolidays(form.uccHolidays),
    publicHolidays: rowsToHolidays(form.publicHolidays),
  };
}
