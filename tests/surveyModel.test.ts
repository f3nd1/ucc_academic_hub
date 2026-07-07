import { describe, it, expect } from 'vitest';
import {
  convertLikertToNumber,
  detectSurveyColumns,
  buildQuestionSummaries,
  classifyDirection,
  buildComparisonSummaries,
  exactMatches,
  mergeMaps,
  detectMetadata,
  detectQualitativeThemes,
  analyse,
  buildReport,
  STABILITY_MARGIN,
  type DataRow,
} from '../src/tools/survey/surveyModel';

describe('convertLikertToNumber', () => {
  it('passes numbers and numeric strings through', () => {
    expect(convertLikertToNumber(4)).toBe(4);
    expect(convertLikertToNumber('5')).toBe(5);
  });
  it('maps text Likert phrases (case-insensitive), both wordings of the extremes', () => {
    expect(convertLikertToNumber('Strongly Agree')).toBe(5);
    expect(convertLikertToNumber('highly agree')).toBe(5);
    expect(convertLikertToNumber('Neutral')).toBe(3);
    expect(convertLikertToNumber('Strongly disagree')).toBe(1);
    expect(convertLikertToNumber('highly disagree')).toBe(1);
  });
  it('returns null for blanks and non-Likert text', () => {
    expect(convertLikertToNumber('')).toBeNull();
    expect(convertLikertToNumber('banana')).toBeNull();
    expect(convertLikertToNumber(null)).toBeNull();
  });
});

describe('detectSurveyColumns', () => {
  const rows: DataRow[] = [
    { Course: 'DS', 'Q1 clarity': 'Agree', 'Q2 pace': 4, Comment: 'good', Email: 'a@b.c' },
    { Course: 'DS', 'Q1 clarity': 5, 'Q2 pace': 'Neutral', Comment: 'ok', Email: 'd@e.f' },
  ];
  it('keeps Likert/numeric question columns and drops metadata + free text', () => {
    const cols = detectSurveyColumns(rows, Object.keys(rows[0]));
    expect(cols).toContain('Q1 clarity');
    expect(cols).toContain('Q2 pace');
    expect(cols).not.toContain('Course'); // excluded by name
    expect(cols).not.toContain('Email'); // excluded by name
    expect(cols).not.toContain('Comment'); // <70% convertible
  });
});

describe('buildQuestionSummaries', () => {
  it('computes mean, count, and below-threshold flag', () => {
    const rows: DataRow[] = [{ Q: 2 }, { Q: 4 }, { Q: 'agree' }]; // 2,4,4 -> mean 3.33
    const [s] = buildQuestionSummaries(rows, ['Q'], 3.5);
    expect(s.count).toBe(3);
    expect(s.mean).toBeCloseTo(3.333, 2);
    expect(s.belowThreshold).toBe(true);
  });
});

describe('comparison direction (stability margin)', () => {
  it('classifies improve / decline / stable around the margin', () => {
    expect(classifyDirection(STABILITY_MARGIN + 0.01)).toBe('Improved');
    expect(classifyDirection(-(STABILITY_MARGIN + 0.01))).toBe('Declined');
    expect(classifyDirection(0.05)).toBe('Stable');
    expect(classifyDirection(-0.05)).toBe('Stable');
  });

  it('builds a comparison summary with change = current - comparison', () => {
    const cur: DataRow[] = [{ Q: 5 }, { Q: 5 }]; // mean 5
    const cmp: DataRow[] = [{ P: 3 }, { P: 4 }]; // mean 3.5
    const [s] = buildComparisonSummaries(cur, cmp, [
      { currentQuestion: 'Q', comparisonQuestion: 'P', matchType: 'Manual' },
    ]);
    expect(s.currentMean).toBe(5);
    expect(s.comparisonMean).toBe(3.5);
    expect(s.change).toBeCloseTo(1.5, 5);
    expect(s.direction).toBe('Improved');
  });
});

