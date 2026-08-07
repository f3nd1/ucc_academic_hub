import type jsPDF from 'jspdf';

// United Ceres College brand palette, scoped to PDF/print exports only — the
// on-screen theme system (Classic/Retro LCD/Y2K Pop/Cult of the Lamb) is a
// separate, independent concern and is never touched by this module.
// Exported PDFs have always been a more formal, administrative-document
// style, so they carry the college's own colours regardless of which skin is
// active on screen.
export const BRAND = {
  darkBlue: [38, 52, 91] as [number, number, number], // #26345B
  gold: [206, 158, 93] as [number, number, number], // #CE9E5D
  lightBlue: [100, 113, 140] as [number, number, number], // #64718C
  lightGold: [217, 191, 160] as [number, number, number], // #D9BFA0
  grey: [242, 242, 242] as [number, number, number], // #F2F2F2
  white: [255, 255, 255] as [number, number, number],
  nearBlack: [30, 35, 48] as [number, number, number],
} as const;

// AL (Autonomous Learning) is filler, not real content — a restrained tint of
// lightBlue (blended toward white) rather than the full, attention-grabbing
// colour, so it stays visually secondary to real lesson cells. Both the
// Hybrid and Calendar PDF exports reference this SAME constant directly (no
// per-export copy), so there is exactly one AL colour value across both.
export const BRAND_AL_TINT: [number, number, number] = [209, 212, 221]; // ~30% lightBlue over white

// Dark, clearly visible grid line — matches the visual weight of the
// on-screen table's borders (thin-but-near-black on the default Y2K Pop
// skin). The previous [200,205,214]/0.1mm combination read as faint pale
// grey next to the module tints below; this is deliberately close to
// BRAND.nearBlack rather than a mid-grey so it reads with confidence
// without competing with body text.
export const BRAND_GRID_LINE: [number, number, number] = [90, 96, 110];

const COPYRIGHT_TEXT = 'Copyright © United Ceres College Pte Ltd.';

// Two border weights, not one: the previous round darkened AND thickened
// every cell edge uniformly, which read as too heavy once applied to every
// interior line in a dense grid. Only the table's own outer perimeter (plus
// the line separating the header block from the body, deliberately —
// see outerBorderLineWidth) stays at the bolder weight; every interior
// row/column divider drops back down to a thin-but-clearly-visible weight,
// still darker than the original too-faint pale grey this whole effort
// started from.
const THIN_GRID_LINE_WIDTH = 0.15;
const THICK_GRID_LINE_WIDTH = 0.3;

/** Shared table look for every PDF export: dark, clearly visible borders on every cell (thin by default — see outerBorderLineWidth for the per-cell outer-edge override). */
export const BRAND_GRID_STYLE = {
  lineWidth: THIN_GRID_LINE_WIDTH,
  lineColor: BRAND_GRID_LINE,
} as const;

/**
 * Per-cell border widths so only the table's OUTER perimeter (top, bottom,
 * left, right edges of the whole grid) reads as the bolder weight, plus the
 * line under the last header row — a deliberate cap that separates the
 * header block from the data grid, distinct from the thin dividers used
 * between every other pair of rows/columns (including between a multi-row
 * header's own rows, e.g. Hybrid's "Week N" band over its Date/Module/
 * Lesson/Teacher sub-header). Pass straight to `data.cell.styles.lineWidth`
 * inside a didParseCell hook.
 */
export function outerBorderLineWidth(data: {
  section: 'head' | 'body' | 'foot';
  row: { index: number };
  column: { index: number };
  table: { head: unknown[]; body: unknown[]; columns: unknown[] };
}): { top: number; bottom: number; left: number; right: number } {
  const isFirstCol = data.column.index === 0;
  const isLastCol = data.column.index === data.table.columns.length - 1;
  const isTopEdge = data.section === 'head' && data.row.index === 0;
  const isHeadBodyDivider = data.section === 'head' && data.row.index === data.table.head.length - 1;
  const isBottomEdge = data.section === 'body' && data.row.index === data.table.body.length - 1;
  return {
    top: isTopEdge ? THICK_GRID_LINE_WIDTH : THIN_GRID_LINE_WIDTH,
    bottom: isHeadBodyDivider || isBottomEdge ? THICK_GRID_LINE_WIDTH : THIN_GRID_LINE_WIDTH,
    left: isFirstCol ? THICK_GRID_LINE_WIDTH : THIN_GRID_LINE_WIDTH,
    right: isLastCol ? THICK_GRID_LINE_WIDTH : THIN_GRID_LINE_WIDTH,
  };
}

