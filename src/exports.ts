import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Course, ScheduledLesson } from './types';
import { TEACHER_LABEL } from './constants';
import { formatDisplayDate } from './dateUtils';

// The on-screen / PDF columns, in order. TEACHER_LABEL keeps the "Teacher"
// header (and its field label) in a single place. The Date column shows the
// human display format; ISO stays the internal value. Activity (v3) sits next
// to the lesson label it qualifies.
export const COLUMN_HEADERS = [
  'Lesson No',
  'Module',
  'Lesson Name',
  'Activity',
  'Date',
  'Day',
  'Start Time',
  'End Time',
  TEACHER_LABEL,
  'Classroom',
  'Class Group',
] as const;

// Data-export columns (CSV, Excel, Google Sheets). Keep ISO in "Date (ISO)" so
// records stay sortable AND add a human-readable "Date" in DD MMMM YYYY.
export const DATA_COLUMN_HEADERS = [
  'Lesson No',
  'Module',
  'Kind',
  'Lesson Name',
  'Activity',
  'Date (ISO)',
  'Date',
  'Day',
  'Start Time',
  'End Time',
  TEACHER_LABEL,
  'Classroom',
  'Class Group',
] as const;

/** Cells for the on-screen table / PDF (Date shown as DD MMMM YYYY). */
const rowFor = (l: ScheduledLesson): string[] => [
  l.kind === 'AL' ? '' : String(l.lessonNo),
  l.moduleName,
  l.lessonName,
  l.activity ?? '',
  formatDisplayDate(l.date),
  l.day,
  l.startTime,
  l.endTime,
  l.teacher,
  l.classroom,
  l.classGroup,
];

/** Cells for data exports: ISO date plus display date. */
export const dataRowFor = (l: ScheduledLesson): string[] => [
  l.kind === 'AL' ? '' : String(l.lessonNo),
  l.moduleName,
  l.kind === 'AL' ? 'AL' : 'Lesson',
  l.lessonName,
  l.activity ?? '',
  l.date,
  formatDisplayDate(l.date),
  l.day,
  l.startTime,
  l.endTime,
  l.teacher,
  l.classroom,
  l.classGroup,
];

/** Sanitise a name into a safe filename stem. */
const fileStem = (name: string): string =>
  (name.trim() || 'timetable').replace(/[^\w.-]+/g, '-');

/** Trigger a browser download for a Blob. */
const download = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

/** Quote a CSV field, doubling any embedded quotes. */
const csvQuote = (value: string): string => `"${value.replace(/"/g, '""')}"`;

/** Export as CSV (native Blob, ISO + display date columns, every field quoted). */
export function exportCsv(lessons: ScheduledLesson[], course: Course): void {
  const lines = [
    DATA_COLUMN_HEADERS.map(csvQuote).join(','),
    ...lessons.map((l) => dataRowFor(l).map(csvQuote).join(',')),
  ];
  const blob = new Blob([lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  download(blob, `${fileStem(course.name)}-timetable.csv`);
}

/**
 * Export as PDF (landscape) via jspdf-autotable.
 *
 * autoTable is called in functional form — autoTable(doc, {...}) — rather than
 * doc.autoTable({...}) to avoid the "Property 'autoTable' does not exist on
 * jsPDF" TypeScript error.
 */
export function exportPdf(
  lessons: ScheduledLesson[],
  course: Course,
  scopeLabel = 'Course',
): void {
  const doc = new jsPDF({ orientation: 'landscape' });

  // Mirror the Hybrid planner band: the title honours the chosen scope
  // ("Module: X" when scope is Per module), not a hardcoded "Course".
  doc.setFontSize(16);
  doc.text(`${scopeLabel}: ${course.name}`, 14, 16);

  doc.setFontSize(10);
  doc.text(
    `Modules: ${course.modules.map((m) => m.name).join(', ')}    Delivery: ${
      course.deliveryMode === 'series' ? 'Series' : 'Parallel'
    }`,
    14,
    23,
  );

  autoTable(doc, {
    head: [[...COLUMN_HEADERS]],
    body: lessons.map(rowFor),
    startY: 28,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
  });

  doc.save(`${fileStem(course.name)}-timetable.pdf`);
}

/**
 * Export as Excel — TODO.
 *
 * Intended to use SheetJS aoa_to_sheet over DATA_COLUMN_HEADERS + dataRowFor
 * (so the workbook carries both the ISO and display Date columns), header row,
 * sized columns, sheet "Timetable", file <classGroup>-timetable.xlsx. The
 * SheetJS 0.20.3 CDN
 * tarball required by the build spec is blocked by this environment's network
 * policy, and the public npm `xlsx` build was explicitly ruled out, so Excel
 * export is deferred. Wire this up once SheetJS is installable, then re-enable
 * the button in src/pages/TimetablePage.tsx.
 */
export function exportExcel(
  _lessons: ScheduledLesson[],
  _course: Course,
): void {
  // TODO: implement with SheetJS once the 0.20.3 dependency is available.
  throw new Error('Excel export is not available in this build.');
}
