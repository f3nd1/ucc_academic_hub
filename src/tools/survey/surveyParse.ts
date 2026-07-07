import * as XLSX from 'xlsx';
import type { DataRow, ParsedDataset } from './surveyModel';

// File parsing for the survey tool. Kept apart from the pure engine so the
// heavyweight xlsx dependency is only pulled in with this tool's chunk (the
// tool is lazy-loaded from the registry). xlsx reads .xlsx/.xls AND .csv, so
// one code path covers every supported format. cellDates converts Excel date
// serials to real Date objects up front, so the engine never sees raw serials.

const SUPPORTED_EXTENSIONS = ['xlsx', 'xls', 'csv'];

/** True when the filename ends in a supported spreadsheet extension. */
export function isSupportedFile(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase();
  return !!ext && SUPPORTED_EXTENSIONS.includes(ext);
}

/** Parse the first sheet of an uploaded workbook/CSV into rows + columns. */
export async function parseSpreadsheetFile(file: File): Promise<ParsedDataset> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<DataRow>(sheet, { defval: '', raw: true });
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { fileName: file.name, rows, columns };
}
