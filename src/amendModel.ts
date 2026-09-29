import type { ScheduledLesson } from './types';
import { dayName, parseLocal } from './shared/dates';

// Manual amendment of a generated timetable. Pure list-in/list-out so the
// addressing rule below is testable without the Amend table around it.

/** Fields of a generated entry the user may amend in place. */
export type AmendableField =
  | 'date'
  | 'moduleName'
  | 'lessonName'
  | 'activity'
  | 'startTime'
  | 'endTime'
  | 'teacher'
  | 'classroom';

/**
 * Amend one entry, addressed by its POSITION in the list.
 *
 * Entries used to be addressed by (moduleId, lessonNo), which reads like a key
 * but is not one: every AL buffer day a module owns carries `lessonNo: 0`
 * (see makeModuleAL), so a module with five AL days has five entries sharing
 * that pair. That was harmless only while the Amend table hid AL days. The
 * moment they became editable — which is the point, an AL day has to be
 * shiftable like a lesson — one date change would have rewritten every AL day
 * in the module at once. Position is the one identifier that holds for both
 * kinds, and the table renders this exact array in this exact order, so the
 * two cannot drift apart.
 */
export function amendEntry(
  lessons: ScheduledLesson[],
  index: number,
  field: AmendableField,
  value: string,
): ScheduledLesson[] {
  if (index < 0 || index >= lessons.length) return lessons;
  return lessons.map((l, i) =>
    i === index
      ? {
          ...l,
          [field]: value,
          // The weekday label is derived from the date, so it has to move with
          // it — a shifted entry showing its old day is what makes the Hybrid
          // planner place it in the wrong row.
          ...(field === 'date' && value
            ? { day: dayName(parseLocal(value)) }
            : {}),
        }
      : l,
  );
}

/** Drop one entry by position — same addressing rule as amendEntry. */
export function removeEntry(
  lessons: ScheduledLesson[],
  index: number,
): ScheduledLesson[] {
  if (index < 0 || index >= lessons.length) return lessons;
  return lessons.filter((_, i) => i !== index);
}
