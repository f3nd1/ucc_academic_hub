import { describe, it, expect } from 'vitest';
import {
  EMPTY_FORM,
  parseLines,
  parseAlignedLines,
  holidayRowInvalid,
  validateDetails,
  validateRules,
  validateForm,
  buildCourse,
  buildHolidays,
  type CourseForm,
  type HolidayRow,
  type ModuleForm,
} from '../src/formModel';

const row = (date: string, name = '', id = `r-${date || 'blank'}-${name}`): HolidayRow => ({
  id,
  date,
  name,
});

const VALID_MODULE: ModuleForm = {
  id: 'm1',
  name: 'Module One',
  classGroup: 'CG-1',
  teacher: 'Ms Tan',
  classroom: 'R1',
  moduleStartDate: '2026-07-01',
  moduleEndDate: '2026-07-31',
  lessonNamesRaw: 'L1\nL2',
  activitiesRaw: '',
  totalLessons: '4',
  startTime: '09:00',
  endTime: '10:00',
};

/** A minimal course form that passes every validation rule. */
const VALID: CourseForm = {
  ...EMPTY_FORM,
  courseName: 'Course',
  startMonth: '2026-07',
  deliveryMode: 'series',
  modules: [VALID_MODULE],
};

const withModule = (patch: Partial<ModuleForm>): CourseForm => ({
  ...VALID,
  modules: [{ ...VALID_MODULE, ...patch }],
});

describe('parseLines / parseAlignedLines', () => {
  it('parseLines drops blank lines', () => {
    expect(parseLines('a\n\nb\n')).toEqual(['a', 'b']);
  });
  it('parseAlignedLines preserves interior blanks, trims trailing', () => {
    expect(parseAlignedLines('a\n\nb\n\n')).toEqual(['a', '', 'b']);
    expect(parseAlignedLines('')).toEqual([]);
    expect(parseAlignedLines('  x  \n')).toEqual(['x']);
  });
});

describe('holidayRowInvalid', () => {
  it('a real date is valid; blank rows are never invalid', () => {
    expect(holidayRowInvalid(row('2026-08-09'))).toBe(false);
    expect(holidayRowInvalid(row(''))).toBe(false);
  });
  it('rollover and malformed dates are invalid', () => {
    expect(holidayRowInvalid(row('2026-02-30'))).toBe(true);
    expect(holidayRowInvalid(row('not-a-date'))).toBe(true);
  });
});

describe('validateDetails (course + modules)', () => {
  it('valid form has no errors', () => {
    expect(validateDetails(VALID)).toEqual([]);
  });
  it('uses the scope primary label in the message', () => {
    const errs = validateDetails({ ...VALID, courseName: '' }, 'Module name');
    expect(errs).toContain('Module name is required.');
  });
  it('requires each module start and end date, and start <= end', () => {
    expect(
      validateDetails(withModule({ moduleStartDate: '', moduleEndDate: '' })),
    ).toContain('module start date and module end date are required.');
    expect(
      validateDetails(withModule({ moduleStartDate: '2026-02-30' })),
    ).toContain('module start date is not a real calendar date.');
    expect(
      validateDetails(
        withModule({ moduleStartDate: '2026-07-31', moduleEndDate: '2026-07-01' }),
      ),
    ).toContain('module end date must be on or after the start date.');
  });
  it('requires at least one module', () => {
    expect(validateDetails({ ...VALID, modules: [] })).toContain(
      'Add at least one module.',
    );
  });
  it.each([
    ['', 'missing'],
    ['0', 'zero'],
    ['20.5', 'fractional'],
    ['abc', 'non-numeric'],
  ])('rejects totalLessons %s (%s)', (value) => {
    const errs = validateDetails(withModule({ totalLessons: value }));
    expect(errs).toContain('total lessons must be a whole number greater than 0.');
  });
  it('rejects end time not after start time', () => {
    expect(validateDetails(withModule({ endTime: '09:00' }))).toContain(
      'end time must be later than start time.',
    );
  });
  it('single module does not need its own name; multiple do, tagged', () => {
    expect(validateDetails(withModule({ name: '' }))).toEqual([]);
    const errs = validateDetails({
      ...VALID,
      modules: [VALID_MODULE, { ...VALID_MODULE, id: 'm2', name: '' }],
    });
    expect(errs).toContain('Module 2: module name is required.');
  });
});

describe('validateRules (holiday tables)', () => {
  it('accepts named, unnamed, and blank rows', () => {
    expect(
      validateRules({
        ...VALID,
        uccHolidays: [row('2026-09-01', 'Term Break'), row('')],
        publicHolidays: [row('2026-08-09')],
      }),
    ).toEqual([]);
  });
  it('flags a rollover date naming its row', () => {
    const errs = validateRules({
      ...VALID,
      publicHolidays: [row('2026-08-09'), row('2026-02-30')],
    });
    expect(errs).toHaveLength(1);
    expect(errs[0]).toContain('row 2');
    expect(errs[0]).toContain('not a real calendar date');
  });
});

describe('buildCourse', () => {
  it('keeps activities aligned to lesson names across blank lines', () => {
    const course = buildCourse(
      withModule({
        lessonNamesRaw: 'L1\nL2\nL3',
        activitiesRaw: 'Listening\n\nWriting',
      }),
    );
    expect(course.modules[0].lessonNames).toEqual(['L1', 'L2', 'L3']);
    expect(course.modules[0].activities).toEqual(['Listening', '', 'Writing']);
  });
  it('a lone unnamed module takes the course name (per-module scope)', () => {
    const course = buildCourse(withModule({ name: '' }));
    expect(course.modules[0].name).toBe('Course');
  });
  it('carries start month and delivery mode', () => {
    const course = buildCourse({ ...VALID, deliveryMode: 'parallel' });
    expect(course.startMonth).toBe('2026-07');
    expect(course.deliveryMode).toBe('parallel');
  });
});

describe('buildHolidays / validateForm', () => {
  it('builds the same NamedHoliday[] shape as before, skipping blank rows', () => {
    const h = buildHolidays({
      ...VALID,
      publicHolidays: [
        row('2026-08-09', 'National Day'),
        row(''), // blank row is ignored
        row('2026-12-25'),
      ],
    });
    expect(h.publicHolidays).toEqual([
      { date: '2026-08-09', name: 'National Day' },
      { date: '2026-12-25' },
    ]);
  });
  it('validateForm combines details and rules', () => {
    const errs = validateForm(
      { ...VALID, courseName: '', uccHolidays: [row('2026-02-30')] },
      'Course name',
    );
    expect(errs.length).toBe(2);
  });
});
