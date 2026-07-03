import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ClassGroupConfig, ScheduledLesson } from './types';
import { TEACHER_LABEL } from './constants';
import { formatDisplayDate } from './dateUtils';

// The nine on-screen / PDF columns, in order. TEACHER_LABEL keeps the "Teacher"
// header (and its field label) in a single place. The Date column shows the
// human display format; ISO stays the internal value.
export const COLUMN_HEADERS = [
  'Lesson No',
  'Lesson Name',
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
  'Lesson Name',
  'Date (ISO)',
  'Date',
  'Day',
  'Start Time',
  'End Time',
  TEACHER_LABEL,
  'Classroom',
  'Class Group',
] as const;

/** Nine cells for the on-screen table / PDF (Date shown as DD MMMM YYYY). */
const rowFor = (l: ScheduledLesson): string[] => [
  String(l.lessonNo),
  l.lessonName,
  formatDisplayDate(l.date),
  l.day,
  l.startTime,
  l.endTime,
  l.teacher,
  l.classroom,
  l.classGroup,
];

/** Ten cells for data exports: ISO date plus display date. */
export const dataRowFor = (l: ScheduledLesson): string[] => [
  String(l.lessonNo),
  l.lessonName,
  l.date,
  formatDisplayDate(l.date),
  l.day,
  l.startTime,
  l.endTime,
  l.teacher,
  l.classroom,
  l.classGroup,
];

/** Sanitise a class group into a safe filename stem. */
const fileStem = (classGroup: string): string =>
  (classGroup.trim() || 'timetable').replace(/[^\w.-]+/g, '-');

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
export function exportCsv(
  lessons: ScheduledLesson[],
  config: ClassGroupConfig,
): void {
  const lines = [
    DATA_COLUMN_HEADERS.map(csvQuote).join(','),
    ...lessons.map((l) => dataRowFor(l).map(csvQuote).join(',')),
  ];
  const blob = new Blob([lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  download(blob, `${fileStem(config.classGroup)}-timetable.csv`);
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
  config: ClassGroupConfig,
): void {
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(16);
  doc.text(config.courseName, 14, 16);

  doc.setFontSize(10);
  doc.text(
    `Class Group: ${config.classGroup}    ${TEACHER_LABEL}: ${config.teacher}    Classroom: ${config.classroom}`,
    14,
    23,
  );

  autoTable(doc, {
    head: [COLUMN_HEADERS as unknown as string[]],
    body: lessons.map(rowFor),
    startY: 28,
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [37, 99, 235], textColor: 255 },
  });

  doc.save(`${fileStem(config.classGroup)}-timetable.pdf`);
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
 * the button in App.tsx.
 */
export function exportExcel(
  _lessons: ScheduledLesson[],
  _config: ClassGroupConfig,
): void {
  // TODO: implement with SheetJS once the 0.20.3 dependency is available.
  throw new Error('Excel export is not available in this build.');
}
