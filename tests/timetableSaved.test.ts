import { describe, it, expect } from 'vitest';
import { parseTimetablePayload } from '../src/tools/timetable/timetableSaved';

const VALID = {
  version: 1,
  wizard: { form: {}, scope: 'course', intent: 'list', firstDayOfWeek: 'monday' },
  lessons: [{ moduleId: 'm1', kind: 'lesson' }],
  course: { name: 'X', modules: [] },
  holidays: { uccHolidays: [], publicHolidays: [] },
};

describe('parseTimetablePayload', () => {
  it('accepts a well-formed payload', () => {
    expect(parseTimetablePayload(VALID)).not.toBeNull();
  });

  it('rejects non-objects and missing sections', () => {
    expect(parseTimetablePayload(null)).toBeNull();
    expect(parseTimetablePayload('nope')).toBeNull();
    expect(parseTimetablePayload({ ...VALID, wizard: undefined })).toBeNull();
    expect(parseTimetablePayload({ ...VALID, lessons: 'not-array' })).toBeNull();
    expect(parseTimetablePayload({ ...VALID, course: null })).toBeNull();
    expect(parseTimetablePayload({ ...VALID, holidays: 1 })).toBeNull();
  });
});
