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
// colour, so it stays visually secondary to real lesson cells.
export const BRAND_AL_TINT: [number, number, number] = [209, 212, 221]; // ~30% lightBlue over white

const COPYRIGHT_TEXT = 'Copyright © United Ceres College Pte Ltd.';

/**
 * Draw a full-width dark-blue header band across the top of the CURRENT page,
 * with the given lines in white text (first line larger, rest smaller).
 * Returns the Y position the first table should start at.
 */
export function drawBrandHeaderBand(doc: jsPDF, lines: string[]): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const bandHeight = 10 + Math.max(0, lines.length - 1) * 6;

  doc.setFillColor(...BRAND.darkBlue);
  doc.rect(0, 0, pageWidth, bandHeight, 'F');

  doc.setTextColor(...BRAND.white);
  let y = 8;
  lines.forEach((line, i) => {
    doc.setFontSize(i === 0 ? 15 : 10);
    doc.text(line, 14, y);
    y += i === 0 ? 8 : 6;
  });

  // Reset for whatever content is drawn next.
  doc.setTextColor(0, 0, 0);
  return bandHeight + 6;
}

/**
 * Draw "Page X / Y" and the UCC copyright line in the footer of every page of
 * a finished document. Must be called once, after all content (including
 * every doc.addPage()) has been drawn — jsPDF only knows the true page count
 * at that point, and autoTable's own per-page hooks fire before later
 * addPage() calls exist.
 */
export function addPageFooters(doc: jsPDF): void {
  const totalPages = doc.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.lightBlue);
    doc.text(COPYRIGHT_TEXT, 14, pageHeight - 8);
    doc.text(`Page ${i} / ${totalPages}`, pageWidth - 14, pageHeight - 8, {
      align: 'right',
    });
    doc.setTextColor(0, 0, 0);
  }
}
