import { describe, it, expect } from 'vitest';
import {
  generateSchedule,
  generateMultiGroupSchedule,
  detectClashes,
} from '../src/scheduler';
import type { ClassGroupConfig, HolidaySet, ScheduledLesson } from '../src/types';

const NO_HOLIDAYS: HolidaySet = { uccHolidays: [], publicHolidays: [] };

const base: Omit<ClassGroupConfig, 'id' | 'classGroup' | 'teacher' | 'classroom'> = {
  courseName: 'Course',
  lessonNames: ['L1', 'L2'],
  activities: [],
  totalLessons: 5,
  lessonsPerMonth: null,
  startDate: '2026-07-06',
  startTime: '09:00',
  endTime: '10:00',
};

const groupA: ClassGroupConfig = {
  ...base,
  id: 'a',
  classGroup: 'CG-A',
  teacher: 'Ms Tan',
  classroom: 'R1',
};

const groupB: ClassGroupConfig = {
  ...base,
  id: 'b',
  classGroup: 'CG-B',
  teacher: 'Mr Lim',
  classroom: 'R2',
};

/** Minimal lesson factory for hand-built clash scenarios. */
const lesson = (over: Partial<ScheduledLesson>): ScheduledLesson => ({
  groupId: 'a',
  lessonNo: 1,
  lessonName: 'L1',
  date: '2026-07-06',
  day: 'Monday',
  startTime: '09:00',
  endTime: '10:00',
  teacher: 'Ms Tan',
  classroom: 'R1',
  classGroup: 'CG-A',
  ...over,
});

describe('generateMultiGroupSchedule', () => {
  it('merges every group with its full lesson count', () => {
    const merged = generateMultiGroupSchedule([groupA, groupB], NO_HOLIDAYS);
    expect(merged).toHaveLength(10);
    expect(merged.filter((l) => l.groupId === 'a')).toHaveLength(5);
    expect(merged.filter((l) => l.groupId === 'b')).toHaveLength(5);
  });

  it('sorts by date, then start time, then group', () => {
    const merged = generateMultiGroupSchedule([groupB, groupA], NO_HOLIDAYS);
    for (let i = 1; i < merged.length; i++) {
      const prev = merged[i - 1];
      const cur = merged[i];
      const key = (l: ScheduledLesson) => `${l.date}|${l.startTime}|${l.groupId}`;
      expect(key(prev) <= key(cur)).toBe(true);
    }
    // Same dates, same times → group a sorts before group b each day.
    expect(merged[0].groupId).toBe('a');
    expect(merged[1].groupId).toBe('b');
    expect(merged[0].date).toBe(merged[1].date);
  });

  it('matches the single-group scheduler per group', () => {
    const merged = generateMultiGroupSchedule([groupA, groupB], NO_HOLIDAYS);
    const soloA = generateSchedule(groupA, NO_HOLIDAYS);
    expect(merged.filter((l) => l.groupId === 'a')).toEqual(soloA);
  });
});

describe('detectClashes', () => {
  it('finds nothing in a clean single-group schedule', () => {
    const lessons = generateSchedule(groupA, NO_HOLIDAYS);
    expect(detectClashes(lessons)).toEqual([]);
  });

  it('flags a shared teacher at overlapping times across groups', () => {
    const merged = generateMultiGroupSchedule(
      [groupA, { ...groupB, teacher: 'Ms Tan' }],
      NO_HOLIDAYS,
    );
    const clashes = detectClashes(merged);
    const teacherClashes = clashes.filter((c) => c.type === 'teacher');
    expect(teacherClashes.length).toBeGreaterThan(0);
    expect(teacherClashes[0].detail).toContain('Ms Tan');
    expect(teacherClashes[0].lessons.length).toBe(2);
  });

  it('does NOT flag a shared teacher at non-overlapping times', () => {
    const clashes = detectClashes([
      lesson({}),
      lesson({ groupId: 'b', classGroup: 'CG-B', startTime: '10:00', endTime: '11:00', classroom: 'R2' }),
    ]);
    expect(clashes.filter((c) => c.type === 'teacher')).toEqual([]);
  });

  it('flags a shared classroom across groups', () => {
    const clashes = detectClashes([
      lesson({}),
      lesson({ groupId: 'b', classGroup: 'CG-B', teacher: 'Mr Lim' }),
    ]);
    const room = clashes.filter((c) => c.type === 'classroom');
    expect(room).toHaveLength(1);
    expect(room[0].detail).toContain('R1');
  });

  it('flags the same class-group label used by two configs', () => {
    const clashes = detectClashes([
      lesson({}),
      lesson({ groupId: 'b', teacher: 'Mr Lim', classroom: 'R2' }), // same CG-A
    ]);
    expect(clashes.filter((c) => c.type === 'classGroup')).toHaveLength(1);
  });

  it('flags duplicate sessions for one group on one day', () => {
    const clashes = detectClashes([
      lesson({}),
      lesson({ lessonNo: 2, startTime: '11:00', endTime: '12:00' }),
    ]);
    const dupes = clashes.filter((c) => c.type === 'duplicateSession');
    expect(dupes).toHaveLength(1);
    expect(dupes[0].lessons).toHaveLength(2);
  });

  it('flags lessons landing on named holidays when a HolidaySet is given', () => {
    const holidays: HolidaySet = {
      uccHolidays: [{ date: '2026-07-06', name: 'Term Break' }],
      publicHolidays: [{ date: '2026-07-07', name: 'Some PH' }],
    };
    const clashes = detectClashes(
      [lesson({}), lesson({ lessonNo: 2, date: '2026-07-07', day: 'Tuesday' })],
      holidays,
    );
    const ucc = clashes.find((c) => c.type === 'uccHoliday');
    const pub = clashes.find((c) => c.type === 'publicHoliday');
    expect(ucc?.detail).toContain('Term Break');
    expect(pub?.detail).toContain('Some PH');
  });

  it('ignores empty resource fields instead of clashing on ""', () => {
    const clashes = detectClashes([
      lesson({ teacher: '', classroom: '' }),
      lesson({ groupId: 'b', classGroup: 'CG-B', teacher: '', classroom: '' }),
    ]);
    expect(clashes.filter((c) => c.type === 'teacher')).toEqual([]);
    expect(clashes.filter((c) => c.type === 'classroom')).toEqual([]);
  });
});