/**
 * Break any word wider than `maxWidthMm` into hyphenated chunks that do fit,
 * leaving every word that already fits untouched.
 *
 * autoTable/jsPDF wrap an over-wide word by splitting it at whatever character
 * happens to overflow, with nothing to mark the break, so "Representing" in a
 * narrow Lesson column came out as "Repre senting" — indistinguishable from
 * two separate words. Splitting it here instead and ending each chunk with a
 * hyphen ("Repre-" / "senting") makes it read as one word carried across two
 * lines. Only a last resort: callers shrink the font first (see
 * fontSizeForColumnWidth in plannerExports) so most words stay whole, and this
 * catches whatever is still too wide at the smallest size worth reading.
 *
 * Measured at `fontSizePt` against the doc's current font, in the doc's own
 * unit (mm for every export here), so it must be given the same size the cell
 * will actually be rendered at.
 */
export function hyphenateLongWords(
  doc: jsPDF,
  text: string,
  maxWidthMm: number,
  fontSizePt: number,
): string {
  if (!text) return text;
  doc.setFontSize(fontSizePt);
  const hyphenMm = doc.getTextWidth('-');
  const breakWord = (word: string): string => {
    if (!word || doc.getTextWidth(word) <= maxWidthMm) return word;
    const chunks: string[] = [];
    let chunk = '';
    for (const ch of word) {
      // The `chunk &&` guard keeps at least one character per chunk, so a
      // column too narrow for even a single glyph plus its hyphen still
      // terminates instead of looping forever.
      if (chunk && doc.getTextWidth(chunk + ch) + hyphenMm > maxWidthMm) {
        chunks.push(`${chunk}-`);
        chunk = ch;
      } else {
        chunk += ch;
      }
    }
    if (chunk) chunks.push(chunk);
    return chunks.join('\n');
  };
  return text
    .split('\n')
    .map((line) => line.split(' ').map(breakWord).join(' '))
    .join('\n');
}

// --- Per-module colour tints (Calendar + Hybrid PDF only) -------------------
//
// Neither the on-screen Hybrid view nor any export previously had a
// per-module colour scheme — every cell was tinted only by lesson kind
// (teaching/weekend/AL/holiday), the same flat colour regardless of which
// module a lesson belonged to. This is a new scheme, PDF-only by design
// (confirmed with Felix rather than assumed): the on-screen Hybrid view is
// unchanged. Six pastel tints, chosen to sit clearly apart from every
// special-day colour above (BRAND.grey/lightGold/gold, BRAND_AL_TINT, the
// conflict red) so a module cell is never mistaken for a special-day one,
// and light enough that BRAND.nearBlack body text stays comfortably legible
// against every one of them.
export const MODULE_PALETTE: [number, number, number][] = [
  [211, 235, 215], // mint
  [206, 224, 245], // sky blue
  [226, 214, 240], // lavender
  [242, 214, 230], // rose
  [244, 236, 200], // butter
  [204, 236, 230], // seafoam
];

/**
 * Map each module id to a MODULE_PALETTE colour by its position in
 * `modules` — deterministic per course, and built the SAME way by both the
 * Calendar and Hybrid PDF exports (both call this with `course.modules`) so
 * a given module always gets the same colour in both, never a
 * per-export-independent scheme that could disagree between the two.
 */
export function buildModuleColorMap(
  modules: { id: string }[],
): Map<string, [number, number, number]> {
  const map = new Map<string, [number, number, number]>();
  modules.forEach((m, i) => map.set(m.id, MODULE_PALETTE[i % MODULE_PALETTE.length]));
  return map;
}

// --- UCC logo, top-right of every PDF header --------------------------------
//
// jsPDF's addImage() needs actual pixel data (a data URL, HTMLImageElement,
// or Uint8Array) — it cannot take a bare URL and fetch it lazily — so the
// logo is fetched and base64-encoded once per session (loadLogoDataUrl,
// cached) and the resolved string threaded synchronously into every header
// draw from there. public/ucc-logo.png is a pre-cropped version of
// public/UCC_1200x630.png: the source is a 1200×630 banner canvas with the
// actual logo lockup (mark + wordmark) occupying only a small region of it,
// so scaling the raw banner to a fixed header height would have made the
// visible logo mark tiny; LOGO_ASPECT is that cropped asset's own pixel
// aspect ratio (1123×317), used to size the logo from a fixed height only —
// never a fixed width — so it can never distort.
const LOGO_ASPECT = 1123 / 317;
const LOGO_HEIGHT_MM = 9;
// Matches the 14mm left/right body-content margin already used by the
// Calendar and Hybrid PDFs, so the logo lines up with the same printable
// area as everything else on the page instead of sitting flush against the
// right page edge. Horizontal only — vertical position tracks the title
// line it sits beside (see drawHeaderLogo's centerYMm).
const LOGO_MARGIN_MM = 14;

// Helvetica's cap-height as a fraction of its em size. jsPDF doesn't expose
// real font-metrics ascent/descent, so this is a close, consistent estimate
// of where a text line's own visual centre sits above its baseline — used
// to line the logo's vertical centre up with a specific text line (the
// header title) rather than a fixed page-top offset that drifted out of
// alignment whenever the header had more than one line.
const CAP_HEIGHT_RATIO = 0.717;
const MM_PER_PT = 0.3528;

