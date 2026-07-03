import { describe, it, expect } from 'vitest';
import {
  EMPTY_FORM,
  parseLines,
  parseAlignedLines,
  parseHolidayLine,
  parseNamedHolidays,
  validateDetails,
  validateRules,
  validateForm,
  buildCourse,
  buildHolidays,
  type CourseForm,
  type ModuleForm,
} from '../src/formModel';

const VALID_MODULE: ModuleForm = {
  id: 'm1',
  name: 'Module One',
  classGroup: 'CG-1',
  teacher: 'Ms Tan',
  classroom: 'R1',
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

describe('parseHolidayLine / parseNamedHolidays', () => {
  it('date only', () => {
    expect(parseHolidayLine('2026-08-09')).toEqual({ date: '2026-08-09' });
  });
  it('date with name', () => {
    expect(parseHolidayLine('2026-08-09, National Day')).toEqual({
      date: '2026-08-09',
      name: 'National Day',
    });
  });
  it('only the first comma splits; the name may contain commas', () => {
    expect(parseHolidayLine('2026-12-25, Christmas, observed')).toEqual({
      date: '2026-12-25',
      name: 'Christmas, observed',
    });
  });
  it('parses a textarea of mixed lines', () => {
    expect(parseNamedHolidays('2026-08-09, National Day\n2026-12-25')).toEqual([
      { date: '2026-08-09', name: 'National Day' },
      { date: '2026-12-25' },
    ]);
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
  it('requires a start month and rejects impossible months', () => {
    expect(validateDetails({ ...VALID, startMonth: '' })).toContain(
      'Start month is required.',
    );
    expect(validateDetails({ ...VALID, startMonth: '2026-13' })).toContain(
      'Start month must be a real YYYY-MM month.',
    );
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

describe('validateRules', () => {
  it('accepts named and unnamed holidays', () => {
    expect(
      validateRules({
        ...VALID,
        uccHolidaysRaw: '2026-09-01, Term Break',
        publicHolidaysRaw: '2026-08-09',
      }),
    ).toEqual([]);
  });
  it('rejects a badly-shaped date, naming the line', () => {
    const errs = validateRules({ ...VALID, uccHolidaysRaw: 'Sept 1' });
    expect(errs[0]).toContain('"Sept 1"');
  });
  it('rejects a rollover date that matches the shape', () => {
    const errs = validateRules({ ...VALID, publicHolidaysRaw: '2026-02-30' });
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
  it('builds named holiday sets', () => {
    const h = buildHolidays({
      ...VALID,
      publicHolidaysRaw: '2026-08-09, National Day',
    });
    expect(h.publicHolidays).toEqual([
      { date: '2026-08-09', name: 'National Day' },
    ]);
  });
  it('validateForm combines details and rules', () => {
    const errs = validateForm(
      { ...VALID, courseName: '', uccHolidaysRaw: 'bad' },
      'Course name',
    );
    expect(errs.length).toBe(2);
  });
});
