import { describe, it, expect } from 'vitest';
import {
  observedPublicHolidays,
  blockedDates,
  validTeachingDatesInRange,
  generateCourseSchedule,
  validateModuleFit,
  detectConflicts,
} from '../src/courseEngine';
import type {
  Course,
  HolidaySet,
  Module,
  ScheduledLesson,
} from '../src/types';

const NO_HOLIDAYS: HolidaySet = { uccHolidays: [], publicHolidays: [] };

const mod = (patch: Partial<Module>): Module => ({
  id: 'm1',
  name: 'Module',
  teacher: 'Ms Tan',
  classroom: 'R1',
  classGroup: 'CG',
  moduleStartDate: '2026-07-01',
  moduleEndDate: '2026-07-31',
  lessonNames: ['L1', 'L2'],
  activities: [],
  totalLessons: 3,
  startTime: '09:00',
  endTime: '10:00',
  ...patch,
});

const course = (
  modules: Module[],
  deliveryMode: Course['deliveryMode'] = 'parallel',
): Course => ({
  name: 'Course',
  startMonth: '2026-07',
  deliveryMode,
  modules,
});

const lesson = (patch: Partial<ScheduledLesson>): ScheduledLesson => ({
  groupId: 'g',
  moduleId: 'm1',
  moduleName: 'M1',
  kind: 'lesson',
  lessonNo: 1,
  lessonName: 'L',
  date: '2026-07-01',
  day: 'Wednesday',
  startTime: '09:00',
  endTime: '10:00',
  teacher: 'Ms Tan',
  classroom: 'R1',
  classGroup: 'CG',
  ...patch,
});

describe('observedPublicHolidays', () => {
  it('a Sunday public holiday auto-observes the following Monday', () => {
    // 2026-08-09 (National Day) is a Sunday.
    expect(
      observedPublicHolidays([{ date: '2026-08-09', name: 'National Day' }]),
    ).toEqual([{ date: '2026-08-10', name: 'National Day observed' }]);
  });
  it('a non-Sunday public holiday produces no observed date', () => {
    // 2026-12-25 is a Friday.
    expect(
      observedPublicHolidays([{ date: '2026-12-25', name: 'Christmas' }]),
    ).toEqual([]);
  });
  it('blockedDates includes UCC, public, and observed dates', () => {
    const blocked = blockedDates({
      uccHolidays: [{ date: '2026-09-01' }],
      publicHolidays: [{ date: '2026-08-09', name: 'National Day' }],
    });
    expect(blocked.has('2026-09-01')).toBe(true); // school
    expect(blocked.has('2026-08-09')).toBe(true); // Sunday public
    expect(blocked.has('2026-08-10')).toBe(true); // observed Monday
  });
});

describe('validTeachingDatesInRange', () => {
  it('excludes weekends and blocked days, respects the range', () => {
    const blocked = blockedDates({
      uccHolidays: [],
      publicHolidays: [{ date: '2026-08-09', name: 'National Day' }],
    });
    // 2026-08-07 (Fri), 08-08/09 weekend, 08-10 observed Monday blocked.
    const dates = validTeachingDatesInRange('2026-08-07', '2026-08-12', blocked);
    expect(dates).toEqual(['2026-08-07', '2026-08-11', '2026-08-12']);
  });
  it('returns [] when start is after end', () => {
    expect(validTeachingDatesInRange('2026-07-10', '2026-07-01', new Set())).toEqual([]);
  });
});

