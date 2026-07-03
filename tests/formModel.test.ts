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
  buildConfig,
  buildHolidays,
  type RawForm,
} from '../src/formModel';

/** A minimal form that passes every validation rule. */
const VALID: RawForm = {
  ...EMPTY_FORM,
  courseName: 'Course',
  classGroup: 'CG-1',
  teacher: 'Ms Tan',
  classroom: 'R1',
  lessonNamesRaw: 'L1\nL2',
  totalLessons: '4',
  mode: 'weekday',
  startDate: '2026-07-06',
  startTime: '09:00',
  endTime: '10:00',
};

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
  it('trailing comma with no name is treated as unnamed', () => {
    expect(parseHolidayLine('2026-08-09,')).toEqual({ date: '2026-08-09' });
  });
  it('parses a textarea of mixed lines', () => {
    expect(parseNamedHolidays('2026-08-09, National Day\n2026-12-25')).toEqual([
      { date: '2026-08-09', name: 'National Day' },
      { date: '2026-12-25' },
    ]);
  });
});

describe('validateDetails', () => {
  it('valid form has no errors', () => {
    expect(validateDetails(VALID)).toEqual([]);
  });
  it('uses the scope primary label in the message', () => {
    const errs = validateDetails({ ...VALID, courseName: '' }, 'Module name');
    expect(errs).toContain('Module name is required.');
  });
  it.each([
    ['', 'missing'],
    ['0', 'zero'],
    ['-3', 'negative'],
    ['20.5', 'fractional'],
    ['abc', 'non-numeric'],
  ])('rejects totalLessons %s (%s)', (value) => {
    const errs = validateDetails({ ...VALID, totalLessons: value });
    expect(errs).toContain('Total lessons must be a whole number greater than 0.');
  });
  it('requires whole lessons per month in permonth mode', () => {
    const errs = validateDetails({
      ...VALID,
      mode: 'permonth',
      lessonsPerMonth: '2.5',
    });
    expect(errs).toContain(
      'Lessons per month must be a whole number greater than 0 in Per month mode.',
    );
  });
  it('rejects end time not after start time', () => {
    expect(validateDetails({ ...VALID, endTime: '09:00' })).toContain(
      'End time must be later than start time.',
    );
    expect(validateDetails({ ...VALID, endTime: '08:00' })).toContain(
      'End time must be later than start time.',
    );
  });
  it('rejects a rollover start date (ERPNext can inject one)', () => {
    expect(validateDetails({ ...VALID, startDate: '2026-02-30' })).toContain(
      'Start date must be a real YYYY-MM-DD calendar date.',
    );
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
    expect(errs[0]).toContain('YYYY-MM-DD');
  });
  it('rejects a rollover date that matches the shape', () => {
    const errs = validateRules({ ...VALID, publicHolidaysRaw: '2026-02-30' });
    expect(errs[0]).toContain('not a real calendar date');
  });
});

describe('buildConfig', () => {
  it('keeps activities aligned to lesson names across blank lines', () => {
    const cfg = buildConfig({
      ...VALID,
      lessonNamesRaw: 'L1\nL2\nL3',
      activitiesRaw: 'Listening\n\nWriting',
    });
    expect(cfg.lessonNames).toEqual(['L1', 'L2', 'L3']);
    expect(cfg.activities).toEqual(['Listening', '', 'Writing']);
  });
  it('permonth mode carries lessonsPerMonth; weekday mode is null', () => {
    expect(
      buildConfig({ ...VALID, mode: 'permonth', lessonsPerMonth: '8' })
        .lessonsPerMonth,
    ).toBe(8);
    expect(buildConfig(VALID).lessonsPerMonth).toBeNull();
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
