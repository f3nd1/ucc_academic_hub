import { describe, it, expect } from 'vitest';
import {
  addMonthsClamped,
  addYearsClamped,
  moduleReviewDate,
  coursePerCycleDate,
  courseScheduledDate,
  computeCourse,
  isPositiveInt,
  moduleReviewErrors,
  courseReviewErrors,
  emptyModuleReview,
  emptyCourseReview,
  type ModuleReview,
  type CourseReview,
} from '../src/tools/review-planner/reviewModel';

const mod = (patch: Partial<ModuleReview>): ModuleReview => ({
  ...emptyModuleReview(),
  ...patch,
});
const course = (patch: Partial<CourseReview>): CourseReview => ({
  ...emptyCourseReview(),
  ...patch,
});

describe('addMonthsClamped (+1 month, month-end safe)', () => {
  it('adds a plain month', () => {
    expect(addMonthsClamped('2026-07-06', 1)).toBe('2026-08-06');
  });

  it('clamps to the last day when the target month is shorter', () => {
    // 31 Jan + 1 month -> Feb has 28 days in 2026 (non-leap)
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
    // 31 Aug + 1 month -> Sep has 30 days
    expect(addMonthsClamped('2026-08-31', 1)).toBe('2026-09-30');
  });

  it('clamps to 29 Feb in a leap year', () => {
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('rolls over the year boundary', () => {
    expect(addMonthsClamped('2026-12-15', 1)).toBe('2027-01-15');
  });

  it('returns blank for a missing or invalid date', () => {
    expect(addMonthsClamped('', 1)).toBe('');
    expect(addMonthsClamped('2026-02-30', 1)).toBe('');
  });

  it('never shifts the day via a UTC round-trip (Singapore UTC+8)', () => {
    // A naive toISOString() would push 01 Jul back to 30 Jun.
    expect(addMonthsClamped('2026-07-01', 1)).toBe('2026-08-01');
  });
});

describe('addYearsClamped (+2 years)', () => {
  it('adds two years', () => {
    expect(addYearsClamped('2026-07-06', 2)).toBe('2028-07-06');
  });

  it('clamps a leap day to 28 Feb two years later', () => {
    expect(addYearsClamped('2028-02-29', 2)).toBe('2030-02-28');
  });
});

describe('moduleReviewDate', () => {
  it('is the actual start + 1 month', () => {
    expect(moduleReviewDate(mod({ actualStartDate: '2026-08-31' }))).toBe(
      '2026-09-30',
    );
  });
  it('is blank without an actual start', () => {
    expect(moduleReviewDate(mod({ actualStartDate: '' }))).toBe('');
  });
});

describe('coursePerCycleDate', () => {
  it('takes the latest module review date among matching modules', () => {
    const modules = [
      mod({ courseName: 'Data Science', actualStartDate: '2026-07-06' }), // review 2026-08-06
      mod({ courseName: 'Data Science', actualStartDate: '2026-08-31' }), // review 2026-09-30 (latest)
    ];
    const res = coursePerCycleDate(course({ courseName: 'Data Science' }), modules);
    expect(res).toEqual({ date: '2026-09-30', auto: true, hasMatchingModules: true });
  });

  it('matches course names case-insensitively and trimmed', () => {
    const modules = [mod({ courseName: '  data science ', actualStartDate: '2026-07-06' })];
    const res = coursePerCycleDate(course({ courseName: 'DATA SCIENCE' }), modules);
    expect(res.date).toBe('2026-08-06');
    expect(res.auto).toBe(true);
  });

  it('falls back to the manual date when there are no matching modules', () => {
    const modules = [mod({ courseName: 'Other', actualStartDate: '2026-07-06' })];
    const res = coursePerCycleDate(
      course({ courseName: 'Data Science', manualPerCycleReviewDate: '2026-10-01' }),
      modules,
    );
    expect(res).toEqual({ date: '2026-10-01', auto: false, hasMatchingModules: false });
  });

  it('is blank (auto) when matching modules exist but none has an actual start', () => {
    const modules = [mod({ courseName: 'Data Science', actualStartDate: '' })];
    const res = coursePerCycleDate(
      course({ courseName: 'Data Science', manualPerCycleReviewDate: '2026-10-01' }),
      modules,
    );
    // Matching modules disable the manual field, so the manual value is ignored.
    expect(res).toEqual({ date: '', auto: true, hasMatchingModules: true });
  });

  it('ignores an invalid manual date', () => {
    const res = coursePerCycleDate(
      course({ courseName: 'Solo', manualPerCycleReviewDate: '2026-13-40' }),
      [],
    );
    expect(res.date).toBe('');
  });
});

describe('courseScheduledDate and computeCourse', () => {
  it('is the per cycle date + 2 years', () => {
    expect(courseScheduledDate('2026-09-30')).toBe('2028-09-30');
    expect(courseScheduledDate('')).toBe('');
  });

  it('computeCourse chains per cycle -> scheduled live', () => {
    const modules = [
      mod({ courseName: 'X', actualStartDate: '2026-08-31' }), // review 2026-09-30
    ];
    const res = computeCourse(course({ courseName: 'X' }), modules);
    expect(res.perCycle.date).toBe('2026-09-30');
    expect(res.scheduled).toBe('2028-09-30');
  });
});

describe('validation', () => {
  it('isPositiveInt only accepts whole positive numbers', () => {
    expect(isPositiveInt('3')).toBe(true);
    expect(isPositiveInt('0')).toBe(false);
    expect(isPositiveInt('-2')).toBe(false);
    expect(isPositiveInt('2.5')).toBe(false);
    expect(isPositiveInt('')).toBe(false);
  });

  it('module errors flag empty names', () => {
    const errs = moduleReviewErrors(mod({ courseName: '', moduleName: '' }));
    expect(errs).toContain('Course name is required.');
    expect(errs).toContain('Module name is required.');
  });

  it('course errors flag a non-positive module count and bad dates', () => {
    const errs = courseReviewErrors(
      course({ courseName: 'X', numberOfModules: '0', plannedStartDate: '2026-02-30' }),
    );
    expect(errs).toContain('Number of modules must be a whole number greater than 0.');
    expect(errs).toContain('Planned start is not a real date.');
  });

  it('a fully valid module and course produce no errors', () => {
    expect(
      moduleReviewErrors(
        mod({ courseName: 'X', moduleName: 'M', actualStartDate: '2026-07-01' }),
      ),
    ).toEqual([]);
    expect(
      courseReviewErrors(course({ courseName: 'X', numberOfModules: '2' })),
    ).toEqual([]);
  });
});
