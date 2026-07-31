import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from 'docx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { HistogramBin, ReportBlock } from './surveyModel';
import { drawHeaderLogo, loadLogoDataUrl, textLineCenterYMm } from '../../shared/pdfBrand';

// Report export, in two flavours:
//   - { kind: 'blocks' }: the built-in report's structured blocks (see
//     surveyModel.ts) are rendered directly as real headings, tables, and
//     histogram bars — no text parsing involved.
//   - { kind: 'text' }: an AI-authored report is arbitrary prose from Claude,
//     not structured data, so it's laid out by detecting "N. Heading" /
//     "A. Heading" lines; its histogram data (still real, computed figures)
//     is appended as its own table/bars after the prose.
export type ReportExportInput =
  | { kind: 'blocks'; blocks: ReportBlock[] }
  | {
      kind: 'text';
      text: string;
      currentHistogram: HistogramBin[];
      comparisonHistogram: HistogramBin[];
    };

const isHeading = (line: string): boolean => /^\d+\.\s/.test(line) || /^[A-Z]\.\s/.test(line);

// --- Word (.docx) ------------------------------------------------------------

function buildWordTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: headers.map(
          (h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] }),
        ),
      }),
      ...rows.map(
        (row) =>
          new TableRow({
            children: row.map((cell) => new TableCell({ children: [new Paragraph(cell)] })),
          }),
      ),
    ],
  });
}

function buildWordChildrenFromBlocks(blocks: ReportBlock[]): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'title':
        children.push(
          new Paragraph({ text: `Student Survey Results Report for ${b.course}`, heading: HeadingLevel.TITLE, spacing: { after: 80 } }),
        );
        children.push(new Paragraph({ text: `Reporting Period: ${b.period}`, spacing: { after: 200 } }));
        break;
      case 'heading':
        children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 120 } }));
        break;
      case 'subheading':
        children.push(new Paragraph({ text: b.text, heading: HeadingLevel.HEADING_3, spacing: { before: 120, after: 80 } }));
        break;
      case 'paragraph':
        children.push(new Paragraph({ children: [new TextRun(b.text)], spacing: { after: 160 } }));
        break;
      case 'table':
        children.push(buildWordTable(b.headers, b.rows));
        children.push(new Paragraph({ text: '', spacing: { after: 160 } }));
        break;
      case 'histogram':
        children.push(new Paragraph({ text: b.title, heading: HeadingLevel.HEADING_3, spacing: { before: 120, after: 80 } }));
        children.push(buildWordTable(['Band', 'Count'], b.bins.map((bin) => [bin.label, String(bin.count)])));
        children.push(new Paragraph({ text: '', spacing: { after: 160 } }));
        break;
    }
  }
  return children;
}

function buildWordChildrenFromText(
  reportText: string,
  currentHistogram: HistogramBin[],
  comparisonHistogram: HistogramBin[],
): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = reportText.split('\n').map((line) => {
    const trimmed = line.trim();
    if (isHeading(trimmed))
      return new Paragraph({ text: trimmed, heading: HeadingLevel.HEADING_2, spacing: { after: 180 } });
    if (trimmed.length === 0) return new Paragraph({ text: '' });
    return new Paragraph({ children: [new TextRun(trimmed)], spacing: { after: 120 } });
  });

  if (currentHistogram.length > 0 || comparisonHistogram.length > 0) {
    children.push(new Paragraph({ text: 'Histogram Summary Tables', heading: HeadingLevel.HEADING_2 }));
  }
  if (currentHistogram.length > 0) {
    children.push(new Paragraph({ text: 'Current Survey Results Histogram', heading: HeadingLevel.HEADING_3 }));
    children.push(buildWordTable(['Band', 'Count'], currentHistogram.map((bin) => [bin.label, String(bin.count)])));
  }
  if (comparisonHistogram.length > 0) {
    children.push(new Paragraph({ text: 'Comparative Results Histogram', heading: HeadingLevel.HEADING_3 }));
    children.push(buildWordTable(['Band', 'Count'], comparisonHistogram.map((bin) => [bin.label, String(bin.count)])));
  }

  return children;
}

/** Export the report as a .docx and trigger a download. */
export async function exportReportToWord(
  input: ReportExportInput,
  fileName = 'student-survey-results-report.docx',
): Promise<void> {
  const children =
    input.kind === 'blocks'
      ? buildWordChildrenFromBlocks(input.blocks)
      : buildWordChildrenFromText(input.text, input.currentHistogram, input.comparisonHistogram);

  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName);
}

// --- PDF -----------------------------------------------------------------

/** jspdf-autotable stamps the finished table's bottom Y onto the doc instance. */
type DocWithAutoTable = jsPDF & { lastAutoTable?: { finalY: number } };

// Logo state threaded through every drawing helper below: the data URL (or
// null if it failed to load) plus the fixed vertical centre — in Singapore
// terms, "the same shelf the title sits on" — every redraw on every page
// (including continuation pages that carry no title text of their own)
// lines up against. Computed once per export from whichever text starts
// page 1 (the title line for the built-in report, the body's own font size
// for the AI-authored one — see exportReportToPdf).
interface LogoState {
  dataUrl: string | null;
  centerYMm: number;
}

