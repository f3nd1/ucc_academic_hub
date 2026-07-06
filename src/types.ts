// Domain model for the UCC School Timetable Generator.
//
// The model is designed for multi-group scheduling from the start even though
// this pass only renders a single group. The scheduler accepts a discrete
// ClassGroupConfig so a future dashboard can loop an array of them without any
// refactor.

/** One module (subject) inside a Course. */
export interface Module {
  id: string;
  name: string;
  teacher: string;
  classroom: string;
  classGroup: string;
  /** The module's own scheduling window — lessons land only within it. */
  moduleStartDate: string; // YYYY-MM-DD
  moduleEndDate: string; // YYYY-MM-DD
  lessonNames: string[];
  /** Optional activity per lesson, paired by index; blanks preserved. */
  activities?: string[];
  totalLessons: number; // integer
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

/** How a course's modules are delivered over time. */
export type DeliveryMode = 'series' | 'parallel';

/** A course: a set of modules, each with its own scheduling window. */
export interface Course {
  name: string;
  startMonth: string; // YYYY-MM (retained for imports/exports; not scheduled on)
  deliveryMode: DeliveryMode;
  modules: Module[];
}

/** A cross-module scheduling conflict on one date. */
export interface Conflict {
  /** 'teacherRoomTime' = same teacher + overlapping time + same classroom. */
  type: 'teacher' | 'classroom' | 'classGroup' | 'teacherRoomTime';
  date: string; // YYYY-MM-DD
  moduleIds: string[];
  detail: string;
}

/** Configuration for one class group's timetable (v1 single-group engine). */
export interface ClassGroupConfig {
  id: string;
  courseName: string;
  classGroup: string;
  teacher: string;
  classroom: string;
  lessonNames: string[];
  /** Optional activity/skill per lesson, paired to lessonNames by index. */
  activities: string[];
  totalLessons: number;
  /** null = every-weekday mode; a number = per-month mode. */
  lessonsPerMonth: number | null;
  startDate: string; // YYYY-MM-DD (local)
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

/** A single scheduled entry: a real lesson or an AL (buffer) day. */
export interface ScheduledLesson {
  groupId: string;
  /** Owning module (course engine) or group id (legacy engine). */
  moduleId: string;
  /** Denormalised module name for views/exports (like teacher/classroom). */
  moduleName: string;
  /** "lesson" = teaching session; "AL" = buffer day (no teacher, no room). */
  kind: 'lesson' | 'AL';
  lessonNo: number;
  lessonName: string;
  /** Optional activity/skill, distinct from the lesson label (planner). */
  activity?: string;
  date: string; // YYYY-MM-DD (local)
  day: string; // e.g. "Monday"
  startTime: string;
  endTime: string;
  teacher: string;
  classroom: string;
  classGroup: string;
  /** Cross-module conflicts touching this lesson (set by detectConflicts). */
  conflicts?: Conflict[];
}

/** A non-teaching date with an optional display name (e.g. "National Day"). */
export interface NamedHoliday {
  date: string; // YYYY-MM-DD
  name?: string;
}

/** Non-teaching dates, each carrying an optional name for the planner. */
export interface HolidaySet {
  uccHolidays: NamedHoliday[];
  publicHolidays: NamedHoliday[];
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
