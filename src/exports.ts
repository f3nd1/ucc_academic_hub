import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Course, HolidaySet, ScheduledLesson } from './types';
import type { FirstDayOfWeek } from './shared/settings';
import { TEACHER_LABEL, CLASS_GROUP_LABEL, AL_LABEL } from './constants';
import { formatDisplayDate } from './shared/dates';
import { buildCalendarMonths, weekdayHeaders } from './calendarGrid';
import {
  addPageFooters,
  drawPlainHeader,
  loadLogoDataUrl,
  buildModuleColorMap,
  BRAND,
  BRAND_AL_TINT,
  BRAND_GRID_STYLE,
} from './shared/pdfBrand';

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

/** Plain black-on-white course header, shared by the PDF layouts. */
async function pdfHeader(doc: jsPDF, course: Course, scopeLabel: string): Promise<number> {
  const logoDataUrl = await loadLogoDataUrl();
  return drawPlainHeader(
    doc,
    [
      `${scopeLabel}: ${course.name}`,
      `Modules: ${course.modules.map((m) => m.name).join(', ')}`,
    ],
    logoDataUrl,
  );
}

/**
 * List-view PDF (landscape table) via jspdf-autotable.
 *
 * autoTable is called in functional form — autoTable(doc, {...}) — rather than
 * doc.autoTable({...}) to avoid the "Property 'autoTable' does not exist on
 * jsPDF" TypeScript error.
 */
