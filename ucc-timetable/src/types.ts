// Domain model for the UCC School Timetable Generator.
//
// The model is designed for multi-group scheduling from the start even though
// this pass only renders a single group. The scheduler accepts a discrete
// ClassGroupConfig so a future dashboard can loop an array of them without any
// refactor.

/** Configuration for one class group's timetable. */
export interface ClassGroupConfig {
  id: string;
  courseName: string;
  classGroup: string;
  teacher: string;
  classroom: string;
  lessonNames: string[];
  totalLessons: number;
  /** null = every-weekday mode; a number = per-month mode. */
  lessonsPerMonth: number | null;
  startDate: string; // YYYY-MM-DD (local)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

/** A single scheduled session, ready for preview and export. */
export interface ScheduledLesson {
  groupId: string;
  lessonNo: number;
  lessonName: string;
  date: string; // YYYY-MM-DD (local)
  day: string; // e.g. "Monday"
  startTime: string;
  endTime: string;
  teacher: string;
  classroom: string;
  classGroup: string;
}

/** Non-teaching dates. Both lists are YYYY-MM-DD strings. */
export interface HolidaySet {
  uccHolidays: string[];
  publicHolidays: string[];
}

/**
 * A scheduling conflict. Reserved for a future live clash-detection pass;
 * defined now so downstream code can type against it without churn.
 */
export interface Clash {
  type:
    | 'teacher'
    | 'classroom'
    | 'classGroup'
    | 'duplicateSession'
    | 'publicHoliday'
    | 'uccHoliday';
  date: string;
  detail: string;
  lessons: ScheduledLesson[];
}