describe('question matching', () => {
  it('exactMatches finds shared column names only', () => {
    expect(exactMatches(['A', 'B'], ['B', 'C'])).toEqual([
      { currentQuestion: 'B', comparisonQuestion: 'B', matchType: 'Exact' },
    ]);
  });
  it('mergeMaps de-dupes identical current::comparison pairs', () => {
    const merged = mergeMaps(
      [{ currentQuestion: 'A', comparisonQuestion: 'A', matchType: 'Exact' }],
      [
        { currentQuestion: 'A', comparisonQuestion: 'A', matchType: 'Manual' }, // dup, dropped
        { currentQuestion: 'A', comparisonQuestion: 'B', matchType: 'Manual' },
      ],
    );
    expect(merged).toHaveLength(2);
  });
});

describe('detectMetadata', () => {
  it('reads course, modules, reporting period, and multi-module flag', () => {
    const rows: DataRow[] = [
      { Course: 'Data Science', Module: 'M1', Timestamp: new Date('2026-03-15') },
      { Course: 'Data Science', Module: 'M2', Timestamp: new Date('2026-03-20') },
    ];
    const m = detectMetadata(rows, Object.keys(rows[0]));
    expect(m.courseName).toBe('Data Science');
    expect(m.moduleNames.sort()).toEqual(['M1', 'M2']);
    expect(m.hasMultipleModules).toBe(true);
    expect(m.reportingPeriod).toBe('March 2026'); // earliest date -> Month YYYY
    expect(m.responseCount).toBe(2);
  });
});

describe('detectQualitativeThemes', () => {
  it('groups comment-column text into keyword themes and omits empty ones', () => {
    const rows: DataRow[] = [
      { Comment: 'The pace was too fast for me', Feedback: '' },
      { Comment: '', Feedback: 'assessment feedback was helpful' },
    ];
    const themes = detectQualitativeThemes(rows);
    const titles = themes.map((t) => t.title);
    expect(titles).toContain('Pace of Delivery');
    expect(titles).toContain('Assessment and Feedback');
    expect(titles).not.toContain('Learning Materials'); // no matching comments
  });
  it('returns nothing when there are no comment columns', () => {
    expect(detectQualitativeThemes([{ Q1: 4 }])).toEqual([]);
  });
});

describe('report structure (conditional sections)', () => {
  const rows: DataRow[] = [
    { Course: 'DS', Module: 'M1', Timestamp: new Date('2026-03-01'), Q1: 5, Q2: 2, Comment: 'clear teaching' },
    { Course: 'DS', Module: 'M1', Timestamp: new Date('2026-03-02'), Q1: 4, Q2: 2, Comment: 'good' },
  ];

  it('cross-sectional report omits comparative + cross-module sections', () => {
    const a = analyse(rows, Object.keys(rows[0]), 3, null);
    const report = buildReport(a);
    expect(report).toContain('1. Executive Summary');
    expect(report).toContain('4. Quantitative Analysis');
    expect(report).not.toContain('Comparative Analysis');
    expect(report).not.toContain('Cross-Module Pooled Analysis'); // single module
    expect(report).toContain('Thematic Analysis of Qualitative Feedback'); // has comments
    // Q2 mean 2 < threshold 3 -> flagged
    expect(a.actionAreas.some((x) => x.question === 'Q2')).toBe(true);
  });

  it('includes the comparative section when comparison data + maps are present', () => {
    const cmp: DataRow[] = [{ Q1: 3, Q2: 3 }];
    const a = analyse(rows, Object.keys(rows[0]), 3, {
      rows: cmp,
      maps: [
        { currentQuestion: 'Q1', comparisonQuestion: 'Q1', matchType: 'Exact' },
      ],
    });
    const report = buildReport(a);
    expect(report).toContain('5. Comparative Analysis');
    expect(report).toContain('Key Improvements and Areas of Decline');
  });

  it('never emits an em dash (style rule: commas, not em dashes)', () => {
    const a = analyse(rows, Object.keys(rows[0]), 3, null);
    expect(buildReport(a)).not.toContain('—');
  });
});
