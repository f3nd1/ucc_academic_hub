import { describe, it, expect } from 'vitest';
import { buildCalendarMonths, weekdayHeaders } from '../src/calendarGrid';
import { generateCourseSchedule } from '../src/courseEngine';
import type { Course, HolidaySet } from '../src/types';

const NO_HOLIDAYS: HolidaySet = { uccHolidays: [], publicHolidays: [] };

const COURSE: Course = {
  name: 'Course X',
  startMonth: '2026-07',
  deliveryMode: 'parallel',
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

  it('a month spanning five calendar weeks produces exactly five week rows, never a phantom sixth', () => {
    // July 2026 starts on a Wednesday; Monday-first lead = 2, 2 + 31 = 33 →
    // ceil(33 / 7) = 5 week rows, not 6.
    const m = months[0];
    expect(m.weeks).toHaveLength(5);
    // 31 July (the month's last day, a Friday) sits in the 5th (last) row.
    expect(m.weeks[4][4].iso).toBe('2026-07-31');
  });

  it('empty input yields no months', () => {
    expect(buildCalendarMonths([], 'monday')).toEqual([]);
  });

  // The Amend screen keeps row order stable while you type, so a date edit or a
  // hand-added session leaves the stored array unsorted. Reading first/last by
  // array position then produced a backwards range and rendered nothing.
  it('spans the full range even when the input is not sorted by date', () => {
    const unsorted = [
      { ...lessons[0], date: '2026-08-14', day: 'Friday' },
      { ...lessons[1], date: '2026-07-01', day: 'Wednesday' },
    ];
    const out = buildCalendarMonths(unsorted, 'monday');
    expect(out.map((m) => m.monthName)).toEqual(['July', 'August']);
  });
});

describe('buildCalendarMonths — holiday/weekend classification (Calendar PDF colouring)', () => {
  const lessons = generateCourseSchedule(COURSE, NO_HOLIDAYS);
  const cellFor = (months: ReturnType<typeof buildCalendarMonths>, iso: string) =>
    months
      .flatMap((m) => m.weeks.flat())
      .find((c) => c.iso === iso)!;

  it('without a holidays arg, entry-free weekdays classify as blank and weekends as weekend', () => {
    const months = buildCalendarMonths(lessons, 'monday');
    // 2026-07-04 is a Saturday with no entries.
    expect(cellFor(months, '2026-07-04').kind).toBe('weekend');
    // 2026-07-13 (Monday) has no lesson (only 8 lessons, filling through 07-10)
    // and no holidays were passed, so it's an ordinary blank teaching day.
    expect(cellFor(months, '2026-07-13').kind).toBe('blank');
  });

  it('classifies public holidays, school holidays, and leaves lesson cells unclassified', () => {
    const holidays: HolidaySet = {
      uccHolidays: [{ date: '2026-07-14', name: 'Term Break' }],
      publicHolidays: [{ date: '2026-07-13', name: 'National Day' }],
    };
    const months = buildCalendarMonths(lessons, 'monday', holidays);
    const publicCell = cellFor(months, '2026-07-13');
    expect(publicCell.kind).toBe('publicHoliday');
    expect(publicCell.holidayName).toBe('National Day');

    const schoolCell = cellFor(months, '2026-07-14');
    expect(schoolCell.kind).toBe('schoolHoliday');
    expect(schoolCell.holidayName).toBe('Term Break');

    // A cell with a real lesson is never classified — colouring for it comes
    // from the lesson data itself, not from this weekend/holiday precedence.
    const lessonCell = cellFor(months, '2026-07-01');
    expect(lessonCell.entries.length).toBeGreaterThan(0);
    expect(lessonCell.kind).toBeUndefined();
  });

  it('out-of-month cells are never classified', () => {
    const holidays: HolidaySet = {
      uccHolidays: [],
      publicHolidays: [{ date: '2026-07-13', name: 'National Day' }],
    };
    const months = buildCalendarMonths(lessons, 'monday', holidays);
    for (const cell of months[0].weeks.flat()) {
      if (!cell.inMonth) expect(cell.kind).toBeUndefined();
    }
  });
});
