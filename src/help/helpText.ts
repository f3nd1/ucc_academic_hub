// All user-facing help copy in one place so wording can change here alone.
// UK spelling; use "teacher", "class group", "module" consistently.

/** One- or two-sentence tooltips, keyed by field id. */
export const TOOLTIPS: Record<string, string> = {
  intent:
    'Pick the main way you want to see the timetable. You can still switch views after generating.',
  scope:
    'Choose what this timetable represents. It only changes labels and the output title, not the schedule.',
  primaryName: 'The name shown as the title of the generated timetable.',
  classGroup: 'The class group these lessons are for, used in exports and titles.',
  teacher: 'The teacher who takes these lessons. Shown in every view and export.',
  classroom: 'Where the lessons are held. Appears in exports and calendar events.',
  lessonNames:
    'One lesson label per line. When there are more lessons than labels, the labels repeat in order.',
  activities:
    'Optional. One activity per line, paired to the lesson on the same line. Leave blank to show the label only.',
  totalLessons: 'How many sessions to schedule in total.',
  mode: 'Every weekday fills each valid weekday; Per month spreads a set number of lessons evenly across each month.',
  lessonsPerMonth: 'Used in Per month mode: how many lessons to place in each month.',
  startDate: 'The first day the timetable may schedule a lesson.',
  startTime: 'Daily lesson start time.',
  endTime: 'Daily lesson end time. Must be later than the start time.',
  uccHolidays: 'Dates the school is closed. These are skipped when scheduling.',
  publicHolidays:
    'Singapore public holidays. These are skipped when scheduling and named in the planner.',
  firstDayOfWeek:
    'Which day the Calendar and Hybrid planner start each week on. Taken from Settings but overridable here.',
};

/** Muted inline hints under complex fields, keyed by field id. */
export const HINTS: Record<string, string> = {
  lessonsPerMonth: 'Only used in Per month mode.',
  uccHolidays: 'Format: "2026-09-01" or "2026-09-01, Term Break".',
  publicHolidays: 'Format: "2026-08-09, National Day" — the name shows in the planner.',
  activities: 'Paired to lesson names by position: line 1 ↔ lesson 1, and so on.',
  lessonNames: 'One per line. Labels repeat if there are more lessons than labels.',
};

/** First-run guided tour steps. `selector` targets a data-tour element. */
export interface TourStep {
  title: string;
  body: string;
  selector?: string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    title: 'Welcome',
    body: 'This short tour points out the main parts. You can skip it any time and restart it later from the Help menu.',
  },
  {
    title: 'Step-by-step wizard',
    body: 'The stepper tracks your progress. Work through each step; you can always go back.',
    selector: '[data-tour="stepper"]',
  },
  {
    title: 'What are you creating?',
    body: 'Step 1 sets your main output — List, Calendar, or the Hybrid planner — and the view you land on after generating.',
    selector: '[data-tour="intent"]',
  },
  {
    title: 'Switch views any time',
    body: 'After generating, flip between List, Calendar, and Hybrid over the same data — no need to regenerate.',
    selector: '[data-tour="view-switch"]',
  },
  {
    title: 'Export your timetable',
    body: 'Download CSV, PDF or an .ics calendar, or push to Google Sheets. The Hybrid view adds a course-planner export.',
    selector: '[data-tour="exports"]',
  },
  {
    title: 'Settings',
    body: 'Store ERPNext and Google credentials, and your default first day of week, in Settings.',
    selector: '[data-tour="settings-link"]',
  },
];

/** Scope → primary-name label and output-title label. */
export const SCOPE_LABELS = {
  course: { name: 'Course name', title: 'Course' },
  module: { name: 'Module name', title: 'Module' },
  classGroup: { name: 'Class group name', title: 'Class group' },
} as const;
