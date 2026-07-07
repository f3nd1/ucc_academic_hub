import type { ScheduledLesson, Course, HolidaySet } from '../../types';
import type { WizardState } from '../../wizard/wizardModel';

/**
 * Everything needed to fully restore (and re-edit) a generated timetable: the
 * wizard state (form + scope + intent + first day of week — the INPUT), plus
 * the generated schedule, course, and holiday set (the OUTPUT, so manual
 * amendments survive a save/reload rather than being regenerated away).
 * Conflicts are NOT stored — they are re-derived on load so they can never go
 * stale against edited lessons.
 */
export interface TimetablePayload {
  version: 1;
  wizard: WizardState;
  lessons: ScheduledLesson[];
  course: Course;
  holidays: HolidaySet;
}

/** Validate an unknown payload (from Supabase) into a TimetablePayload, or null. */
export function parseTimetablePayload(payload: unknown): TimetablePayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (!p.wizard || typeof p.wizard !== 'object') return null;
  if (!Array.isArray(p.lessons)) return null;
  if (!p.course || typeof p.course !== 'object') return null;
  if (!p.holidays || typeof p.holidays !== 'object') return null;
  return p as unknown as TimetablePayload;
}
