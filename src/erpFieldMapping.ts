import { CLASS_GROUP_LABEL } from './constants';

/** App-side fields a saved ERPNext field mapping can target. Lesson names are
 *  deliberately absent — they stay a manual, typed field in this app. */
export type AppTargetField =
  | 'courseName'
  | 'teacher'
  | 'classroom'
  | 'classGroup'
  | 'totalLessons'
  | 'startDate'
  | 'startTime'
  | 'endTime'
  | 'activity';

/** Right-hand column of the mapping table, in display order. */
export const APP_TARGET_FIELDS: { key: AppTargetField; label: string }[] = [
  { key: 'courseName', label: 'Course / Module name' },
  { key: 'teacher', label: 'Teacher' },
  { key: 'classroom', label: 'Classroom' },
  { key: 'classGroup', label: CLASS_GROUP_LABEL },
  { key: 'totalLessons', label: 'Total lessons' },
  { key: 'startDate', label: 'Start date' },
  { key: 'startTime', label: 'Start time' },
  { key: 'endTime', label: 'End time' },
  { key: 'activity', label: 'Activity (optional)' },
];

/** appField -> the ERPNext fieldname it reads from, or null when unmapped. */
export interface ErpFieldMapping {
  [appField: string]: string | null;
}

const STORAGE_PREFIX = 'ucc-erp-field-map:';

/** Mappings are kept per DocType so switching DocTypes keeps its own mapping. */
export function loadErpFieldMapping(docType: string): ErpFieldMapping {
  if (!docType.trim()) return {};
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + docType);
    if (!raw) return {};
    return JSON.parse(raw) as ErpFieldMapping;
  } catch {
    return {};
  }
}

export function saveErpFieldMapping(
  docType: string,
  mapping: ErpFieldMapping,
): void {
  if (!docType.trim()) return;
  try {
    localStorage.setItem(STORAGE_PREFIX + docType, JSON.stringify(mapping));
  } catch {
    // Private mode / quota exceeded: mapping stays in memory for the session.
  }
}
