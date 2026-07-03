import { describe, it, expect } from 'vitest';
import {
  buildPlanner,
  activityText,
  dateText,
  teacherLines,
  type PlannerCell,
} from '../src/planner';
import { generateSchedule } from '../src/scheduler';
import type { ClassGroupConfig, Course, HolidaySet } from '../src/types';

const CONFIG: ClassGroupConfig = {
  id: 'g1',
  courseName: 'Course X',
  classGroup: 'CG-1',
  teacher: 'Ms Tan',
  classroom: 'R1',
  lessonNames: ['L1', 'L2'],
  activities: ['Listening', 'Reading'],
  totalLessons: 6,
  lessonsPerMonth: null,
  startDate: '2026-07-06',
  startTime: '09:00',
  endTime: '10:00',
};

const COURSE: Course = {
  name: 'Course X',
  startMonth: '2026-07',
  deliveryMode: 'series',
  modules: [
    {
      id: 'g1',
      name: 'Course X',
      teacher: 'Ms Tan',
      classroom: 'R1',
      classGroup: 'CG-1',
      lessonNames: ['L1', 'L2'],
      activities: ['Listening', 'Reading'],
      totalLessons: 6,
      startTime: '09:00',
      endTime: '10:00',
    },
  ],
};

const HOLIDAYS: HolidaySet = {
  uccHolidays: [{ date: '2026-07-15', name: 'Term Break' }],
  publicHolidays: [{ date: '2026-07-10', name: 'Some PH' }],
};

/** Find the cell for an ISO date anywhere in the planner. */
function cellFor(
  model: ReturnType<typeof buildPlanner>,
  iso: string,
): PlannerCell | undefined {
  for (const m of model.months) {
    for (const row of m.grid) {
      for (const cell of row) {
        if (cell.dateIso === iso) return cell;
      }
    }
  }
  return undefined;
}

describe('buildPlanner structure', () => {
  const lessons = generateSchedule(CONFIG, HOLIDAYS);
  const model = buildPlanner(lessons, COURSE, HOLIDAYS, 'monday', '2026-07-03');

  it('carries the scope label, course, timing, and display Updated date', () => {
    expect(model.scopeLabel).toBe('Course');
    expect(model.course).toBe('Course X');
    expect(model.timing).toBe('09:00 to 10:00');
    expect(model.updatedDisplay).toBe('03 July 2026');
  });

  it('weekday rows follow Monday-first ordering', () => {
    expect(model.weekdayLabels[0]).toBe('Monday');
    expect(model.weekdayLabels[6]).toBe('Sunday');
  });

  it('covers only the months containing lessons', () => {
    expect(model.months).toHaveLength(1);
    expect(model.months[0].monthName).toBe('July');
    expect(model.months[0].year).toBe(2026);
  });

  it('every grid is 7 rows by the declared week count', () => {
    for (const m of model.months) {
      expect(m.grid).toHaveLength(7);
      for (const row of m.grid) expect(row).toHaveLength(m.weeks);
    }
  });

  it('places each date in the correct weekday row and week column', () => {
    const m = model.months[0];
    // July 2026 starts on a Wednesday. Monday-first: lead = 2,
    // so 2026-07-06 (Monday) is cellIndex 2 + 5 = 7 → week 1, row 0.
    const mondayRow = m.grid[0];
    expect(mondayRow[1].dateIso).toBe('2026-07-06');
    // 2026-07-01 (Wednesday) → week 0, row 2.
    expect(m.grid[2][0].dateIso).toBe('2026-07-01');
  });
});

describe('cell classification', () => {
  const lessons = generateSchedule(CONFIG, HOLIDAYS);
  const model = buildPlanner(lessons, COURSE, HOLIDAYS, 'monday', '2026-07-03');

  it('teaching cell carries activity, lesson label, and teacher', () => {
    const cell = cellFor(model, '2026-07-06')!;
    expect(cell.kind).toBe('teaching');
    expect(cell.activity).toBe('Listening');
    expect(cell.lessonName).toBe('L1');
    expect(cell.teacher).toBe('Ms Tan');
    expect(dateText(cell)).toBe('06 July 2026');
    expect(teacherLines(cell)).toEqual(['L1', 'Ms Tan']);
  });

  it('public holiday cell names the holiday', () => {
    const cell = cellFor(model, '2026-07-10')!;
    expect(cell.kind).toBe('publicHoliday');
    expect(activityText(cell)).toBe('PublicHoliday — Some PH');
  });

  it('school holiday cell names the holiday', () => {
    const cell = cellFor(model, '2026-07-15')!;
    expect(cell.kind).toBe('schoolHoliday');
    expect(activityText(cell)).toBe('SchoolHoliday — Term Break');
  });

  it('weekend cell shows Weekend with a dash date', () => {
    const cell = cellFor(model, '2026-07-11')!; // Saturday
    expect(cell.kind).toBe('weekend');
    expect(activityText(cell)).toBe('Weekend');
    expect(dateText(cell)).toBe('-');
    expect(teacherLines(cell)).toEqual(['-']);
  });

  it('a non-teaching weekday with no lesson is blank', () => {
    // 2026-07-01..03 precede the start date and hold no lessons.
    const cell = cellFor(model, '2026-07-01')!;
    expect(cell.kind).toBe('blank');
    expect(dateText(cell)).toBe('');
    expect(teacherLines(cell)).toEqual([]);
  });

  it('never leaks ISO into display text', () => {
    for (const m of model.months) {
      for (const row of m.grid) {
        for (const cell of row) {
          expect(dateText(cell)).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
        }
      }
    }
  });
});

describe('first-day-of-week and 6-week months', () => {
  it('sunday-first reorders rows and re-buckets weeks', () => {
    const lessons = generateSchedule(CONFIG, HOLIDAYS);
    const model = buildPlanner(
      lessons,
      COURSE,
      HOLIDAYS,
      'sunday',
      '2026-07-03',
    );
    expect(model.weekdayLabels[0]).toBe('Sunday');
    // Sunday-first: July 2026 starts Wednesday → lead 3;
    // 2026-07-06 (Monday) is cellIndex 3 + 5 = 8 → week 1, row 1.
    expect(model.months[0].grid[1][1].dateIso).toBe('2026-07-06');
  });

  it('a month spanning six calendar weeks gets six week columns', () => {
    // March 2026 starts on a Sunday; Monday-first lead = 6, 6+31 = 37 → 6 weeks.
    const cfg: ClassGroupConfig = {
      ...CONFIG,
      startDate: '2026-03-02',
      totalLessons: 3,
    };
    const lessons = generateSchedule(cfg, {
      uccHolidays: [],
      publicHolidays: [],
    });
    const model = buildPlanner(
      lessons,
      COURSE,
      { uccHolidays: [], publicHolidays: [] },
      'monday',
      '2026-03-01',
    );
    expect(model.months[0].weeks).toBe(6);
    // 2026-03-31 (Tuesday) lands in the last week column.
    expect(model.months[0].grid[1][5].dateIso).toBe('2026-03-31');
  });
});

describe('scope label pass-through', () => {
  it('uses the provided scope label', () => {
    const lessons = generateSchedule(CONFIG, HOLIDAYS);
    const model = buildPlanner(
      lessons,
      COURSE,
      HOLIDAYS,
      'monday',
      '2026-07-03',
      'Module',
    );
    expect(model.scopeLabel).toBe('Module');
  });
});
