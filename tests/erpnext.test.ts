import { describe, it, expect } from 'vitest';
import { mapDocToForm } from '../src/erpnext';

describe('mapDocToForm', () => {
  it('maps flat string fields and slices times to HH:mm', () => {
    const form = mapDocToForm({
      course_name: 'ULEC English',
      class_group: 'ULEC-1A',
      teacher: 'Ms Tan',
      classroom: 'R2',
      start_date: '2026-07-06',
      start_time: '09:00:00',
      end_time: '10:30:00',
      lesson_names: 'L1\nL2',
    });
    expect(form.courseName).toBe('ULEC English');
    expect(form.startMonth).toBe('2026-07');
    const mod = form.modules[0];
    expect(mod.name).toBe('ULEC English');
    expect(mod.classGroup).toBe('ULEC-1A');
    expect(mod.startTime).toBe('09:00');
    expect(mod.endTime).toBe('10:30');
    expect(mod.lessonNamesRaw).toBe('L1\nL2');
  });

  it('extracts child-table rows via the label fieldname fallbacks', () => {
    const form = mapDocToForm({
      lesson_names: [
        { lesson_name: 'Part 1 Lesson 1' },
        { title: 'Part 1 Lesson 2' },
        { name: 'row-3-id', lesson_name: 'Part 1 Lesson 3' },
      ],
      activities: [{ activity: 'Listening' }, { activity: 'Reading' }],
    });
    expect(form.modules[0].lessonNamesRaw).toBe(
      'Part 1 Lesson 1\nPart 1 Lesson 2\nPart 1 Lesson 3',
    );
    expect(form.modules[0].activitiesRaw).toBe('Listening\nReading');
  });

  it('missing fields stay empty rather than "undefined"', () => {
    const form = mapDocToForm({});
    expect(form.courseName).toBe('');
    expect(form.modules[0].lessonNamesRaw).toBe('');
    expect(form.modules[0].activitiesRaw).toBe('');
    expect(form.modules[0].startTime).toBe('');
  });

  it('non-string child rows and empty labels are skipped', () => {
    const form = mapDocToForm({
      lesson_names: [{ lesson_name: '  ' }, 'plain-string', 42, null],
    });
    expect(form.modules[0].lessonNamesRaw).toBe('plain-string\n42');
  });
});