export async function exportListPdf(
  lessons: ScheduledLesson[],
  course: Course,
  scopeLabel = 'Course',
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape' });
  // Mirror the Hybrid planner band: the title honours the chosen scope
  // ("Module: X" when scope is Per module), not a hardcoded "Course".
  const startY = await pdfHeader(doc, course, scopeLabel);

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
export async function exportCalendarPdf(
  lessons: ScheduledLesson[],
  course: Course,
  firstDayOfWeek: FirstDayOfWeek,
  scopeLabel = 'Course',
  holidays?: HolidaySet,
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
  const logoDataUrl = await loadLogoDataUrl();
  const headerLines = [
    `${scopeLabel}: ${course.name}`,
    `Modules: ${course.modules.map((m) => m.name).join(', ')}`,
  ];

  const months = buildCalendarMonths(lessons, firstDayOfWeek, holidays);
  const headers = weekdayHeaders(firstDayOfWeek);
  // Same deterministic module->colour mapping the Hybrid PDF builds from
  // this same course.modules array, so a given module reads as the same
  // colour in both exports.
  const moduleColorMap = buildModuleColorMap(course.modules);

  // Fixed-width grid: all 7 weekday columns get an identical, content-independent
  // share of the page's printable width, so column widths never shift between a
  // light month and a heavy one (a day with several same-day sessions grows in
  // height, never in width).
  // FOOTER_RESERVE is also passed to autoTable as margin.bottom, so
  // autoTable's own page-break decision agrees with the space this function
  // reserves below the table — without that, autoTable used its own default
  // bottom margin, decided the last, taller row didn't fit, and split that
  // row's content onto a spillover page.
  const FOOTER_RESERVE = 17; // copyright + AL legend lines
  const margin = { left: 14, right: 14, bottom: FOOTER_RESERVE };
  const usableWidth = doc.internal.pageSize.getWidth() - margin.left - margin.right;
  const colWidth = usableWidth / 7;
  const columnStyles = Object.fromEntries(
    Array.from({ length: 7 }, (_, i) => [i, { cellWidth: colWidth }]),
  );

  // Fixed, page-filling row height: divide the vertical space actually left
  // over — after the plain-text header, the month title, the head row, and
  // the footer/legend reserve — by the month's own week-row count, so every
  // month (4, 5, or 6 weeks) uses the full page rather than leaving blank
  // space below a grid sized only to its content (autoTable's minCellHeight
  // is a floor, not an exact height, so this is computed as the floor value,
  // with a small safety factor below the exact fit — the head row's real
  // rendered height runs slightly over the estimate below).
  const pageHeight = doc.internal.pageSize.getHeight();
  const HEAD_ROW_HEIGHT = 9; // weekday header row ("Mon".."Sun")
  const ROW_HEIGHT_SAFETY_FACTOR = 0.85;

  months.forEach((m, monthIndex) => {
    // One month per page: every month after the first starts on a fresh page,
    // so the header band is never missing on a continuation page (previously
    // it only ever appeared once at the very top of page 1, so any page break
    // — light course or heavy — left later months with no header at all,
    // reading as if the band had been clipped off).
    if (monthIndex > 0) doc.addPage();
    const headerY = drawPlainHeader(doc, headerLines, logoDataUrl);

    // Per-cell kind matrix aligned with the body for the colour hook. A
    // 'teaching' cell also resolves to a specific module colour when every
    // real entry in it shares one module id — a day mixing sessions from
    // two different modules (parallel delivery) has no single module to
    // tint it by, so it's left with no module fill rather than picking one
    // arbitrarily and misattributing the other entry's colour.
    const kinds: string[][] = [];
    const moduleFills: ([number, number, number] | null)[][] = [];
    const body = m.weeks.map((week) => {
      const kindRow: string[] = [];
      const fillRow: ([number, number, number] | null)[] = [];
      const row = week.map((cell) => {
        if (!cell.inMonth) {
          kindRow.push('out');
          fillRow.push(null);
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
        const moduleIds = new Set(real.map((l) => l.moduleId));
        fillRow.push(
          !conflicted && moduleIds.size === 1
            ? (moduleColorMap.get(real[0].moduleId) ?? null)
            : null,
        );
        // The day number is drawn separately (didDrawCell) in a larger, bold,
        // brand dark-blue style so it reads as the cell's primary anchor;
        // the body text here carries only the lesson/holiday detail lines.
        const lines: string[] = [];
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
      moduleFills.push(fillRow);
      return row;
    });

    const tableStartY = headerY + 9;
    const availableHeight = pageHeight - tableStartY - HEAD_ROW_HEIGHT - FOOTER_RESERVE;
    const minCellHeight = Math.max(
      14,
      (availableHeight / m.weeks.length) * ROW_HEIGHT_SAFETY_FACTOR,
    );

    doc.setFontSize(12);
    doc.setTextColor(...BRAND.darkBlue);
    doc.text(`${m.monthName} ${m.year}`, 14, headerY + 6);
    doc.setTextColor(0, 0, 0);
    autoTable(doc, {
      head: [headers],
      body,
      startY: tableStartY,
      margin: { ...margin, top: headerY },
      // A row that doesn't quite fit moves whole to the next page rather
      // than splitting its content across two pages (the default 'auto'
      // produced a near-empty spillover page: the last row's computed
      // height ran a hair over the remaining space, so its detail text was
      // silently dropped rather than following the row).
      rowPageBreak: 'avoid',
      tableWidth: usableWidth,
      columnStyles,
      styles: {
        fontSize: 7,
        // Extra top padding reserves room for the larger date number drawn
        // above the lesson-detail lines in didDrawCell, without the two
        // overlapping.
        cellPadding: { top: 5, right: 1.5, bottom: 1.5, left: 1.5 },
        valign: 'top',
        minCellHeight,
        textColor: BRAND.nearBlack,
        ...BRAND_GRID_STYLE,
      },
      headStyles: { fillColor: BRAND.darkBlue, textColor: BRAND.white, halign: 'center' },
      alternateRowStyles: { fillColor: BRAND.grey },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const kind = kinds[data.row.index]?.[data.column.index];
        if (kind === 'teaching') {
          const moduleFill = moduleFills[data.row.index]?.[data.column.index];
          if (moduleFill) data.cell.styles.fillColor = moduleFill;
        } else if (kind && CAL_FILLS[kind]) {
          data.cell.styles.fillColor = CAL_FILLS[kind];
        }
        if (kind === 'out') data.cell.styles.textColor = [160, 168, 180];
      },
      didDrawCell: (data) => {
        if (data.section !== 'body') return;
        const cell = m.weeks[data.row.index]?.[data.column.index];
        if (!cell || !cell.inMonth) return;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...BRAND.darkBlue);
        doc.text(String(cell.dayNum), data.cell.x + 1.5, data.cell.y + 4.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...BRAND.nearBlack);
      },
      didDrawPage: () => {
        drawPlainHeader(doc, headerLines, logoDataUrl);
      },
    });
  });

  addPageFooters(doc, `${AL_LABEL} = Autonomous Learning`);
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
