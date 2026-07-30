import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Course, HolidaySet, ScheduledLesson } from './types';
import type { FirstDayOfWeek } from './shared/settings';
import { TEACHER_LABEL, CLASS_GROUP_LABEL, AL_LABEL } from './constants';
import { formatDisplayDate } from './shared/dates';
import { buildCalendarMonths, weekdayHeaders } from './calendarGrid';
import { addPageFooters, drawBrandHeaderBand, BRAND, BRAND_AL_TINT } from './shared/pdfBrand';

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
  CLASS_GROUP_LABEL,
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
  CLASS_GROUP_LABEL,
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

/** Course header band (UCC brand dark-blue), shared by the PDF layouts. */
function pdfHeader(doc: jsPDF, course: Course, scopeLabel: string): number {
  return drawBrandHeaderBand(doc, [
    `${scopeLabel}: ${course.name}`,
    `Modules: ${course.modules.map((m) => m.name).join(', ')}    Delivery: ${
      course.deliveryMode === 'series' ? 'Series' : 'Parallel'
    }`,
  ]);
}

/**
 * List-view PDF (landscape table) via jspdf-autotable.
 *
 * autoTable is called in functional form — autoTable(doc, {...}) — rather than
 * doc.autoTable({...}) to avoid the "Property 'autoTable' does not exist on
 * jsPDF" TypeScript error.
 */
export function exportListPdf(
  lessons: ScheduledLesson[],
  course: Course,
  scopeLabel = 'Course',
): void {
  const doc = new jsPDF({ orientation: 'landscape' });
  // Mirror the Hybrid planner band: the title honours the chosen scope
  // ("Module: X" when scope is Per module), not a hardcoded "Course".
  const startY = pdfHeader(doc, course, scopeLabel);

  autoTable(doc, {
    head: [[...COLUMN_HEADERS]],
    body: lessons.map(rowFor),
    startY,
    styles: { fontSize: 9, cellPadding: 2, textColor: BRAND.nearBlack },
    headStyles: { fillColor: BRAND.darkBlue, textColor: BRAND.white },
    alternateRowStyles: { fillColor: BRAND.grey },
  });

  addPageFooters(doc);
  doc.save(`${fileStem(course.name)}-timetable.pdf`);
}

// Cell fills for the calendar PDF, UCC brand palette. 'teaching' (a real
// lesson) is deliberately absent — it stays white/default so lesson cells
// read as the primary content against the coloured special-day cells.
const CAL_FILLS: Record<string, [number, number, number]> = {
  al: BRAND_AL_TINT,
  conflict: [250, 222, 222],
  weekend: BRAND.grey,
  schoolHoliday: BRAND.lightGold,
  publicHoliday: BRAND.gold,
  out: BRAND.grey,
};

/**
 * Calendar-view PDF: one month grid per section — 7 weekday columns in
 * first-day-of-week order, day number plus full class details per cell, AL
 * days marked, conflicted cells shaded, weekends/holidays coloured by the UCC
 * brand palette. Matches the on-screen Calendar view (`holidays` is optional
 * only so a caller without a generated holiday set doesn't have to pass one;
 * the Timetable page always has one once a schedule exists).
 */
export function exportCalendarPdf(
  lessons: ScheduledLesson[],
  course: Course,
  firstDayOfWeek: FirstDayOfWeek,
  scopeLabel = 'Course',
  holidays?: HolidaySet,
): void {
  const doc = new jsPDF({ orientation: 'landscape' });
  let y = pdfHeader(doc, course, scopeLabel);

  const months = buildCalendarMonths(lessons, firstDayOfWeek, holidays);
  const headers = weekdayHeaders(firstDayOfWeek);

  for (const m of months) {
    // Per-cell kind matrix aligned with the body for the colour hook.
    const kinds: string[][] = [];
    const body = m.weeks.map((week) => {
      const kindRow: string[] = [];
      const row = week.map((cell) => {
        if (!cell.inMonth) {
          kindRow.push('out');
          return '';
        }
        const real = cell.entries.filter((l) => l.kind === 'lesson');
        const al = cell.entries.some((l) => l.kind === 'AL');
        const conflicted = real.some((l) => (l.conflicts?.length ?? 0) > 0);
        kindRow.push(
          conflicted
            ? 'conflict'
            : real.length > 0
              ? 'teaching'
              : al
                ? 'al'
                : (cell.kind ?? 'blank'),
        );
        const lines = [String(cell.dayNum)];
        for (const l of real) {
          lines.push(
            `${(l.conflicts?.length ?? 0) > 0 ? '! ' : ''}${l.lessonName}`,
            `${l.startTime}-${l.endTime} ${l.teacher}`,
            `${l.classroom} · ${l.classGroup}`,
          );
        }
        if (real.length === 0 && al) lines.push(AL_LABEL);
        if (real.length === 0 && !al && cell.kind && cell.kind !== 'blank') {
          const label = cell.kind === 'weekend' ? 'Weekend' : cell.holidayName || cell.kind;
          lines.push(label);
        }
        return lines.join('\n');
      });
      kinds.push(kindRow);
      return row;
    });

    doc.setFontSize(12);
    doc.setTextColor(...BRAND.darkBlue);
    doc.text(`${m.monthName} ${m.year}`, 14, y + 6);
    doc.setTextColor(0, 0, 0);
    autoTable(doc, {
      head: [headers],
      body,
      startY: y + 9,
      styles: {
        fontSize: 7,
        cellPadding: 1.5,
        valign: 'top',
        minCellHeight: 14,
        textColor: BRAND.nearBlack,
      },
      headStyles: { fillColor: BRAND.darkBlue, textColor: BRAND.white, halign: 'center' },
      alternateRowStyles: { fillColor: BRAND.grey },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const kind = kinds[data.row.index]?.[data.column.index];
        if (kind && CAL_FILLS[kind]) data.cell.styles.fillColor = CAL_FILLS[kind];
        if (kind === 'out') data.cell.styles.textColor = [160, 168, 180];
      },
    });
    y =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? y;
    y += 8;
    // New page when the next month would not fit.
    if (y > doc.internal.pageSize.getHeight() - 60 && m !== months[months.length - 1]) {
      doc.addPage();
      y = 14;
    }
  }

  addPageFooters(doc);
  doc.save(`${fileStem(course.name)}-calendar.pdf`);
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
