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

// Subdued grid-line colour: structures every cell without competing with the
// coloured special-day fills (Weekend/SchoolHoliday/PublicHoliday/AL).
export const BRAND_GRID_LINE: [number, number, number] = [200, 205, 214];

const COPYRIGHT_TEXT = 'Copyright © United Ceres College Pte Ltd.';

/** Shared table look for every PDF export: subdued 1px borders on every cell. */
export const BRAND_GRID_STYLE = {
  lineWidth: 0.1,
  lineColor: BRAND_GRID_LINE,
} as const;

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
// page edge.
const LOGO_MARGIN_MM = 14;

// How far down a page's own content should start when it needs to clear the
// logo vertically instead of relying on staying left of it horizontally (the
// Survey PDF's narrower portrait page and wide title line need this; the
// landscape exports' left-anchored, short header lines don't reach far
// enough right to need it).
export const LOGO_RESERVED_HEIGHT_MM = LOGO_MARGIN_MM + LOGO_HEIGHT_MM + 2;

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
 * from inside autoTable's didDrawPage, where awaiting isn't possible). A
 * null dataUrl (logo failed to load) or a jsPDF decode error are both
 * silently skipped — a missing logo should never break an export.
 */
export function drawHeaderLogo(doc: jsPDF, dataUrl: string | null): void {
  if (!dataUrl) return;
  const pageWidth = doc.internal.pageSize.getWidth();
  const w = LOGO_HEIGHT_MM * LOGO_ASPECT;
  try {
    doc.addImage(dataUrl, 'PNG', pageWidth - LOGO_MARGIN_MM - w, LOGO_MARGIN_MM, w, LOGO_HEIGHT_MM);
  } catch {
    // Corrupt/unsupported image data — never let this break the export.
  }
}

/**
 * Draw the course/scope header as plain black text directly on the white
 * page background (first line larger + bold, rest smaller) instead of a
 * filled colour band, plus the UCC logo top-right when `logoDataUrl` is
 * given (see loadLogoDataUrl). The Calendar and Hybrid PDFs switched to this
 * after the dark-blue band was found to get cropped at the top of some
 * printers' usable page area. Returns the Y position the first table should
 * start at.
 */
export function drawPlainHeader(doc: jsPDF, lines: string[], logoDataUrl?: string | null): number {
  doc.setTextColor(0, 0, 0);
  let y = 9;
  lines.forEach((line, i) => {
    doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
    doc.setFontSize(i === 0 ? 14 : 9);
    doc.text(line, 14, y);
    y += i === 0 ? 7 : 5;
  });
  doc.setFont('helvetica', 'normal');
  drawHeaderLogo(doc, logoDataUrl ?? null);
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
