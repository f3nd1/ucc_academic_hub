import { describe, it, expect } from 'vitest';
import {
  firstTeachingDayOfMonth,
  validTeachingDaysOfMonth,
  scheduleSeriesModule,
  scheduleParallelModule,
  generateCourseSchedule,
} from '../src/courseEngine';
import { AL_LABEL } from '../src/constants';
import { formatDate } from '../src/dateUtils';
import type { Course, HolidaySet, Module } from '../src/types';

const NO_HOLIDAYS: HolidaySet = { uccHolidays: [], publicHolidays: [] };

const mod = (over: Partial<Module>): Module => ({
  id: 'm1',
  name: 'Module One',
  teacher: 'Ms Tan',
  classroom: 'R1',
  classGroup: 'CG-1',
  lessonNames: ['L1', 'L2', 'L3'],
  activities: ['Listening', 'Reading', 'Writing'],
  totalLessons: 8,
  startTime: '09:00',
  endTime: '10:00',
  ...over,
});

const course = (over: Partial<Course>): Course => ({
  name: 'Course X',
  startMonth: '2026-07',
  deliveryMode: 'series',
  modules: [mod({})],
  ...over,
});

describe('month-anchored start', () => {
  it('starts on the 1st when it is a valid weekday', () => {
    // 2026-07-01 is a Wednesday.
    const d = firstTeachingDayOfMonth(2026, 6, NO_HOLIDAYS)!;
    expect(formatDate(d)).toBe('2026-07-01');
  });

  it('skips a weekend 1st to the next weekday', () => {
    // 2026-08-01 is a Saturday → first teaching day is Monday the 3rd.
    const d = firstTeachingDayOfMonth(2026, 7, NO_HOLIDAYS)!;
    expect(formatDate(d)).toBe('2026-08-03');
  });

  it('skips a holiday 1st to the next valid day', () => {
    const holidays: HolidaySet = {
      uccHolidays: [],
      publicHolidays: [{ date: '2026-07-01', name: 'PH' }],
    };
    const d = firstTeachingDayOfMonth(2026, 6, holidays)!;
    expect(formatDate(d)).toBe('2026-07-02');
  });

  it('valid teaching days exclude weekends and holidays', () => {
    const holidays: HolidaySet = {
      uccHolidays: [{ date: '2026-07-15' }],
      publicHolidays: [],
    };
    const days = validTeachingDaysOfMonth(2026, 6, holidays).map(formatDate);
    expect(days).not.toContain('2026-07-15');
    expect(days).not.toContain('2026-07-04'); // Saturday
    expect(days[0]).toBe('2026-07-01');
    expect(days.length).toBe(22); // 23 weekdays in July 2026 minus the holiday
  });
});

describe('series distribution', () => {
  it('first lesson lands on the first teaching day of the start month', () => {
    const placed = scheduleSeriesModule(mod({}), 2026, 6, NO_HOLIDAYS);
    const lessons = placed.entries.filter((e) => e.kind === 'lesson');
    expect(lessons[0].date).toBe('2026-07-01');
  });

  it('spreads lessons across the month and fills the rest with AL', () => {
    const placed = scheduleSeriesModule(mod({ totalLessons: 8 }), 2026, 6, NO_HOLIDAYS);
    const lessons = placed.entries.filter((e) => e.kind === 'lesson');
    const al = placed.entries.filter((e) => e.kind === 'AL');
    expect(lessons).toHaveLength(8);
    // July 2026 has 23 weekdays: 8 lessons + 15 AL fill days.
    expect(al).toHaveLength(15);
    // Spread, not clustered: the last lesson sits late in the month.
    expect(lessons[lessons.length - 1].date >= '2026-07-27').toBe(true);
    // AL entries carry no teacher, room, or times.
    expect(al.every((e) => e.teacher === '' && e.classroom === '')).toBe(true);
    expect(al.every((e) => e.lessonName === AL_LABEL)).toBe(true);
  });

  it('every valid day of an active month is either a lesson or AL', () => {
    const placed = scheduleSeriesModule(mod({ totalLessons: 8 }), 2026, 6, NO_HOLIDAYS);
    const dates = new Set(placed.entries.map((e) => e.date));
    for (const d of validTeachingDaysOfMonth(2026, 6, NO_HOLIDAYS)) {
      expect(dates.has(formatDate(d))).toBe(true);
    }
  });

  it('overflows into the following month when lessons exceed valid days', () => {
    // 30 lessons > 23 July weekdays → 23 in July, 7 spread across August.
    const placed = scheduleSeriesModule(mod({ totalLessons: 30 }), 2026, 6, NO_HOLIDAYS);
    const lessons = placed.entries.filter((e) => e.kind === 'lesson');
    expect(lessons).toHaveLength(30);
    expect(lessons.filter((l) => l.date.startsWith('2026-07'))).toHaveLength(23);
    expect(lessons.filter((l) => l.date.startsWith('2026-08'))).toHaveLength(7);
    // A fully-taught month has no AL; the partial month gets the fill.
    const julyAl = placed.entries.filter(
      (e) => e.kind === 'AL' && e.date.startsWith('2026-07'),
    );
    expect(julyAl).toHaveLength(0);
    expect(placed.endYear).toBe(2026);
    expect(placed.endMonth).toBe(7); // August
  });

  it('lesson numbering, labels, and activities pair and cycle', () => {
    const placed = scheduleSeriesModule(mod({ totalLessons: 5 }), 2026, 6, NO_HOLIDAYS);
    const lessons = placed.entries.filter((e) => e.kind === 'lesson');
    expect(lessons.map((l) => l.lessonName)).toEqual(['L1', 'L2', 'L3', 'L1', 'L2']);
    expect(lessons[0].activity).toBe('Listening');
    expect(lessons[3].activity).toBe('Listening'); // cycles with names
  });
});

