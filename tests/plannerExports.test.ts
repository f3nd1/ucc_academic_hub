import { describe, it, expect } from 'vitest';
import { buildPlannerLayout, cellTexts } from '../src/plannerExports';
import { buildPlanner, type PlannerCell } from '../src/planner';
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

  it('defaults to the activity mode (unchanged behaviour)', () => {
    const explicit = buildPlannerLayout(model, ' / ', 'activity');
    expect(explicit.values).toEqual(layout.values);
  });

  it('module mode relabels the header and swaps cell values to the module name', () => {
    const moduleLayout = buildPlannerLayout(model, ' / ', 'module');
    const h2 = moduleLayout.values[5];
    expect(h2.slice(2, 6)).toEqual(['Date', 'Module', 'Lesson', 'Teacher']);
    // The teaching cell that showed "Listening" in activity mode now shows
    // the module name; Lesson/Teacher sub-columns are untouched either way.
    expect(moduleLayout.values.flat()).toContain('Course X');
    expect(moduleLayout.values.flat()).not.toContain('Listening');
  });

  it('special-day fills use the UCC brand palette (public holiday on 10 July)', () => {
    // 06/07/08/09 July teach; 10 July (Fri) is the public holiday, skipped; the
    // next lesson lands 13 July. So 10 July is the sole publicHoliday fill.
    const closeTo = (a: [number, number, number], b: [number, number, number]) =>
      a.every((v, i) => Math.abs(v - b[i]) < 0.01);
    const gold: [number, number, number] = [206 / 255, 158 / 255, 93 / 255]; // #CE9E5D
    expect(layout.fills.some((f) => closeTo(f.rgb, gold))).toBe(true);
    // The old hardcoded pinkish public-holiday colour must be gone.
    expect(layout.fills.some((f) => closeTo(f.rgb, [0.98, 0.87, 0.87]))).toBe(false);
  });
});

describe('cellTexts — one line per session (Hybrid PDF)', () => {
  const cellFor = (iso: string) => {
    for (const m of model.months)
      for (const row of m.grid)
        for (const c of row) if (c.dateIso === iso) return c;
    throw new Error(`no cell for ${iso}`);
  };

  /** A teaching cell carrying two sessions of the SAME module on one date. */
  const amPmCell = (): PlannerCell => ({
    kind: 'teaching',
    dateIso: '2026-07-06',
    dateDisplay: '06 July 2026',
    conflict: false,
    entries: [
      {
        moduleId: 'g1',
        moduleName: 'English',
        lessonName: 'Vocabulary',
        teacher: 'Ms Tan',
        activity: 'Listening and Viewing',
        startTime: '09:30',
        endTime: '12:30',
        conflict: false,
      },
      {
        moduleId: 'g1',
        moduleName: 'English',
        lessonName: 'Vocabulary',
        teacher: 'Ms Tan',
        activity: 'Listening and Viewing',
        startTime: '14:00',
        endTime: '17:00',
        conflict: false,
      },
    ],
  });

  // The reported bug: a morning and an afternoon session of one module ran
  // together into a single cramped, duplicated string with nothing to say
  // there were two of them ("Listening and Viewing Listening and Viewing",
  // "Vocabulary Vocabulary"). Each session must occupy its own line, and the
  // time range is the only thing that distinguishes two identical sessions.
  it('gives each same-day session of one module its own timed lesson line', () => {
    const [, lesson] = cellTexts(amPmCell(), 'activity');
    expect(lesson).toBe('09:30-12:30\nVocabulary\n14:00-17:00\nVocabulary');
  });

  it('never joins two sessions into one unbroken string', () => {
    const [activity, lesson, teacher] = cellTexts(amPmCell(), 'activity');
    expect(activity).not.toContain(' / ');
    for (const text of [activity, lesson, teacher]) {
      expect(text.split('\n').length).toBeGreaterThan(1);
    }
  });

  // Each session occupies the same two lines in every column, so a value
  // stays level with the session it describes.
  it('keeps each module name level with its own session', () => {
    const [module, lesson] = cellTexts(amPmCell(), 'module');
    expect(module).toBe('English\n\nEnglish');
    const moduleLines = module.split('\n');
    const lessonLines = lesson.split('\n');
    expect(moduleLines[0]).toBe('English');
    expect(lessonLines[0]).toBe('09:30-12:30');
    expect(moduleLines[2]).toBe('English');
    expect(lessonLines[2]).toBe('14:00-17:00');
  });

  // The misattribution this padding exists to prevent: a day where only the
  // SECOND session has a teacher used to print that name on the first line,
  // reading as though it belonged to the first session.
  it('keeps a lone teacher level with the session they actually teach', () => {
    const cell = amPmCell();
    cell.entries![0].teacher = '';
    const [, lesson, teacher] = cellTexts(cell, 'activity');
    expect(teacher).toBe('\n\nMs Tan');
    expect(teacher.split('\n')[2]).toBe('Ms Tan');
    expect(lesson.split('\n')[2]).toBe('14:00-17:00');
  });

  it('carries a single session with its own time too', () => {
    // The header's "Timing:" line is gone, so the grid is now the only place
    // a session's time appears — it has to be there for one-session days.
    const [, lesson] = cellTexts(cellFor('2026-07-06'), 'activity');
    expect(lesson).toBe('09:00-10:00\nL1');
  });

  it('leaves an all-blank teacher column genuinely empty, with no placeholder', () => {
    const cell = amPmCell();
    cell.entries![0].teacher = '';
    cell.entries![1].teacher = '';
    const [, , teacher] = cellTexts(cell, 'activity');
    expect(teacher).toBe('');
  });

  it('leaves non-teaching cells to the shared planner helpers', () => {
    const [activity, lesson, teacher] = cellTexts(cellFor('2026-07-10'), 'activity');
    expect(activity).toBe('PublicHoliday — Some PH');
    expect(lesson).toBe('-');
    expect(teacher).toBe('-');
  });
});