describe('generateCourseSchedule — Parallel', () => {
  it('places lessons on consecutive valid teaching days (no gaps)', () => {
    const lessons = generateCourseSchedule(
      course([mod({ moduleStartDate: '2026-07-01', moduleEndDate: '2026-07-10', totalLessons: 3 })], 'parallel'),
      NO_HOLIDAYS,
    );
    // Jul 1 Wed, 2 Thu, 3 Fri — the earliest three valid days, back to back.
    expect(lessons.map((l) => l.date)).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
    ]);
    expect(lessons.every((l) => l.kind === 'lesson')).toBe(true);
  });

  it('never schedules on weekends, public, observed, or school holidays', () => {
    const holidays: HolidaySet = {
      uccHolidays: [{ date: '2026-08-12', name: 'Staff Day' }],
      publicHolidays: [{ date: '2026-08-09', name: 'National Day' }],
    };
    const lessons = generateCourseSchedule(
      course([mod({ moduleStartDate: '2026-08-07', moduleEndDate: '2026-08-14', totalLessons: 5 })], 'parallel'),
      holidays,
    );
    // Valid: 07 Fri, [08/09 wknd], [10 observed], 11 Tue, [12 school], 13 Thu, 14 Fri.
    expect(lessons.map((l) => l.date)).toEqual([
      '2026-08-07',
      '2026-08-11',
      '2026-08-13',
      '2026-08-14',
    ]);
  });

  it('caps at the available teaching days and never leaves the window', () => {
    const lessons = generateCourseSchedule(
      course([mod({ moduleStartDate: '2026-07-01', moduleEndDate: '2026-07-03', totalLessons: 100 })], 'parallel'),
      NO_HOLIDAYS,
    );
    expect(lessons).toHaveLength(3); // only 3 weekdays available
    expect(lessons.every((l) => l.date >= '2026-07-01' && l.date <= '2026-07-03')).toBe(true);
  });

  it('pulls the next module up to the day after the previous one ends', () => {
    // Module A finishes on 2026-07-07 (Jul 4/5 is a weekend); B originally
    // starts 2026-07-01 but is pulled to the next valid day, 2026-07-08.
    const lessons = generateCourseSchedule(
      course(
        [
          mod({ id: 'a', name: 'A', moduleStartDate: '2026-07-01', moduleEndDate: '2026-07-31', totalLessons: 5 }),
          mod({ id: 'b', name: 'B', moduleStartDate: '2026-07-01', moduleEndDate: '2026-07-31', totalLessons: 2 }),
        ],
        'parallel',
      ),
      NO_HOLIDAYS,
    );
    expect(lessons.filter((l) => l.moduleId === 'a').map((l) => l.date)).toEqual([
      '2026-07-01',
      '2026-07-02',
      '2026-07-03',
      '2026-07-06',
      '2026-07-07',
    ]);
    // No empty valid teaching day between A's last lesson and B's first.
    expect(lessons.filter((l) => l.moduleId === 'b').map((l) => l.date)).toEqual([
      '2026-07-08',
      '2026-07-09',
    ]);
    expect(lessons.every((l) => l.kind === 'lesson')).toBe(true); // no AL in Parallel
  });

  it('never pulls a module earlier than its own start date', () => {
    const lessons = generateCourseSchedule(
      course(
        [
          mod({ id: 'a', name: 'A', moduleStartDate: '2026-07-01', moduleEndDate: '2026-07-31', totalLessons: 2 }),
          mod({ id: 'b', name: 'B', moduleStartDate: '2026-08-03', moduleEndDate: '2026-08-14', totalLessons: 2 }),
        ],
        'parallel',
      ),
      NO_HOLIDAYS,
    );
    // A ends 2026-07-02; B's own start (2026-08-03) is later, so it wins.
    expect(lessons.filter((l) => l.moduleId === 'b').map((l) => l.date)).toEqual([
      '2026-08-03',
      '2026-08-04',
    ]);
  });
});

