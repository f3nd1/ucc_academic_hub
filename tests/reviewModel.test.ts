import { describe, it, expect } from 'vitest';
import {
  addMonthsClamped,
  addYearsClamped,
  moduleReviewDate,
  coursePerCycleDate,
  courseRollupStart,
  courseScheduledDate,
  computeCourse,
  sortModuleRows,
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

describe('courseRollupStart (earliest matching module date, else manual)', () => {
  it('rolls up the EARLIEST planned start among matching modules', () => {
    const modules = [
      mod({ courseName: 'X', plannedStartDate: '2026-09-01' }),
      mod({ courseName: 'X', plannedStartDate: '2026-07-01' }), // earliest
      mod({ courseName: 'X', plannedStartDate: '2026-08-01' }),
    ];
    const res = courseRollupStart(course({ courseName: 'X' }), modules, 'plannedStartDate');
    expect(res).toEqual({ date: '2026-07-01', auto: true, hasMatchingModules: true });
  });

  it('rolls up the earliest actual start, matching name case-insensitively', () => {
    const modules = [
      mod({ courseName: ' data science ', actualStartDate: '2026-08-31' }),
      mod({ courseName: 'DATA SCIENCE', actualStartDate: '2026-07-06' }), // earliest
    ];
    const res = courseRollupStart(course({ courseName: 'Data Science' }), modules, 'actualStartDate');
    expect(res.date).toBe('2026-07-06');
    expect(res.auto).toBe(true);
  });

  it('falls back to the course manual field when no modules match', () => {
    const res = courseRollupStart(
      course({ courseName: 'Solo', plannedStartDate: '2026-05-04' }),
      [mod({ courseName: 'Other', plannedStartDate: '2026-01-01' })],
      'plannedStartDate',
    );
    expect(res).toEqual({ date: '2026-05-04', auto: false, hasMatchingModules: false });
  });

  it('is auto+blank when matching modules exist but have no dates', () => {
    const res = courseRollupStart(
      course({ courseName: 'X', plannedStartDate: '2026-05-04' }),
      [mod({ courseName: 'X', plannedStartDate: '' })],
      'plannedStartDate',
    );
    // Matching modules make the field read-only, so the manual value is ignored.
    expect(res).toEqual({ date: '', auto: true, hasMatchingModules: true });
  });
});

describe('computeCourse exposes all four course dates', () => {
  it('rolls up planned/actual/perCycle and derives scheduled together', () => {
    const modules = [
      mod({ courseName: 'X', plannedStartDate: '2026-07-01', actualStartDate: '2026-07-06' }), // review 2026-08-06
      mod({ courseName: 'X', plannedStartDate: '2026-08-01', actualStartDate: '2026-08-31' }), // review 2026-09-30
    ];
    const res = computeCourse(course({ courseName: 'X' }), modules);
    expect(res.plannedStart.date).toBe('2026-07-01'); // earliest planned
    expect(res.actualStart.date).toBe('2026-07-06'); // earliest actual
    expect(res.perCycle.date).toBe('2026-09-30'); // latest review
    expect(res.scheduled).toBe('2028-09-30'); // +2 years
  });
});

describe('sortModuleRows', () => {
  const rows = [
    mod({ courseName: 'Beta', moduleName: 'm', plannedStartDate: '2026-08-01' }),
    mod({ courseName: 'alpha', moduleName: 'm', plannedStartDate: '2026-07-01' }),
    mod({ courseName: 'Gamma', moduleName: 'm', plannedStartDate: '' }),
  ];

  it('returns the source unchanged when no sort is set', () => {
    expect(sortModuleRows(rows, null)).toBe(rows);
  });

  it('sorts text case-insensitively ascending, and does not mutate the source', () => {
    const out = sortModuleRows(rows, { field: 'courseName', dir: 'asc' });
    expect(out.map((r) => r.courseName)).toEqual(['alpha', 'Beta', 'Gamma']);
    expect(rows.map((r) => r.courseName)).toEqual(['Beta', 'alpha', 'Gamma']); // untouched
  });

  it('reverses on descending', () => {
    const out = sortModuleRows(rows, { field: 'courseName', dir: 'desc' });
    expect(out.map((r) => r.courseName)).toEqual(['Gamma', 'Beta', 'alpha']);
  });

  it('sorts dates chronologically, not by string', () => {
    const dated = [
      mod({ plannedStartDate: '2026-12-01' }),
      mod({ plannedStartDate: '2026-02-28' }),
      mod({ plannedStartDate: '2026-09-05' }),
    ];
    const out = sortModuleRows(dated, { field: 'plannedStartDate', dir: 'asc' });
    expect(out.map((r) => r.plannedStartDate)).toEqual([
      '2026-02-28',
      '2026-09-05',
      '2026-12-01',
    ]);
  });

  it('sends empty values to the end in ascending order', () => {
    const out = sortModuleRows(rows, { field: 'plannedStartDate', dir: 'asc' });
    expect(out.map((r) => r.plannedStartDate)).toEqual(['2026-07-01', '2026-08-01', '']);
  });

  it('keeps empty values at the end in descending order too', () => {
    const out = sortModuleRows(rows, { field: 'plannedStartDate', dir: 'desc' });
    expect(out.map((r) => r.plannedStartDate)).toEqual(['2026-08-01', '2026-07-01', '']);
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
