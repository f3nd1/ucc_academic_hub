import { describe, it, expect } from 'vitest';
import { amendEntry, removeEntry } from '../src/amendModel';
import { makeModuleAL, generateCourseSchedule } from '../src/courseEngine';
import type { Course, Module, ScheduledLesson } from '../src/types';

const MODULE: Module = {
  id: 'm1',
  name: 'Corporate Finance Strategy',
  teacher: 'Leow Boon Peng',
  classroom: 'R1',
  classGroup: 'CG-1',
  moduleStartDate: '2026-10-12',
  moduleEndDate: '2026-10-30',
  lessonNames: ['Topic 1', 'Topic 2', 'Topic 3'],
  activities: [],
  totalLessons: 4,
  startTime: '14:00',
  endTime: '17:00',
};

const COURSE: Course = {
  name: 'Course X',
  startMonth: '2026-10',
  deliveryMode: 'series',
  modules: [MODULE],
};

const NO_HOLIDAYS = { uccHolidays: [], publicHolidays: [] };

const lesson = (over: Partial<ScheduledLesson> = {}): ScheduledLesson => ({
  groupId: 'm1',
  moduleId: 'm1',
  moduleName: 'Corporate Finance Strategy',
  kind: 'lesson',
  lessonNo: 1,
  lessonName: 'Topic 1',
  date: '2026-10-12',
  day: 'Monday',
  startTime: '14:00',
  endTime: '17:00',
  teacher: 'Leow Boon Peng',
  classroom: 'R1',
  classGroup: 'CG-1',
  ...over,
});

describe('amendEntry', () => {
  it('edits only the entry at the given position', () => {
    const list = [lesson(), lesson({ lessonNo: 2, date: '2026-10-13' })];
    const out = amendEntry(list, 1, 'lessonName', 'Renamed');
    expect(out[0].lessonName).toBe('Topic 1');
    expect(out[1].lessonName).toBe('Renamed');
  });

  it('moves the weekday label along with a changed date', () => {
    // 2026-10-12 is a Monday, 2026-10-16 a Friday. A stale `day` is what puts
    // a shifted entry in the wrong Hybrid planner row.
    const out = amendEntry([lesson()], 0, 'date', '2026-10-16');
    expect(out[0].date).toBe('2026-10-16');
    expect(out[0].day).toBe('Friday');
  });

  it('leaves the weekday alone when the date is cleared', () => {
    const out = amendEntry([lesson()], 0, 'date', '');
    expect(out[0].day).toBe('Monday');
  });

  it('does not mutate the list it is given', () => {
    const list = [lesson()];
    amendEntry(list, 0, 'teacher', 'Someone Else');
    expect(list[0].teacher).toBe('Leow Boon Peng');
  });

  it('ignores an out-of-range position', () => {
    const list = [lesson()];
    expect(amendEntry(list, 5, 'teacher', 'X')).toBe(list);
    expect(amendEntry(list, -1, 'teacher', 'X')).toBe(list);
  });

  // The bug this addressing rule exists for. Every AL day a module owns
  // carries lessonNo 0, so the old (moduleId, lessonNo) lookup matched all of
  // them at once — one date change would have dragged every AL day with it.
  it('moves ONE AL day even though every AL day of a module shares lessonNo 0', () => {
    const list = [
      makeModuleAL(MODULE, '2026-10-19'),
      makeModuleAL(MODULE, '2026-10-20'),
      makeModuleAL(MODULE, '2026-10-21'),
    ];
    expect(new Set(list.map((l) => l.lessonNo))).toEqual(new Set([0]));

    const out = amendEntry(list, 1, 'date', '2026-10-26');
    expect(out.map((l) => l.date)).toEqual([
      '2026-10-19',
      '2026-10-26',
      '2026-10-21',
    ]);
    expect(out[1].day).toBe('Monday');
  });

  it('shifts an AL day onto the date a lesson has just vacated', () => {
    // The real workflow from the report: a class moves off its date, and the
    // AL day that was stranded elsewhere takes the freed day over.
    const list = [lesson({ date: '2026-10-19' }), makeModuleAL(MODULE, '2026-10-20')];
    const moved = amendEntry(list, 0, 'date', '2026-10-26');
    const remapped = amendEntry(moved, 1, 'date', '2026-10-19');
    expect(remapped.map((l) => [l.kind, l.date])).toEqual([
      ['lesson', '2026-10-26'],
      ['AL', '2026-10-19'],
    ]);
  });

  it('addresses AL and lesson rows alike in a real generated schedule', () => {
    const generated = generateCourseSchedule(COURSE, NO_HOLIDAYS);
    const alIndex = generated.findIndex((l) => l.kind === 'AL');
    expect(alIndex).toBeGreaterThanOrEqual(0);

    const out = amendEntry(generated, alIndex, 'date', '2026-10-31');
    expect(out[alIndex].date).toBe('2026-10-31');
    // Every other entry is untouched, AL days included.
    for (let i = 0; i < generated.length; i++) {
      if (i !== alIndex) expect(out[i].date).toBe(generated[i].date);
    }
  });
});

describe('removeEntry', () => {
  it('drops only the entry at the given position', () => {
    const list = [lesson(), lesson({ lessonNo: 2 }), lesson({ lessonNo: 3 })];
    expect(removeEntry(list, 1).map((l) => l.lessonNo)).toEqual([1, 3]);
  });

  it('removes ONE AL day, not every AL day sharing lessonNo 0', () => {
    const list = [
      makeModuleAL(MODULE, '2026-10-19'),
      makeModuleAL(MODULE, '2026-10-20'),
      makeModuleAL(MODULE, '2026-10-21'),
    ];
    expect(removeEntry(list, 0).map((l) => l.date)).toEqual([
      '2026-10-20',
      '2026-10-21',
    ]);
  });

  it('ignores an out-of-range position', () => {
    const list = [lesson()];
    expect(removeEntry(list, 5)).toBe(list);
  });

  it('does not mutate the list it is given', () => {
    const list = [lesson(), lesson({ lessonNo: 2 })];
    removeEntry(list, 0);
    expect(list).toHaveLength(2);
  });
});
