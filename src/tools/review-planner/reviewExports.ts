// Export stubs for the Review planner.
//
// NOT IMPLEMENTED YET — this pass ships the model, calculations, and UI. These
// functions are deliberate placeholders so the export buttons exist and are
// wired, but they surface a "coming soon" message rather than producing a file.
// When implemented they should reuse the timetable tool's jsPDF / CSV / Sheets
// helpers (see src/exports.ts, src/plannerExports.ts) over the computed review
// rows, keeping all dates DD MMMM YYYY.

import type { CourseReview, ModuleReview } from './reviewModel';

export interface ReviewExportInput {
  modules: ModuleReview[];
  courses: CourseReview[];
}

const STUB_MESSAGE =
  'Export is not available yet — the Review planner ships calculations and editing first. PDF, Excel, and CSV are coming in a later pass.';

/** STUB: PDF export of the review tables. */
export function exportReviewPdf(_input: ReviewExportInput): { ok: boolean; message: string } {
  return { ok: false, message: STUB_MESSAGE };
}

/** STUB: Excel export of the review tables. */
export function exportReviewExcel(_input: ReviewExportInput): { ok: boolean; message: string } {
  return { ok: false, message: STUB_MESSAGE };
}

/** STUB: CSV export of the review tables. */
export function exportReviewCsv(_input: ReviewExportInput): { ok: boolean; message: string } {
  return { ok: false, message: STUB_MESSAGE };
}
