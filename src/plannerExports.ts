import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  PlannerModel,
  PlannerMonth,
  PlannerCell,
  PlannerColumnMode,
} from './planner';
import {
  activityText,
  columnModeLabel,
  dateText,
  entryTimeRange,
  lessonLines,
  teacherLines,
} from './planner';
import { requestSheetsToken } from './googleSheets';
import { parseLocal } from './shared/dates';
import { AL_LABEL } from './constants';
import type { Course } from './types';
import {
  addPageFooters,
  drawPlainHeader,
  hyphenateLongWords,
  loadLogoDataUrl,
  buildModuleColorMap,
  outerBorderLineWidth,
  BRAND,
  BRAND_AL_TINT,
  BRAND_GRID_STYLE,
} from './shared/pdfBrand';

/** BRAND's 0-255 channels as 0-1 fractions, for Sheets' colour objects. */
const unit = (rgb: readonly [number, number, number]): [number, number, number] => [
  rgb[0] / 255,
  rgb[1] / 255,
  rgb[2] / 255,
];

// Shared flat layout for both planner exports (CSV + Google Sheets). Rows/cols
// are 0-indexed. Columns: 0 = month label, 1 = weekday, then each week is four
// columns (Date, Activity, Lesson, Teacher).

interface Fill {
  r: number;
  c: number;
  rgb: [number, number, number];
}
interface Merge {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
} // end-exclusive

interface Layout {
  values: string[][];
  merges: Merge[];
  fills: Fill[]; // activity-cell background by kind
  headers: { r: number; c: number }[]; // bold header cells
}

// UCC brand palette, shared with the PDF export via unit() (Sheets colours are
// 0-1 fractions, PDF/canvas colours are 0-255). 'teaching' (a real lesson) is
// deliberately absent — it stays white/default, the primary content against
// the coloured special-day cells. 'conflict' is unrelated to the brand
// palette (a distinct problem indicator) and keeps its existing colour.
const FILL: Record<string, [number, number, number]> = {
  al: unit(BRAND_AL_TINT),
  weekend: unit(BRAND.grey),
  schoolHoliday: unit(BRAND.lightGold),
  publicHoliday: unit(BRAND.gold),
  conflict: [0.96, 0.7, 0.7],
};

const fillFor = (cell: PlannerCell): [number, number, number] | null =>
  cell.conflict ? FILL.conflict : (FILL[cell.kind] ?? null);

/** Ensure row `r` exists and is at least `width` wide, then return it. */
function ensureRow(values: string[][], r: number, width: number): string[] {
  while (values.length <= r) values.push([]);
  const row = values[r];
  while (row.length < width) row.push('');
  return row;
}

const put = (
  values: string[][],
  r: number,
  c: number,
  text: string,
  width: number,
) => {
  ensureRow(values, r, width)[c] = text;
};

