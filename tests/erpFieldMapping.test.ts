import { describe, it, expect, beforeEach } from 'vitest';
import {
  APP_TARGET_FIELDS,
  loadErpFieldMapping,
  saveErpFieldMapping,
} from '../src/erpFieldMapping';

// vitest runs in the node environment (no DOM) — a minimal in-memory
// localStorage stand-in is enough to exercise the storage functions.
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = new MemoryStorage();
}

beforeEach(() => {
  localStorage.clear();
});

describe('APP_TARGET_FIELDS', () => {
  it('excludes lesson names — those stay manual', () => {
    expect(APP_TARGET_FIELDS.some((f) => f.key === 'lessonNames')).toBe(false);
  });

  it('includes the fixed set of mappable app fields', () => {
    expect(APP_TARGET_FIELDS.map((f) => f.key)).toEqual([
      'courseName',
      'teacher',
      'classroom',
      'classGroup',
      'totalLessons',
      'startDate',
      'startTime',
      'endTime',
      'activity',
    ]);
  });
});

describe('load/saveErpFieldMapping', () => {
  it('round-trips a mapping for a DocType', () => {
    saveErpFieldMapping('Course', { courseName: 'course_name', teacher: null });
    expect(loadErpFieldMapping('Course')).toEqual({
      courseName: 'course_name',
      teacher: null,
    });
  });

  it('keeps mappings separate per DocType', () => {
    saveErpFieldMapping('Course', { courseName: 'course_name' });
    saveErpFieldMapping('Class Schedule', { courseName: 'title' });
    expect(loadErpFieldMapping('Course')).toEqual({ courseName: 'course_name' });
    expect(loadErpFieldMapping('Class Schedule')).toEqual({ courseName: 'title' });
  });

  it('returns an empty mapping for an unmapped or blank DocType', () => {
    expect(loadErpFieldMapping('Never Saved')).toEqual({});
    expect(loadErpFieldMapping('')).toEqual({});
  });

  it('ignores a save with a blank DocType', () => {
    saveErpFieldMapping('', { courseName: 'x' });
    expect(loadErpFieldMapping('')).toEqual({});
  });
});
