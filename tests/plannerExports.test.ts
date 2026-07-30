import { describe, it, expect } from 'vitest';
import { buildPlannerLayout } from '../src/plannerExports';
import { buildPlanner } from '../src/planner';
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
  uccHolidays: [],
  publicHolidays: [{ date: '2026-07-10', name: 'Some PH' }],
};

const lessons = generateSchedule(CONFIG, HOLIDAYS);
const model = buildPlanner(lessons, COURSE, HOLIDAYS, 'monday', '2026-07-03', 'Module');
const layout = buildPlannerLayout(model, ' / ');

describe('buildPlannerLayout', () => {
  it('starts with the scope-labelled header band', () => {
    expect(layout.values[0][0]).toBe('Module:');
    expect(layout.values[0][1]).toBe('Course X');
    expect(layout.values[1]).toEqual(expect.arrayContaining(['Timing:', '09:00 to 10:00']));
    expect(layout.values[2][0]).toBe('Updated:');
    expect(layout.values[2][1]).toBe('03 July 2026');
  });

  it('lays out Week N headers with Date/Activity/Lesson/Teacher sub-columns', () => {
    const h1 = layout.values[4];
    const h2 = layout.values[5];
    expect(h1[0]).toBe('July 2026');
    expect(h1[2]).toBe('Week 1');
    expect(h1[6]).toBe('Week 2');
    expect(h2.slice(2, 6)).toEqual(['Date', 'Activity', 'Lesson', 'Teacher']);
  });

  it('merges each Week header across its four sub-columns', () => {
    const weekMerges = layout.merges.filter(
      (m) => m.r0 === 4 && m.r1 === 5 && m.c1 - m.c0 === 4,
    );
    expect(weekMerges.length).toBe(model.months[0].weeks);
  });

  it('merges the month label down its seven weekday rows', () => {
    const monthMerge = layout.merges.find(
      (m) => m.c0 === 0 && m.c1 === 1 && m.r1 - m.r0 === 7,
    );
    expect(monthMerge).toBeDefined();
  });

  it('body rows carry weekday labels in first-day order', () => {
    const bodyStart = 6;
    expect(layout.values[bodyStart][1]).toBe('Monday');
    expect(layout.values[bodyStart + 6][1]).toBe('Sunday');
  });

  it('every date cell is display text — no ISO, no serials', () => {
    const flat = layout.values.flat();
    expect(flat.some((v) => v === '06 July 2026')).toBe(true);
    expect(flat.some((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))).toBe(false);
  });

  it('colour-fills only special-day activity cells', () => {
    expect(layout.fills.length).toBeGreaterThan(0);
    // Fills sit in Activity sub-columns: (c - 2) % 4 === 1.
    for (const f of layout.fills) expect((f.c - 2) % 4).toBe(1);
  });
});