describe('generateCourseSchedule — Series', () => {
  it('spreads lessons evenly and fills the gaps between them with AL', () => {
    const lessons = generateCourseSchedule(
      course([mod({ moduleStartDate: '2026-07-01', moduleEndDate: '2026-07-10', totalLessons: 3 })], 'series'),
      NO_HOLIDAYS,
    );
    // Valid days: Jul 1,2,3,6,7,8,9,10 (8). 3 lessons land on 1, 7, 10.
    const byKind = (k: string) => lessons.filter((l) => l.kind === k).map((l) => l.date);
    expect(byKind('lesson')).toEqual(['2026-07-01', '2026-07-07', '2026-07-10']);
    // Every valid teaching day strictly between lessons becomes AL.
    expect(byKind('AL')).toEqual([
      '2026-07-02',
      '2026-07-03',
      '2026-07-06',
      '2026-07-08',
      '2026-07-09',
    ]);
  });

  it('AL entries carry no teacher, room, or times', () => {
    const lessons = generateCourseSchedule(
      course([mod({ moduleStartDate: '2026-07-01', moduleEndDate: '2026-07-10', totalLessons: 3 })], 'series'),
      NO_HOLIDAYS,
    );
    const al = lessons.find((l) => l.kind === 'AL')!;
    expect(al.lessonName).toBe('AL');
    expect(al.activity).toBe('Autonomous Learning');
    expect(al.teacher).toBe('');
    expect(al.classroom).toBe('');
    expect(al.startTime).toBe('');
  });

  it('produces no AL when lessons are already consecutive', () => {
    const lessons = generateCourseSchedule(
      course([mod({ moduleStartDate: '2026-07-01', moduleEndDate: '2026-07-03', totalLessons: 3 })], 'series'),
      NO_HOLIDAYS,
    );
    expect(lessons.map((l) => l.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(lessons.some((l) => l.kind === 'AL')).toBe(false);
  });

  it('never marks AL on weekends or blocked holidays', () => {
    const holidays: HolidaySet = {
      uccHolidays: [],
      publicHolidays: [{ date: '2026-08-09', name: 'National Day' }],
    };
    // Window spans a weekend + Sunday public holiday + observed Monday.
    const lessons = generateCourseSchedule(
      course([mod({ moduleStartDate: '2026-08-05', moduleEndDate: '2026-08-14', totalLessons: 2 })], 'series'),
      holidays,
    );
    const al = lessons.filter((l) => l.kind === 'AL').map((l) => l.date);
    // No AL on 08 (Sat), 09 (Sun public), 10 (observed Mon) — all blocked.
    expect(al).not.toContain('2026-08-08');
    expect(al).not.toContain('2026-08-09');
    expect(al).not.toContain('2026-08-10');
  });
});

describe('validateModuleFit', () => {
  it('no warning when the lessons fit', () => {
    expect(
      validateModuleFit(course([mod({ moduleStartDate: '2026-07-01', moduleEndDate: '2026-07-31', totalLessons: 3 })]), NO_HOLIDAYS),
    ).toEqual([]);
  });
  it('warns when there are fewer teaching days than lessons', () => {
    const warnings = validateModuleFit(
      course([mod({ name: 'Tight', moduleStartDate: '2026-07-01', moduleEndDate: '2026-07-03', totalLessons: 10 })]),
      NO_HOLIDAYS,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Tight has 10 lesson(s), but only 3');
    expect(warnings[0]).toContain('does not fit');
  });
  it('warns when a window is missing', () => {
    const warnings = validateModuleFit(
      course([mod({ name: 'NoDates', moduleStartDate: '', moduleEndDate: '' })]),
      NO_HOLIDAYS,
    );
    expect(warnings[0]).toContain('missing a module start date or module end date');
  });
});

describe('detectConflicts (teacher + time + classroom, all three)', () => {
  const twoModules = (a: Partial<ScheduledLesson>, b: Partial<ScheduledLesson>) =>
    detectConflicts([
      lesson({ moduleId: 'm1', moduleName: 'M1', ...a }),
      lesson({ moduleId: 'm2', moduleName: 'M2', ...b }),
    ]).conflicts;

  it('flags a conflict only when teacher, time, and classroom all match', () => {
    const conflicts = twoModules(
      { teacher: 'Ms Tan', classroom: 'R1', startTime: '09:00', endTime: '10:00' },
      { teacher: 'Ms Tan', classroom: 'R1', startTime: '09:30', endTime: '10:30' },
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('teacherRoomTime');
  });

  it('same teacher + same time + DIFFERENT classroom = no conflict', () => {
    expect(
      twoModules(
        { teacher: 'Ms Tan', classroom: 'R1' },
        { teacher: 'Ms Tan', classroom: 'R2' },
      ),
    ).toHaveLength(0);
  });

  it('same teacher + DIFFERENT time + same classroom = no conflict', () => {
    expect(
      twoModules(
        { teacher: 'Ms Tan', classroom: 'R1', startTime: '09:00', endTime: '10:00' },
        { teacher: 'Ms Tan', classroom: 'R1', startTime: '11:00', endTime: '12:00' },
      ),
    ).toHaveLength(0);
  });

  it('DIFFERENT teacher + same time + same classroom = no conflict', () => {
    expect(
      twoModules(
        { teacher: 'Ms Tan', classroom: 'R1' },
        { teacher: 'Mr Lim', classroom: 'R1' },
      ),
    ).toHaveLength(0);
  });

  it('different dates never conflict', () => {
    expect(
      twoModules(
        { date: '2026-07-01', teacher: 'Ms Tan', classroom: 'R1' },
        { date: '2026-07-02', teacher: 'Ms Tan', classroom: 'R1' },
      ),
    ).toHaveLength(0);
  });

  it('attaches conflicts to both affected lessons', () => {
    const scan = detectConflicts([
      lesson({ moduleId: 'm1', teacher: 'T', classroom: 'R' }),
      lesson({ moduleId: 'm2', teacher: 'T', classroom: 'R' }),
    ]);
    expect(scan.lessons.every((l) => l.conflicts?.length)).toBe(true);
  });
});