/** Build the flat planner layout. `teacherJoin` separates label/teacher lines. */
export function buildPlannerLayout(
  model: PlannerModel,
  teacherJoin: string,
  columnMode: PlannerColumnMode = 'activity',
): Layout {
  const columnLabel = columnModeLabel(columnMode);
  const values: string[][] = [];
  const merges: Merge[] = [];
  const fills: Fill[] = [];
  const headers: { r: number; c: number }[] = [];

  const totalWidth = (weeks: number) => 2 + weeks * 4;

  put(values, 0, 0, `${model.scopeLabel}:`, 2);
  put(values, 0, 1, model.course, 2);
  put(values, 1, 0, 'Timing:', 2);
  put(values, 1, 1, model.timing, 2);
  put(values, 2, 0, 'Updated:', 2);
  put(values, 2, 1, model.updatedDisplay, 2);
  headers.push({ r: 0, c: 0 }, { r: 1, c: 0 }, { r: 2, c: 0 });

  let row = 4; // blank row 3 between band and first month

  for (const m of model.months) {
    const width = totalWidth(m.weeks);
    const h1 = row;
    const h2 = row + 1;
    const bodyStart = row + 2;

    // Corner (month + year), merged across the two header rows and two cols.
    put(values, h1, 0, `${m.monthName} ${m.year}`, width);
    headers.push({ r: h1, c: 0 });
    merges.push({ r0: h1, r1: h1 + 2, c0: 0, c1: 2 });

    // Week N grouped headers + Date/Activity-or-Module/Lesson/Teacher sub-headers.
    for (let w = 0; w < m.weeks; w++) {
      const c = 2 + w * 4;
      put(values, h1, c, `Week ${w + 1}`, width);
      headers.push({ r: h1, c });
      merges.push({ r0: h1, r1: h1 + 1, c0: c, c1: c + 4 });
      put(values, h2, c, 'Date', width);
      put(values, h2, c + 1, columnLabel, width);
      put(values, h2, c + 2, 'Lesson', width);
      put(values, h2, c + 3, 'Teacher', width);
      headers.push(
        { r: h2, c },
        { r: h2, c: c + 1 },
        { r: h2, c: c + 2 },
        { r: h2, c: c + 3 },
      );
    }

    // 7 weekday rows.
    for (let r = 0; r < 7; r++) {
      const rowIndex = bodyStart + r;
      if (r === 0) put(values, rowIndex, 0, m.monthName, width);
      put(values, rowIndex, 1, model.weekdayLabels[r], width);
      for (let w = 0; w < m.weeks; w++) {
        const cell = m.grid[r][w];
        const c = 2 + w * 4;
        put(values, rowIndex, c, dateText(cell), width);
        put(values, rowIndex, c + 1, activityText(cell, columnMode), width);
        put(
          values,
          rowIndex,
          c + 2,
          lessonLines(cell).join(teacherJoin),
          width,
        );
        put(
          values,
          rowIndex,
          c + 3,
          teacherLines(cell).join(teacherJoin),
          width,
        );
        const rgb = fillFor(cell);
        if (rgb) fills.push({ r: rowIndex, c: c + 1, rgb });
      }
    }
    // Merge the month label down its 7 body rows.
    merges.push({ r0: bodyStart, r1: bodyStart + 7, c0: 0, c1: 1 });

    row = bodyStart + 7 + 1; // blank spacer row before next month
  }

  return { values, merges, fills, headers };
}

// ---------------------------------------------------------------------------
// CSV planner (no OAuth needed)
// ---------------------------------------------------------------------------
const csvQuote = (v: string) => `"${v.replace(/"/g, '""')}"`;
const fileStem = (s: string) => (s.trim() || 'planner').replace(/[^\w.-]+/g, '-');

