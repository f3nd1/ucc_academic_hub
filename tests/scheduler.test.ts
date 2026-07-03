import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../src/scheduler';
import type { ClassGroupConfig, HolidaySet } from '../src/types';

const CONFIG: ClassGroupConfig = {
  id: 'g1',
  courseName: 'Course',
  classGroup: 'CG-1',
  teacher: 'Ms Tan',
  classroom: 'R1',
  lessonNames: ['L1', 'L2', 'L3'],
  activities: [],
  totalLessons: 20,
  lessonsPerMonth: null,
  startDate: '2026-07-06', // a Monday
  startTime: '09:00',
  endTime: '10:00',
};

const NO_HOLIDAYS: HolidaySet = { uccHolidays: [], publicHolidays: [] };

const HOLIDAYS: HolidaySet = {
  uccHolidays: [{ date: '2026-09-01', name: 'Term Break' }],
  publicHolidays: [
    { date: '2026-08-09', name: 'National Day' },
    { date: '2026-12-25', name: 'Christmas' },
  ],
};

describe('every-weekday mode (v1 acceptance)', () => {
  const lessons = generateSchedule(CONFIG, HOLIDAYS);

  it('schedules exactly totalLessons sessions', () => {
    expect(lessons).toHaveLength(20);
  });
  it('starts on the start date with no off-by-one', () => {
    expect(lessons[0].date).toBe('2026-07-06');
    expect(lessons[0].day).toBe('Monday');
  });
  it('never lands on a weekend', () => {
    expect(
      lessons.every((l) => l.day !== 'Saturday' && l.day !== 'Sunday'),
    ).toBe(true);
  });
  it('never lands on a holiday', () => {
    const banned = new Set(['2026-09-01', '2026-08-09', '2026-12-25']);
    expect(lessons.some((l) => banned.has(l.date))).toBe(false);
  });
  it('dates are strictly increasing (one session per day)', () => {
    for (let i = 1; i < lessons.length; i++) {
      expect(lessons[i].date > lessons[i - 1].date).toBe(true);
    }
  });
  it('lesson names cycle by modulo', () => {
    expect(lessons[0].lessonName).toBe('L1');
    expect(lessons[3].lessonName).toBe('L1');
    expect(lessons[4].lessonName).toBe('L2');
  });
  it('skips a mid-week holiday and continues on the next valid day', () => {
    const holidayWed: HolidaySet = {
      uccHolidays: [],
      publicHolidays: [{ date: '2026-07-08' }], // Wednesday of week 1
    };
    const result = generateSchedule({ ...CONFIG, totalLessons: 3 }, holidayWed);
    expect(result.map((l) => l.date)).toEqual([
      '2026-07-06',
      '2026-07-07',
      '2026-07-09',
    ]);
  });
});

describe('per-month mode', () => {
  const cfg: ClassGroupConfig = {
    ...CONFIG,
    totalLessons: 16,
    lessonsPerMonth: 8,
  };
  const lessons = generateSchedule(cfg, NO_HOLIDAYS);

  it('places the configured count in each month', () => {
    const july = lessons.filter((l) => l.date.startsWith('2026-07'));
    const august = lessons.filter((l) => l.date.startsWith('2026-08'));
    expect(july).toHaveLength(8);
    expect(august).toHaveLength(8);
  });
  it('spreads across the month instead of clustering at the start', () => {
    const july = lessons.filter((l) => l.date.startsWith('2026-07'));
    expect(july[0].date).toBe('2026-07-06');
    expect(july[july.length - 1].date >= '2026-07-27').toBe(true);
  });
  it('final month only places the remaining lessons', () => {
    const cfg10 = { ...cfg, totalLessons: 10 };
    const result = generateSchedule(cfg10, NO_HOLIDAYS);
    expect(result).toHaveLength(10);
    expect(result.filter((l) => l.date.startsWith('2026-08'))).toHaveLength(2);
  });
  it('throws naming the month and both counts when a month cannot fit', () => {
    // July 2026 from the 6th has exactly 20 weekdays.
    expect(() =>
      generateSchedule({ ...cfg, totalLessons: 30, lessonsPerMonth: 30 }, NO_HOLIDAYS),
    ).toThrow(/Cannot schedule 30 lesson\(s\) in July 2026.*only 20 valid/s);
  });
  it('picks strictly increasing, duplicate-free days within a month', () => {
    const seen = new Set(lessons.map((l) => l.date));
    expect(seen.size).toBe(lessons.length);
  });
});

describe('activities', () => {
  it('pairs activities to lessons by index, cycling with the names', () => {
    const cfg: ClassGroupConfig = {
      ...CONFIG,
      totalLessons: 5,
      activities: ['Listening', '', 'Writing'],
    };
    const lessons = generateSchedule(cfg, NO_HOLIDAYS);
    expect(lessons[0].activity).toBe('Listening');
    expect(lessons[1].activity).toBeUndefined(); // blank line = no activity
    expect(lessons[2].activity).toBe('Writing');
    expect(lessons[3].activity).toBe('Listening'); // cycles with names
  });
  it('omits activity entirely when none are provided', () => {
    const lessons = generateSchedule({ ...CONFIG, totalLessons: 2 }, NO_HOLIDAYS);
    expect(lessons[0].activity).toBeUndefined();
  });
});

describe('degenerate inputs terminate', () => {
  it('returns fewer lessons instead of hanging when nothing is schedulable', () => {
    // Every weekday for five years blocked is impossible; just block enough
    // that the day-scan cap kicks in and the function still returns.
    const everyDayHoliday: HolidaySet = {
      uccHolidays: [],
      publicHolidays: Array.from({ length: 366 * 5 }, (_, i) => {
        const d = new Date(2026, 6, 6 + i);
        const pad = (n: number) => String(n).padStart(2, '0');
        return {
          date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
        };
      }),
    };
    const result = generateSchedule({ ...CONFIG, totalLessons: 5 }, everyDayHoliday);
    expect(result).toHaveLength(0);
  });
});
