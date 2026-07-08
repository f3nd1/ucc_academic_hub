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
import type { HistogramBin } from './surveyModel';

// Report export. Both formats take the already-built report text (from
// buildReport) and lay it out: numbered "N. Heading" lines become headings,
// blank lines become spacing, everything else is body text. Histogram bins
// are passed separately and rendered as their own visual (a table in Word, bar
// charts in PDF) since the report text only carries their "label: count" lines.

const isHeading = (line: string): boolean => /^\d+\.\s/.test(line) || /^[A-Z]\.\s/.test(line);

function buildWordHistogramTable(headers: [string, string], bins: HistogramBin[]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: headers.map(
          (h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] }),
        ),
      }),
      ...bins.map(
        (bin) =>
          new TableRow({
            children: [
              new TableCell({ children: [new Paragraph(bin.label)] }),
              new TableCell({ children: [new Paragraph(String(bin.count))] }),
            ],
          }),
      ),
    ],
  });
}

/** Export the report text as a .docx and trigger a download. */
export async function exportReportToWord(
  reportText: string,
  currentHistogram: HistogramBin[],
  comparisonHistogram: HistogramBin[],
  fileName = 'student-survey-results-report.docx',
): Promise<void> {
  const paragraphs: (Paragraph | Table)[] = reportText.split('\n').map((line) => {
    const trimmed = line.trim();
    if (isHeading(trimmed))
      return new Paragraph({ text: trimmed, heading: HeadingLevel.HEADING_2, spacing: { after: 180 } });
    if (trimmed.length === 0) return new Paragraph({ text: '' });
    return new Paragraph({ children: [new TextRun(trimmed)], spacing: { after: 120 } });
  });

  if (currentHistogram.length > 0 || comparisonHistogram.length > 0) {
    paragraphs.push(new Paragraph({ text: 'Histogram Summary Tables', heading: HeadingLevel.HEADING_2 }));
  }
  if (currentHistogram.length > 0) {
    paragraphs.push(new Paragraph({ text: 'Current Survey Results Histogram', heading: HeadingLevel.HEADING_3 }));
    paragraphs.push(buildWordHistogramTable(['Score Band', 'Count'], currentHistogram));
  }
  if (comparisonHistogram.length > 0) {
    paragraphs.push(new Paragraph({ text: 'Comparative Results Histogram', heading: HeadingLevel.HEADING_3 }));
    paragraphs.push(buildWordHistogramTable(['Change Band', 'Count'], comparisonHistogram));
  }

  const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName);
}

/** Draw one histogram as a title, then a label + bar per bin. Returns the new y. */
function drawPdfHistogram(
  pdf: jsPDF,
  title: string,
  bins: HistogramBin[],
  startY: number,
  margin: number,
  pageHeight: number,
): number {
  let y = startY;
  if (y > pageHeight - 50) {
    pdf.addPage();
    y = margin;
  }

  pdf.setFont('helvetica', 'bold');
  pdf.text(title, margin, y);
  y += 8;
  pdf.setFont('helvetica', 'normal');

  const maxCount = Math.max(...bins.map((b) => b.count), 1);
  const maxBarWidth = 90;

  for (const bin of bins) {
    if (y > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
    const barWidth = (bin.count / maxCount) * maxBarWidth;
    pdf.text(`${bin.label}: ${bin.count}`, margin, y);
    pdf.rect(margin, y + 2, barWidth, 4, 'F');
    y += 12;
  }

  return y + 5;
}

/** Export the report text as an A4 PDF and trigger a download. */
export function exportReportToPdf(
  reportText: string,
  currentHistogram: HistogramBin[],
  comparisonHistogram: HistogramBin[],
  fileName = 'student-survey-results-report.pdf',
): void {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const maxLineWidth = pageWidth - margin * 2;
  const lineHeight = 6;

  let y = margin;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);

  const lines = pdf.splitTextToSize(reportText, maxLineWidth) as string[];
  for (const line of lines) {
    if (y > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.text(line, margin, y);
    y += lineHeight;
  }

  if (currentHistogram.length > 0) {
    y += 5;
    y = drawPdfHistogram(pdf, 'Histogram of Current Survey Results', currentHistogram, y, margin, pageHeight);
  }
  if (comparisonHistogram.length > 0) {
    y = drawPdfHistogram(pdf, 'Histogram of Comparative Results', comparisonHistogram, y, margin, pageHeight);
  }

  pdf.save(fileName);
}