function drawLogo(pdf: jsPDF, logo: LogoState): void {
  drawHeaderLogo(pdf, logo.dataUrl, logo.centerYMm);
}

function drawPdfWrappedText(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  margin: number,
  pageHeight: number,
  logo: LogoState,
): number {
  const lines = pdf.splitTextToSize(text, maxWidth) as string[];
  for (const line of lines) {
    if (y > pageHeight - margin) {
      pdf.addPage();
      drawLogo(pdf, logo);
      y = margin;
    }
    pdf.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

/** Draw one histogram as a title, then a label + bar per bin. Returns the new y. */
function drawPdfHistogram(
  pdf: jsPDF,
  title: string,
  bins: HistogramBin[],
  startY: number,
  margin: number,
  pageHeight: number,
  logo: LogoState,
): number {
  let y = startY;
  if (y > pageHeight - 50) {
    pdf.addPage();
    drawLogo(pdf, logo);
    y = margin;
  }

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(title, margin, y);
  y += 8;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);

  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const maxBarWidth = 90;

  for (const bin of bins) {
    if (y > pageHeight - margin) {
      pdf.addPage();
      drawLogo(pdf, logo);
      y = margin;
    }
    const barWidth = (bin.count / maxCount) * maxBarWidth;
    pdf.text(`${bin.label}: ${bin.count}`, margin, y);
    pdf.rect(margin, y + 2, barWidth, 4, 'F');
    y += 12;
  }

  return y + 5;
}

function renderBlocksToPdf(pdf: jsPDF, blocks: ReportBlock[], logo: LogoState): void {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const maxLineWidth = pageWidth - margin * 2;
  let y = margin;

  for (const b of blocks) {
    switch (b.type) {
      case 'title':
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(15);
        y = drawPdfWrappedText(pdf, `Student Survey Results Report for ${b.course}`, margin, y, maxLineWidth, 7, margin, pageHeight, logo);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        y = drawPdfWrappedText(pdf, `Reporting Period: ${b.period}`, margin, y, maxLineWidth, 6, margin, pageHeight, logo);
        y += 4;
        break;
      case 'heading':
        if (y > pageHeight - margin - 10) {
          pdf.addPage();
          drawLogo(pdf, logo);
          y = margin;
        }
        y += 3;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        y = drawPdfWrappedText(pdf, b.text, margin, y, maxLineWidth, 6.5, margin, pageHeight, logo);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        y += 2;
        break;
      case 'subheading':
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10.5);
        y = drawPdfWrappedText(pdf, b.text, margin, y, maxLineWidth, 6, margin, pageHeight, logo);
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        break;
      case 'paragraph':
        y = drawPdfWrappedText(pdf, b.text, margin, y, maxLineWidth, 6, margin, pageHeight, logo);
        y += 3;
        break;
      case 'table':
        autoTable(pdf, {
          head: [b.headers],
          body: b.rows,
          startY: y,
          margin: { left: margin, right: margin },
          styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
          headStyles: { fillColor: [30, 30, 30] },
          didDrawPage: () => drawLogo(pdf, logo),
        });
        y = (pdf as DocWithAutoTable).lastAutoTable?.finalY ?? y;
        y += 8;
        break;
      case 'histogram':
        y = drawPdfHistogram(pdf, b.title, b.bins, y, margin, pageHeight, logo);
        break;
    }
  }
}

/** Export the report as an A4 PDF and trigger a download. */
export async function exportReportToPdf(
  input: ReportExportInput,
  fileName = 'student-survey-results-report.pdf',
): Promise<void> {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  const dataUrl = await loadLogoDataUrl();
  const margin = 15;
  // The built-in report's title line is bold 15pt; the AI-authored report
  // has no distinct title, just its normal 10pt body text — either way the
  // logo centres on whatever text starts at the top of page 1, and every
  // later page (including ones with no title text of their own) reuses
  // that same Y so the logo never jumps around the document.
  const titleFontSize = input.kind === 'blocks' ? 15 : 10;
  const logo: LogoState = { dataUrl, centerYMm: textLineCenterYMm(margin, titleFontSize) };
  drawLogo(pdf, logo);

  if (input.kind === 'blocks') {
    renderBlocksToPdf(pdf, input.blocks, logo);
  } else {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const maxLineWidth = pageWidth - margin * 2;

    let y = drawPdfWrappedText(pdf, input.text, margin, margin, maxLineWidth, 6, margin, pageHeight, logo);

    if (input.currentHistogram.length > 0) {
      y += 5;
      y = drawPdfHistogram(pdf, 'Histogram of Current Survey Results', input.currentHistogram, y, margin, pageHeight, logo);
    }
    if (input.comparisonHistogram.length > 0) {
      y = drawPdfHistogram(pdf, 'Histogram of Comparative Results', input.comparisonHistogram, y, margin, pageHeight, logo);
    }
  }

  pdf.save(fileName);
}