describe('parallel distribution', () => {
  it('clusters lessons onto contiguous valid days with no AL', () => {
    const placed = scheduleParallelModule(mod({ totalLessons: 8 }), 2026, 6, NO_HOLIDAYS);
    expect(placed.entries.every((e) => e.kind === 'lesson')).toBe(true);
    const days = validTeachingDaysOfMonth(2026, 6, NO_HOLIDAYS).map(formatDate);
    expect(placed.entries.map((e) => e.date)).toEqual(days.slice(0, 8));
  });

  it('a block crosses months contiguously', () => {
    const placed = scheduleParallelModule(mod({ totalLessons: 25 }), 2026, 6, NO_HOLIDAYS);
    const lessons = placed.entries;
    expect(lessons).toHaveLength(25);
    expect(lessons.filter((l) => l.date.startsWith('2026-07'))).toHaveLength(23);
    // August 1st-2nd are the weekend → continuation starts Monday the 3rd.
    expect(lessons[23].date).toBe('2026-08-03');
    expect(lessons[24].date).toBe('2026-08-04');
  });
});

describe('generateCourseSchedule (whole course)', () => {
  const m1 = mod({ id: 'a', name: 'A', totalLessons: 8 });
  const m2 = mod({ id: 'b', name: 'B', teacher: 'Mr Lim', totalLessons: 6 });

  it('series runs modules sequentially, month after month', () => {
    const lessons = generateCourseSchedule(
      course({ modules: [m1, m2], deliveryMode: 'series' }),
      NO_HOLIDAYS,
    );
    const a = lessons.filter((l) => l.moduleId === 'a' && l.kind === 'lesson');
    const b = lessons.filter((l) => l.moduleId === 'b' && l.kind === 'lesson');
    // Module A fits in July → module B starts on August's first teaching day.
    expect(a.every((l) => l.date.startsWith('2026-07'))).toBe(true);
    expect(b[0].date).toBe('2026-08-03'); // Aug 1 is a Saturday
    expect(b.every((l) => l.date.startsWith('2026-08'))).toBe(true);
  });

  it('parallel starts every module at the course start month', () => {
    const lessons = generateCourseSchedule(
      course({ modules: [m1, m2], deliveryMode: 'parallel' }),
      NO_HOLIDAYS,
    );
    const a = lessons.filter((l) => l.moduleId === 'a');
    const b = lessons.filter((l) => l.moduleId === 'b');
    expect(a[0].date).toBe('2026-07-01');
    expect(b[0].date).toBe('2026-07-01');
    expect(lessons.some((l) => l.kind === 'AL')).toBe(false);
  });

  it('course duration spans first module start to last module end', () => {
    const lessons = generateCourseSchedule(
      course({ modules: [m1, m2], deliveryMode: 'series' }),
      NO_HOLIDAYS,
    );
    const real = lessons.filter((l) => l.kind === 'lesson');
    expect(real[0].date.startsWith('2026-07')).toBe(true);
    expect(real[real.length - 1].date.startsWith('2026-08')).toBe(true);
  });

  it('holidays are never scheduled, for lessons or AL', () => {
    const holidays: HolidaySet = {
      uccHolidays: [{ date: '2026-07-08', name: 'Break' }],
      publicHolidays: [{ date: '2026-07-10', name: 'PH' }],
    };
    const lessons = generateCourseSchedule(course({}), holidays);
    expect(lessons.some((l) => l.date === '2026-07-08')).toBe(false);
    expect(lessons.some((l) => l.date === '2026-07-10')).toBe(false);
  });
});
