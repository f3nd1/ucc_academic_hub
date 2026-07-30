import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PlannerModel, PlannerCell, PlannerColumnMode } from './planner';
import {
  activityText,
  columnModeLabel,
  dateText,
  lessonLines,
  teacherLines,
} from './planner';
import { requestSheetsToken } from './googleSheets';
import { addPageFooters, drawBrandHeaderBand, BRAND, BRAND_AL_TINT } from './shared/pdfBrand';

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

export function exportPlannerPdf(
  model: PlannerModel,
  columnMode: PlannerColumnMode = 'activity',
): void {
  const doc = new jsPDF({ orientation: 'landscape' });
  const columnLabel = columnModeLabel(columnMode);

  let y = drawBrandHeaderBand(doc, [
    `${model.scopeLabel}: ${model.course}`,
    `Timing: ${model.timing}    Updated: ${model.updatedDisplay}`,
  ]);
  for (const m of model.months) {
    // Head: merged corner + Week N groups over Date/Activity-or-Module/Teacher.
    const head = [
      [
        { content: `${m.monthName} ${m.year}`, colSpan: 2, rowSpan: 2 },
        ...Array.from({ length: m.weeks }, (_, w) => ({
          content: `Week ${w + 1}`,
          colSpan: 4,
        })),
      ],
      Array.from({ length: m.weeks }).flatMap(() => [
        'Date',
        columnLabel,
        'Lesson',
        'Teacher',
      ]),
    ];

    // Body: month label merged down 7 weekday rows; cells from the shared
    // planner helpers so wording matches the view and the Sheets export.
    const cellsByRow: PlannerCell[][] = m.grid;
    const body = m.grid.map((rowCells, r) => {
      const cells: (string | { content: string; rowSpan?: number })[] = [];
      if (r === 0) cells.push({ content: m.monthName, rowSpan: 7 });
      cells.push(model.weekdayLabels[r]);
      for (const cell of rowCells) {
        cells.push(
          dateText(cell),
          activityText(cell, columnMode),
          lessonLines(cell).join('\n'),
          teacherLines(cell).join('\n'),
        );
      }
      return cells;
    });

    autoTable(doc, {
      head,
      body,
      startY: y,
      styles: {
        fontSize: 6.5,
        cellPadding: 1.2,
        valign: 'top',
        textColor: BRAND.nearBlack,
      },
      headStyles: {
        fillColor: BRAND.darkBlue,
        textColor: BRAND.white,
        halign: 'center',
      },
      alternateRowStyles: { fillColor: BRAND.grey },
      didParseCell: (data) => {
        if (data.section !== 'body') return;
        const col = data.column.index;
        if (col < 2 || (col - 2) % 4 !== 1) {
          if (col === 0) {
            // Month-label column: same dark-blue band as the header, so the
            // month/week divider reads as one consistent brand element.
            data.cell.styles.fillColor = BRAND.darkBlue;
            data.cell.styles.textColor = BRAND.white;
            data.cell.styles.halign = 'center';
            data.cell.styles.valign = 'middle';
          }
          return;
        }
        const week = Math.floor((col - 2) / 4);
        const cell = cellsByRow[data.row.index]?.[week];
        if (!cell) return;
        const rgb = cell.conflict ? FILL.conflict : FILL[cell.kind];
        if (rgb) data.cell.styles.fillColor = to255(rgb);
      },
    });
    y =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? y;
    y += 8;
    if (
      y > doc.internal.pageSize.getHeight() - 60 &&
      m !== model.months[model.months.length - 1]
    ) {
      doc.addPage();
      y = 14;
    }
  }

  addPageFooters(doc);
  doc.save(`${fileStem(model.course)}-planner.pdf`);
}
