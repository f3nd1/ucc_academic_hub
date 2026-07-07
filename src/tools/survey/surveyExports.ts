import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';

// Report export. Both formats take the already-built report text (from
// buildReport) and lay it out: numbered "N. Heading" lines become headings,
// blank lines become spacing, everything else is body text.

const isHeading = (line: string): boolean => /^\d+\.\s/.test(line) || /^[A-Z]\.\s/.test(line);

/** Export the report text as a .docx and trigger a download. */
export async function exportReportToWord(
  reportText: string,
  fileName = 'student-survey-results-report.docx',
): Promise<void> {
  const paragraphs = reportText.split('\n').map((line) => {
    const trimmed = line.trim();
    if (isHeading(trimmed))
      return new Paragraph({ text: trimmed, heading: HeadingLevel.HEADING_2, spacing: { after: 180 } });
    if (trimmed.length === 0) return new Paragraph({ text: '' });
    return new Paragraph({ children: [new TextRun(trimmed)], spacing: { after: 120 } });
  });

  const doc = new Document({ sections: [{ properties: {}, children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName);
}

/** Export the report text as an A4 PDF and trigger a download. */
export function exportReportToPdf(
  reportText: string,
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

  pdf.save(fileName);
}
