import { describe, it, expect } from 'vitest';
import { buildCalendarMonths, weekdayHeaders } from '../src/calendarGrid';
import { generateCourseSchedule } from '../src/courseEngine';
import type { Course, HolidaySet } from '../src/types';

const NO_HOLIDAYS: HolidaySet = { uccHolidays: [], publicHolidays: [] };

const COURSE: Course = {
  name: 'Course X',
  startMonth: '2026-07',
  deliveryMode: 'series',
  modules: [
    {
      id: 'm1',
      name: 'Module One',
      teacher: 'Ms Tan',
      classroom: 'R1',
      classGroup: 'CG-1',
      moduleStartDate: '2026-07-01',
      moduleEndDate: '2026-07-31',
      lessonNames: ['L1', 'L2'],
      activities: [],
      totalLessons: 8,
      startTime: '09:00',
      endTime: '10:00',
    },
  ],
};

describe('weekdayHeaders', () => {
  it('orders by first day of week', () => {
    expect(weekdayHeaders('monday')).toEqual([
      'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun',
    ]);
    expect(weekdayHeaders('sunday')[0]).toBe('Sun');
    expect(weekdayHeaders('sunday')[6]).toBe('Sat');
  });
});

describe('buildCalendarMonths', () => {
  const lessons = generateCourseSchedule(COURSE, NO_HOLIDAYS);
  const months = buildCalendarMonths(lessons, 'monday');

  it('covers exactly the months containing entries', () => {
    expect(months).toHaveLength(1);
    expect(months[0].monthName).toBe('July');
    expect(months[0].year).toBe(2026);
  });

  it('rows are 7 wide and the grid is first-day aligned', () => {
    const m = months[0];
    for (const week of m.weeks) expect(week).toHaveLength(7);
    // July 2026 starts on a Wednesday → Monday-first lead of 2 out-of-month
    // cells, so 1 July sits at row 0, column 2.
    expect(m.weeks[0][0].inMonth).toBe(false);
    expect(m.weeks[0][1].inMonth).toBe(false);
    expect(m.weeks[0][2].iso).toBe('2026-07-01');
    expect(m.weeks[0][2].inMonth).toBe(true);
  });

  it('sunday-first re-buckets the offset', () => {
    const sun = buildCalendarMonths(lessons, 'sunday')[0];
    // Sunday-first: lead 3 → 1 July at row 0, column 3.
    expect(sun.weeks[0][3].iso).toBe('2026-07-01');
  });

  it('maps lessons onto the earliest teaching days of the window', () => {
    const m = months[0];
    const cellFor = (iso: string) =>
      m.weeks.flat().find((c) => c.iso === iso)!;
    // Windowed engine: 8 lessons land on the first 8 valid weekdays of July.
    expect(cellFor('2026-07-01').entries.some((l) => l.kind === 'lesson')).toBe(true);
    expect(cellFor('2026-07-02').entries.some((l) => l.kind === 'lesson')).toBe(true);
    // Weekends carry no entries.
    expect(cellFor('2026-07-04').entries).toHaveLength(0);
  });

  it('out-of-month cells never carry entries', () => {
    for (const m of months) {
      for (const cell of m.weeks.flat()) {
        if (!cell.inMonth) expect(cell.entries).toHaveLength(0);
      }
    }
  });

  it('empty input yields no months', () => {
    expect(buildCalendarMonths([], 'monday')).toEqual([]);
  });
});
