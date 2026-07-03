import type { PlannerModel, PlannerCell } from './planner';
import { activityText, dateText, teacherLines } from './planner';
import { requestSheetsToken } from './googleSheets';

// Shared flat layout for both planner exports (CSV + Google Sheets). Rows/cols
// are 0-indexed. Columns: 0 = month label, 1 = weekday, then each week is three
// columns (Date, Activity, Teacher).

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

const FILL: Record<string, [number, number, number]> = {
  teaching: [0.85, 0.94, 0.85],
  weekend: [0.93, 0.93, 0.93],
  schoolHoliday: [0.99, 0.95, 0.8],
  publicHoliday: [0.98, 0.87, 0.87],
};

const fillFor = (cell: PlannerCell): [number, number, number] | null =>
  FILL[cell.kind] ?? null;

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
): Layout {
  const values: string[][] = [];
  const merges: Merge[] = [];
  const fills: Fill[] = [];
  const headers: { r: number; c: number }[] = [];

  const totalWidth = (weeks: number) => 2 + weeks * 3;

  put(values, 0, 0, 'Course:', 2);
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

    // Week N grouped headers + Date/Activity/Teacher sub-headers.
    for (let w = 0; w < m.weeks; w++) {
      const c = 2 + w * 3;
      put(values, h1, c, `Week ${w + 1}`, width);
      headers.push({ r: h1, c });
      merges.push({ r0: h1, r1: h1 + 1, c0: c, c1: c + 3 });
      put(values, h2, c, 'Date', width);
      put(values, h2, c + 1, 'Activity', width);
      put(values, h2, c + 2, 'Teacher', width);
      headers.push({ r: h2, c }, { r: h2, c: c + 1 }, { r: h2, c: c + 2 });
    }

    // 7 weekday rows.
    for (let r = 0; r < 7; r++) {
      const rowIndex = bodyStart + r;
      if (r === 0) put(values, rowIndex, 0, m.monthName, width);
      put(values, rowIndex, 1, model.weekdayLabels[r], width);
      for (let w = 0; w < m.weeks; w++) {
        const cell = m.grid[r][w];
        const c = 2 + w * 3;
        put(values, rowIndex, c, dateText(cell), width);
        put(values, rowIndex, c + 1, activityText(cell), width);
        put(
          values,
          rowIndex,
          c + 2,
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

export function exportPlannerCsv(model: PlannerModel): void {
  const { values } = buildPlannerLayout(model, ' / ');
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

  const { values, merges, fills, headers } = buildPlannerLayout(model, '\n');

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
              textFormat: { bold: true },
              backgroundColor: { red: 0.83, green: 0.88, blue: 0.96 },
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
