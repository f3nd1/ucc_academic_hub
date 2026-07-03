import { describe, it, expect } from 'vitest';
import { COLUMN_HEADERS, DATA_COLUMN_HEADERS, dataRowFor } from '../src/exports';
import type { ScheduledLesson } from '../src/types';

const LESSON: ScheduledLesson = {
  groupId: 'g1',
  lessonNo: 3,
  lessonName: 'Part 2 Lesson 25',
  activity: 'Listening',
  date: '2026-05-02',
  day: 'Saturday',
  startTime: '09:00',
  endTime: '10:00',
  teacher: 'Ms Tan',
  classroom: 'R1',
  classGroup: 'CG-1',
};

describe('export column sets', () => {
  it('screen/PDF columns include Activity beside the lesson label', () => {
    expect([...COLUMN_HEADERS]).toEqual([
      'Lesson No',
      'Lesson Name',
      'Activity',
      'Date',
      'Day',
      'Start Time',
      'End Time',
      'Teacher',
      'Classroom',
      'Class Group',
    ]);
  });

  it('data columns keep both Date (ISO) and display Date', () => {
    expect([...DATA_COLUMN_HEADERS]).toEqual([
      'Lesson No',
      'Lesson Name',
      'Activity',
      'Date (ISO)',
      'Date',
      'Day',
      'Start Time',
      'End Time',
      'Teacher',
      'Classroom',
      'Class Group',
    ]);
  });

  it('dataRowFor aligns with DATA_COLUMN_HEADERS and formats the display date', () => {
    const row = dataRowFor(LESSON);
    expect(row).toHaveLength(DATA_COLUMN_HEADERS.length);
    expect(row[DATA_COLUMN_HEADERS.indexOf('Activity')]).toBe('Listening');
    expect(row[DATA_COLUMN_HEADERS.indexOf('Date (ISO)')]).toBe('2026-05-02');
    expect(row[DATA_COLUMN_HEADERS.indexOf('Date')]).toBe('02 May 2026');
  });

  it('missing activity renders as an empty cell, not "undefined"', () => {
    const row = dataRowFor({ ...LESSON, activity: undefined });
    expect(row[DATA_COLUMN_HEADERS.indexOf('Activity')]).toBe('');
  });
});