/**
 * The vertical centre (mm from the page top) of a text line drawn with
 * `doc.text(..., baselineYMm)` at `fontSizePt`. Exported so any PDF export
 * whose header isn't built from drawPlainHeader (e.g. Survey's hand-rolled
 * layout) can still line its logo up with its own title line.
 */
export function textLineCenterYMm(baselineYMm: number, fontSizePt: number): number {
  return baselineYMm - (fontSizePt * MM_PER_PT * CAP_HEIGHT_RATIO) / 2;
}

let logoDataUrlPromise: Promise<string | null> | null = null;

/**
 * Fetch + base64-encode the UCC logo, cached for the lifetime of the page.
 * Resolves to null on any failure (missing asset, offline, unsupported
 * response) so a logo problem degrades to "no logo on this export" rather
 * than blocking the export entirely.
 */
export function loadLogoDataUrl(): Promise<string | null> {
  if (!logoDataUrlPromise) {
    logoDataUrlPromise = fetch(`${import.meta.env.BASE_URL}ucc-logo.png`)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error('logo fetch failed'))))
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
          }),
      )
      .catch(() => null);
  }
  return logoDataUrlPromise;
}

/**
 * Draw the UCC logo top-right of the CURRENT page from an already-resolved
 * data URL (see loadLogoDataUrl — this is synchronous so it can be called
 * from inside autoTable's didDrawPage, where awaiting isn't possible), its
 * own vertical centre aligned with `centerYMm` (typically the header
 * title's own text-centre — see textLineCenterYMm) rather than the header
 * block as a whole, so the logo reads as level with the title specifically
 * even when a subtitle line sits below it. A null dataUrl (logo failed to
 * load) or a jsPDF decode error are both silently skipped — a missing logo
 * should never break an export.
 */
export function drawHeaderLogo(doc: jsPDF, dataUrl: string | null, centerYMm: number): void {
  if (!dataUrl) return;
  const pageWidth = doc.internal.pageSize.getWidth();
  const w = LOGO_HEIGHT_MM * LOGO_ASPECT;
  try {
    doc.addImage(dataUrl, 'PNG', pageWidth - LOGO_MARGIN_MM - w, centerYMm - LOGO_HEIGHT_MM / 2, w, LOGO_HEIGHT_MM);
  } catch {
    // Corrupt/unsupported image data — never let this break the export.
  }
}

/**
 * Draw the course/scope header as plain black text directly on the white
 * page background (first line larger + bold, rest smaller) instead of a
 * filled colour band, plus the UCC logo top-right when `logoDataUrl` is
 * given (see loadLogoDataUrl), vertically centred on the title line only —
 * the subtitle line sits below both, untouched. The Calendar and Hybrid
 * PDFs switched to this after the dark-blue band was found to get cropped
 * at the top of some printers' usable page area. Returns the Y position the
 * first table should start at.
 */
export function drawPlainHeader(doc: jsPDF, lines: string[], logoDataUrl?: string | null): number {
  doc.setTextColor(0, 0, 0);
  const TITLE_BASELINE_Y = 9;
  const TITLE_FONT_SIZE = 14;
  let y = TITLE_BASELINE_Y;
  lines.forEach((line, i) => {
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
    doc.setFontSize(i === 0 ? TITLE_FONT_SIZE : 9);
    doc.text(line, 14, y);
    y += i === 0 ? 7 : 5;
  });
  doc.setFont('helvetica', 'normal');
  if (logoDataUrl) {
    drawHeaderLogo(doc, logoDataUrl, textLineCenterYMm(TITLE_BASELINE_Y, TITLE_FONT_SIZE));
  }
  return y + 3;
}

/**
 * Draw "Page X / Y" and the UCC copyright line in the footer of every page of
 * a finished document. Must be called once, after all content (including
 * every doc.addPage()) has been drawn — jsPDF only knows the true page count
 * at that point, and autoTable's own per-page hooks fire before later
 * addPage() calls exist. `legendText`, when given, is drawn one line above
 * the copyright line (e.g. explaining an abbreviation used in the grid).
 */
export function addPageFooters(doc: jsPDF, legendText?: string): void {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Deliberately small — a footer, not a heading — roughly 70-75% of the
    // smallest body text size used across the three PDF exports (6.5-9pt).
    doc.setFontSize(6);
    doc.setTextColor(...BRAND.lightBlue);
    if (legendText) doc.text(legendText, 14, pageHeight - 12);
    doc.text(COPYRIGHT_TEXT, 14, pageHeight - 8);
    doc.text(`Page ${i} / ${totalPages}`, pageWidth - 14, pageHeight - 8, {
      align: 'right',
    });
    doc.setTextColor(0, 0, 0);
  }
}
