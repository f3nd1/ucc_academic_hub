import { describe, it, expect } from 'vitest';
import { isSupportedFile, parseSpreadsheetFile } from '../src/tools/survey/surveyParse';

describe('isSupportedFile', () => {
  it('accepts xlsx/xls/csv (any case) and rejects others', () => {
    expect(isSupportedFile('results.xlsx')).toBe(true);
    expect(isSupportedFile('OLD.XLS')).toBe(true);
    expect(isSupportedFile('export.csv')).toBe(true);
    expect(isSupportedFile('report.pdf')).toBe(false);
    expect(isSupportedFile('noextension')).toBe(false);
  });
});

describe('parseSpreadsheetFile', () => {
  it('parses a CSV File into rows + columns (headers from the first row)', async () => {
    const csv = 'Course,Q1 clarity,Comment\nData Science,Strongly agree,Great class\nData Science,4,Too fast';
    const file = new File([csv], 'survey.csv', { type: 'text/csv' });
    const parsed = await parseSpreadsheetFile(file);
    expect(parsed.fileName).toBe('survey.csv');
    expect(parsed.columns).toEqual(['Course', 'Q1 clarity', 'Comment']);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]['Q1 clarity']).toBe('Strongly agree');
    expect(parsed.rows[1]['Q1 clarity']).toBe(4); // numeric cell stays numeric
  });
});