export function exportPlannerCsv(
  model: PlannerModel,
  columnMode: PlannerColumnMode = 'activity',
): void {
  const { values } = buildPlannerLayout(model, ' / ', columnMode);
  const width = values.reduce((m, r) => Math.max(m, r.length), 0);
  const lines = values.map((r) => {
    const padded = [...r];
    while (padded.length < width) padded.push('');
    return padded.map(csvQuote).join(',');
  });
  const blob = new Blob([lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileStem(model.course)}-planner.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Google Sheets planner (merges + colour fills, dates as DD MMMM YYYY text)
// ---------------------------------------------------------------------------
export interface PlannerSheetsResult {
  ok: boolean;
  message: string;
  url?: string;
}

export async function exportPlannerToSheets(
  model: PlannerModel,
  clientId: string,
  columnMode: PlannerColumnMode = 'activity',
): Promise<PlannerSheetsResult> {
  if (!clientId.trim())
    return {
      ok: false,
      message:
        'No Google OAuth client ID set in Settings. Use "Planner (CSV)" instead, or add a client ID to export to Google Sheets.',
    };
  if (model.months.length === 0)
    return { ok: false, message: 'Generate a timetable first.' };

  let token: string;
  try {
    token = await requestSheetsToken(clientId);
  } catch (err) {
    return {
      ok: false,
      message: `Google authorisation failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
  const auth = { Authorization: `Bearer ${token}` };

  const { values, merges, fills, headers } = buildPlannerLayout(
    model,
    '\n',
    columnMode,
  );

  try {
    // Create the spreadsheet with a "Planner" sheet.
    const createRes = await fetch(
      'https://sheets.googleapis.com/v4/spreadsheets',
      {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          properties: { title: `${model.course || 'Course'} Planner` },
          sheets: [{ properties: { title: 'Planner' } }],
        }),
      },
    );
    if (!createRes.ok)
      return {
        ok: false,
        message: `Sheets create failed (${createRes.status} ${createRes.statusText}).`,
      };
    const created = (await createRes.json()) as {
      spreadsheetId: string;
      spreadsheetUrl: string;
      sheets: { properties: { sheetId: number } }[];
    };
    const sheetId = created.sheets[0].properties.sheetId;

    // Write values (RAW so DD MMMM YYYY stays literal text, never a serial).
    const updateRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}/values/Planner!A1?valueInputOption=RAW`,
      {
        method: 'PUT',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      },
    );
    if (!updateRes.ok)
      return {
        ok: false,
        message: `Planner created but writing values failed (${updateRes.status}).`,
        url: created.spreadsheetUrl,
      };

    // Merges + colour fills + bold headers.
    const requests: unknown[] = [];
    for (const m of merges) {
      requests.push({
        mergeCells: {
          mergeType: 'MERGE_ALL',
          range: {
            sheetId,
            startRowIndex: m.r0,
            endRowIndex: m.r1,
            startColumnIndex: m.c0,
            endColumnIndex: m.c1,
          },
        },
      });
    }
    for (const f of fills) {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: f.r,
            endRowIndex: f.r + 1,
            startColumnIndex: f.c,
            endColumnIndex: f.c + 1,
          },
          cell: {
            userEnteredFormat: {
              backgroundColor: { red: f.rgb[0], green: f.rgb[1], blue: f.rgb[2] },
            },
          },
          fields: 'userEnteredFormat.backgroundColor',
        },
      });
    }
    for (const h of headers) {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: h.r,
            endRowIndex: h.r + 1,
            startColumnIndex: h.c,
            endColumnIndex: h.c + 1,
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                bold: true,
                foregroundColor: { red: 1, green: 1, blue: 1 },
              },
              backgroundColor: {
                red: unit(BRAND.darkBlue)[0],
                green: unit(BRAND.darkBlue)[1],
                blue: unit(BRAND.darkBlue)[2],
              },
            },
          },
          fields: 'userEnteredFormat(textFormat,backgroundColor)',
        },
      });
    }

    const fmtRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${created.spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      },
    );
    if (!fmtRes.ok)
      return {
        ok: true,
        message: `Planner written; formatting step returned ${fmtRes.status}. The sheet is still usable.`,
        url: created.spreadsheetUrl,
      };

    return {
      ok: true,
      message: 'Planner Google Sheet created.',
      url: created.spreadsheetUrl,
    };
  } catch (err) {
    return {
      ok: false,
      message: `Planner export failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    };
  }
}


// ---------------------------------------------------------------------------
// Planner (Hybrid) PDF — the matrix layout, matching the on-screen view and
// the Planner Sheets export: month blocks, weekday rows, Week N columns with
// Date/Activity/Lesson/Teacher sub-cells, colour-coded special days. Every
// visible date stays DD MMMM YYYY (the planner model only carries display
// text).
// ---------------------------------------------------------------------------

const to255 = (rgb: [number, number, number]): [number, number, number] =>
  [Math.round(rgb[0] * 255), Math.round(rgb[1] * 255), Math.round(rgb[2] * 255)];

// Reference font size used to measure header-label width; the exported font
// for a given month's table is scaled down from this so the labels never
// wrap mid-word (jsPDF's getTextWidth scales linearly with font size).
const REFERENCE_FONT_SIZE = 6.5;
const MIN_FONT_SIZE = 4.5;
const SUB_COLUMN_PADDING_MM = 2.4; // cellPadding 1.2mm left + right
// Comfortable safety margin below the exact fit: getTextWidth measures the
// glyphs alone, but autoTable's own wrap decision leaves less room than that
// in practice, so targeting the exact available width still wrapped labels
// right at the boundary.
const FIT_SAFETY_FACTOR = 0.82;
// Holds a 3-letter weekday abbreviation ("Mon") plus the "Day" head label —
// both far narrower than the "Monday" this was originally sized for, so this
// shrank from 16mm once the weekday labels themselves went to 3 letters.
const WEEKDAY_COL_WIDTH_MM = 10;
// Every Hybrid PDF page is sized against a 5-week template, never against
// however many week-columns the current month actually has. A 6-week month
// splits across two pages (weeks 1-5, then week 6 alone) instead of shrinking
// every column to squeeze a 6th week onto one page — see exportPlannerPdf.
const PAGE_WEEK_BUDGET = 5;

/** Widest single space-separated word across `texts`, at the doc's current font size. */
function widestWordMm(doc: jsPDF, texts: string[]): number {
  let widest = 0;
  for (const text of texts) {
    for (const line of text.split('\n')) {
      for (const word of line.split(' ')) {
        if (!word) continue;
        const w = doc.getTextWidth(word);
        if (w > widest) widest = w;
      }
    }
  }
  return widest;
}

/**
 * Pick a font size so the widest UNBREAKABLE piece of text — a sub-column
 * header label ("Activity"), or a single long word in the body — fits inside
 * `colWidthMm` at that size. Column width is set EXPLICITLY (via columnStyles
 * below) rather than left to autoTable's own content-based 'auto' sizing —
 * the two disagreed in practice: a 6-week month's Date/Module/Lesson/Teacher
 * labels still wrapped into fragments like "Lesso"/"n" even when scaled
 * against autoTable's actual computed width, because 'auto' mode weights
 * columns by their body content (e.g. "Data Fundamentals") much more than the
 * short header labels. Fixing the width ourselves makes the fit fully
 * predictable.
 *
 * `bodyTexts` joined the calculation once single words started overflowing
 * too: a long lesson name ("Representing") and a session's time range
 * ("09:30-12:30") are both unbreakable at a space, and autoTable splits an
 * over-wide word at whatever character overflows, so "Representing" rendered
 * as "Repre senting". Sizing against the widest body word keeps whole words
 * whole wherever the size budget allows; anything still too wide once
 * MIN_FONT_SIZE is hit gets an explicit hyphen instead (hyphenateLongWords).
 */
function fontSizeForColumnWidth(
  doc: jsPDF,
  columnLabel: string,
  colWidthMm: number,
  bodyTexts: string[],
): number {
  doc.setFontSize(REFERENCE_FONT_SIZE);
  const widestLabelMm = Math.max(
    doc.getTextWidth('Date'),
    doc.getTextWidth(columnLabel),
    doc.getTextWidth('Lesson'),
    doc.getTextWidth('Teacher'),
    widestWordMm(doc, bodyTexts),
  );
  const availableMm = (colWidthMm - SUB_COLUMN_PADDING_MM) * FIT_SAFETY_FACTOR;
  if (widestLabelMm <= availableMm) return REFERENCE_FONT_SIZE;
  const scaled = REFERENCE_FONT_SIZE * (availableMm / widestLabelMm);
  return Math.max(MIN_FONT_SIZE, scaled);
}

// Short month names for the PDF's compact date form ("29 Jul 26"). A local
// list rather than a shared/dates export — every other export in the app
// (view, CSV, Sheets) deliberately keeps the full DD MMMM YYYY form, so this
// stays scoped to the PDF's own tight page budget.
const MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** Compact "29 Jul 26" form of an ISO date, for the PDF's Date sub-column only. */
function compactDate(iso: string): string {
  const d = parseLocal(iso);
  const day = String(d.getDate()).padStart(2, '0');
  const year2 = String(d.getFullYear()).slice(-2);
  return `${day} ${MONTH_NAMES_SHORT[d.getMonth()]} ${year2}`;
}

/**
 * PDF-only Date sub-column text: same blank/weekend-dash rules as the shared
 * `dateText()`, but the compact "29 Jul 26" form instead of the on-screen/
 * CSV/Sheets "29 July 2026" — the Hybrid PDF's page is the one place tight
 * enough on width to need it.
 */
function pdfDateText(cell: PlannerCell): string {
  if (cell.kind === 'empty' || cell.kind === 'blank') return '';
  if (cell.kind === 'weekend') return '-';
  return cell.dateIso ? compactDate(cell.dateIso) : '';
}

/**
 * The Module/Activity, Lesson, and Teacher texts for one cell, ONE LINE PER
 * SESSION, with each teaching session's own time range above its lesson name.
 *
 * A date carrying a morning and an afternoon session of the same module used
 * to render each column as its entries joined into a single run of text
 * ("Listening and Viewing / Listening and Viewing", "Vocabulary Vocabulary"),
 * which once autoTable had wrapped it read as one cramped, duplicated string
 * with nothing to say there were two sessions, let alone when each ran. Every
 * session now occupies its own line, and the time range is what distinguishes
 * two otherwise identical sessions. That time also carries the information the
 * header's old "Timing:" line used to, which is why it is shown for every
 * teaching session rather than only for the multi-session days that forced it.
 *
 * Every column lays each session out over the SAME two lines — the time range,
 * then the lesson name — so a module name and a teacher stay LEVEL with the
 * session they belong to. Packing each column's values up from the top
 * instead put "Ms Tan" on the first line of a day whose first session was
 * someone else's, which is worse than cramped: it misattributes the teacher.
 *
 * Blank fields leave an empty line rather than a placeholder, and trailing
 * blanks are trimmed so an all-blank column (Teacher, Classroom, and Module
 * Class Details are all optional) comes out genuinely empty and costs the row
 * no extra height.
 */
export function cellTexts(
  cell: PlannerCell,
  columnMode: PlannerColumnMode,
): [string, string, string] {
  if (cell.kind !== 'teaching') {
    return [
      activityText(cell, columnMode),
      lessonLines(cell).join('\n'),
      teacherLines(cell).join('\n'),
    ];
  }
  const entries = cell.entries ?? [];
  const lines = (of: string[]): string => {
    const out = [...of];
    while (out.length > 0 && out[out.length - 1] === '') out.pop();
    return out.join('\n');
  };
  return [
    lines(
      entries.flatMap((e) => [
        columnMode === 'module' ? e.moduleName : (e.activity ?? ''),
        '',
      ]),
    ),
    lines(entries.flatMap((e) => [entryTimeRange(e), e.lessonName])),
    lines(entries.flatMap((e) => [e.teacher, ''])),
  ];
}

export async function exportPlannerPdf(
  model: PlannerModel,
  course: Course,
  columnMode: PlannerColumnMode = 'activity',
): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', format: 'a4' });
  const logoDataUrl = await loadLogoDataUrl();
  // Same deterministic module->colour mapping the Calendar PDF builds from
  // this same course.modules array, so a given module reads as the same
  // colour in both exports.
  const moduleColorMap = buildModuleColorMap(course.modules);
  const columnLabel = columnModeLabel(columnMode);
  // No "Timing:" line: with per-module windows it usually only ever said
  // "varies by module", and each session now carries its own time in the grid.
  const headerLines = [
    `${model.scopeLabel}: ${model.course}`,
    `Updated: ${model.updatedDisplay}`,
  ];
  const margin = { left: 14, right: 14 };
  const usableWidth = doc.internal.pageSize.getWidth() - margin.left - margin.right;

  // Column width is derived from a FIXED 5-week-per-page budget, never from
  // however many weeks the current month actually has — every page (a full
  // 5-week page or a 1-week continuation page) gets the same comfortable
  // column width, and a 6-week month splits across two pages instead of
  // shrinking every column to squeeze a 6th week in (see the months.forEach
  // loop below).
  const subColWidth = (usableWidth - WEEKDAY_COL_WIDTH_MM) / (PAGE_WEEK_BUDGET * 4);
  // Every body string the grid will hold, gathered up front so the font size
  // can be sized against the widest single word in the real content (not just
  // the header labels) before any table is laid out.
  const allBodyTexts = model.months.flatMap((m) =>
    m.grid.flatMap((row) => row.flatMap((cell) => cellTexts(cell, columnMode))),
  );
  const fontSize = fontSizeForColumnWidth(doc, columnLabel, subColWidth, allBodyTexts);
  // Anything still wider than its column at that size gets an explicit hyphen
  // rather than autoTable's unmarked mid-word split.
  const textWidthMm = subColWidth - SUB_COLUMN_PADDING_MM;
  const fit = (text: string) => hyphenateLongWords(doc, text, textWidthMm, fontSize);
  const columnStyles: Record<number, { cellWidth: number }> = {
    0: { cellWidth: WEEKDAY_COL_WIDTH_MM },
  };
  for (let c = 1; c <= PAGE_WEEK_BUDGET * 4; c++) columnStyles[c] = { cellWidth: subColWidth };

  /**
   * Render one page's worth of week-columns (weeks `weekStart..weekStart +
   * weekCount - 1` of month `m`, 0-indexed) — either a full month (weekCount
   * === m.weeks) or one slice of a split 6-week month. `titleSuffix` marks a
   * continuation page (" (cont.)") so it's clear it's still the same month.
   */
  function renderWeekPage(
    m: PlannerMonth,
    weekStart: number,
    weekCount: number,
    titleSuffix: string,
  ) {
    const y = drawPlainHeader(doc, headerLines, logoDataUrl);

    // Month/year sits above the table (matching the Calendar PDF's month
    // title) rather than in a table column — a table corner cell narrow
    // enough to fit the 5-week budget has no room left for "August 2026".
    doc.setFontSize(12);
    doc.setTextColor(...BRAND.darkBlue);
    doc.text(`${m.monthName} ${m.year}${titleSuffix}`, 14, y + 6);
    doc.setTextColor(0, 0, 0);
    const tableStartY = y + 9;

    const head = [
      [
        { content: 'Day', rowSpan: 2 },
        ...Array.from({ length: weekCount }, (_, w) => ({
          content: `Week ${weekStart + w + 1}`,
          colSpan: 4,
        })),
      ],
      Array.from({ length: weekCount }).flatMap(() => [
        'Date',
        columnLabel,
        'Lesson',
        'Teacher',
      ]),
    ];

    // Body: weekday label starts each row; cells from cellTexts (one line per
    // session, each teaching session prefixed by its own time range) run
    // through only the PDF-only compact date helper. Module/Activity, Lesson,
    // and Teacher all show their full text — none of them are cut short; a
    // name too wide for one line wraps across lines via autoTable's own
    // default wrap (the row simply grows taller), with `fit` hyphenating any
    // single word too long to fit even that. An AL cell collapses its
    // Module/Lesson/Teacher trio (three near-empty cells: "AL", "-", "-")
    // into one merged cell — there was never going to be a lesson or teacher
    // on a buffer day.
    type BodyCell = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
    const body: BodyCell[][] = Array.from({ length: 7 }, (_, r) => {
      const cells: BodyCell[] = [model.weekdayLabels[r].slice(0, 3)];
      for (let w = weekStart; w < weekStart + weekCount; w++) {
        const cell = m.grid[r][w];
        if (cell.kind === 'al') {
          cells.push(
            pdfDateText(cell),
            {
              content: activityText(cell, columnMode),
              colSpan: 3,
              styles: { halign: 'center' },
            },
          );
        } else {
          const [activity, lesson, teacher] = cellTexts(cell, columnMode);
          cells.push(
            pdfDateText(cell),
            fit(activity),
            fit(lesson),
            fit(teacher),
          );
        }
      }
      return cells;
    });

    const tableWidth = WEEKDAY_COL_WIDTH_MM + weekCount * 4 * subColWidth;

    autoTable(doc, {
      head,
      body,
      startY: tableStartY,
      // Reserves the header band's height on any page autoTable itself adds
      // (a single page's 7 rows practically never overflow one page, but
      // this keeps the header from ever being skipped if one ever does), and
      // didDrawPage repaints it on every such page.
      margin: { ...margin, top: y },
      tableWidth,
      columnStyles,
      styles: {
        fontSize,
        cellPadding: 1.2,
        valign: 'top',
        textColor: BRAND.nearBlack,
        ...BRAND_GRID_STYLE,
      },
      headStyles: {
        fillColor: BRAND.darkBlue,
        textColor: BRAND.white,
        halign: 'center',
      },
      alternateRowStyles: { fillColor: BRAND.grey },
      didParseCell: (data) => {
        data.cell.styles.lineWidth = outerBorderLineWidth(data);
        if (data.section !== 'body') return;
        const col = data.column.index;
        if (col < 1) return;
        const offset = (col - 1) % 4; // 0=Date, 1=Module/Activity, 2=Lesson, 3=Teacher
        if (offset === 0) return; // Date column: never tinted
        const week = weekStart + Math.floor((col - 1) / 4);
        const cell = m.grid[data.row.index]?.[week];
        if (!cell) return;

        if (cell.kind === 'teaching' && !cell.conflict) {
          // Module/Lesson/Teacher all share the session's module tint —
          // same deterministic colour as the Calendar PDF for this module.
          // A cell mixing entries from two different modules (parallel
          // delivery) has no single module to tint it by, so it's left
          // uncoloured rather than picking one arbitrarily.
          const moduleIds = new Set((cell.entries ?? []).map((e) => e.moduleId));
          if (moduleIds.size === 1) {
            const rgb = moduleColorMap.get(cell.entries![0].moduleId);
            if (rgb) data.cell.styles.fillColor = rgb;
          }
          return;
        }
        if (offset !== 1) return; // conflict/weekend/holiday/AL: Module/Activity column only, as before
        const rgb = cell.conflict ? FILL.conflict : FILL[cell.kind];
        if (rgb) data.cell.styles.fillColor = to255(rgb);
      },
      didDrawPage: () => {
        drawPlainHeader(doc, headerLines, logoDataUrl);
      },
    });
  }

  model.months.forEach((m, monthIndex) => {
    // One month per page (or two, for a 6-week month): every month after the
    // first starts on a fresh page.
    if (monthIndex > 0) doc.addPage();
    const firstPageWeeks = Math.min(m.weeks, PAGE_WEEK_BUDGET);
    renderWeekPage(m, 0, firstPageWeeks, '');
    if (m.weeks > PAGE_WEEK_BUDGET) {
      doc.addPage();
      renderWeekPage(m, PAGE_WEEK_BUDGET, m.weeks - PAGE_WEEK_BUDGET, ' (cont.)');
    }
  });

  addPageFooters(doc, `${AL_LABEL} = Autonomous Learning`);
  doc.save(`${fileStem(model.course)}-planner.pdf`);
}
