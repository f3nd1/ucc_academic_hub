import { describe, it, expect } from 'vitest';
import {
  convertLikertToNumber,
  detectSurveyColumns,
  buildQuestionSummaries,
  classifyDirection,
  buildComparisonSummaries,
  buildCurrentScoreHistogram,
  buildComparisonChangeHistogram,
  exactMatches,
  mergeMaps,
  detectMetadata,
  detectQualitativeThemes,
  analyse,
  buildReport,
  STABILITY_MARGIN,
  type DataRow,
  type QuestionSummary,
  type ComparisonSummary,
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
  it('matches bilingual exports where a translation follows the English phrase', () => {
    // Real-world Google Forms exports append a translation, e.g.
    // "Strongly Agree 非常同意" — the exact-match lookup alone missed these.
    expect(convertLikertToNumber('Strongly Agree 非常同意')).toBe(5);
    expect(convertLikertToNumber('Agree 同意')).toBe(4);
    expect(convertLikertToNumber('Neutral 中立')).toBe(3);
    expect(convertLikertToNumber('Disagree 不同意')).toBe(2);
    expect(convertLikertToNumber('Strongly Disagree 非常不同意')).toBe(1);
  });
  it('does not let a shorter key shadow a longer one with the same prefix word', () => {
    // "strongly disagree ..." must not match "disagree" or "strongly agree".
    expect(convertLikertToNumber('strongly disagree 非常不同意')).toBe(1);
    expect(convertLikertToNumber('strongly agree 非常同意')).toBe(5);
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

  it('does not misclassify a long question sentence as metadata just because it contains an excluded word', () => {
    // Real Google Forms exports write full-sentence headers, e.g. "...during
    // this module." or "...provided appropriate academic guidance...". Those
    // legitimately contain "module" and "id" (inside "guidance") as ordinary
    // English, and must still be detected as Likert question columns.
    const longHeaderRows: DataRow[] = [
      {
        Course: 'DS',
        'The teacher provided appropriate academic guidance when needed.': 'Strongly Agree 非常同意',
        'The physical facilities supported my learning during this module.': 'Agree 同意',
      },
      {
        Course: 'DS',
        'The teacher provided appropriate academic guidance when needed.': 'Agree 同意',
        'The physical facilities supported my learning during this module.': 'Strongly Agree 非常同意',
      },
    ];
    const cols = detectSurveyColumns(longHeaderRows, Object.keys(longHeaderRows[0]));
    expect(cols).toContain('The teacher provided appropriate academic guidance when needed.');
    expect(cols).toContain('The physical facilities supported my learning during this module.');
    expect(cols).not.toContain('Course');
  });

  it('still excludes short metadata-style headers that happen to contain an excluded substring', () => {
    const rows2: DataRow[] = [
      { Modules: 'Leadership', 'Q1 clarity': 'Agree' },
      { Modules: 'Leadership', 'Q1 clarity': 5 },
    ];
    const cols = detectSurveyColumns(rows2, Object.keys(rows2[0]));
    expect(cols).not.toContain('Modules');
    expect(cols).toContain('Q1 clarity');
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

describe('buildCurrentScoreHistogram', () => {
  const summary = (mean: number): QuestionSummary => ({
    question: 'Q', mean, count: 1, interpretation: '', belowThreshold: false,
  });

  it('bins means into the six fixed score bands', () => {
    const bins = buildCurrentScoreHistogram([
      summary(1.5), summary(2.5), summary(3.2), summary(3.7), summary(4.1), summary(4.8),
    ]);
    expect(bins.map((b) => b.count)).toEqual([1, 1, 1, 1, 1, 1]);
    expect(bins.map((b) => b.label)).toEqual([
      '1.00 to 1.99', '2.00 to 2.99', '3.00 to 3.49', '3.50 to 3.99', '4.00 to 4.49', '4.50 to 5.00',
    ]);
  });

  it('places boundary values in the higher band (band start is inclusive)', () => {
    const bins = buildCurrentScoreHistogram([summary(3.5), summary(4.5)]);
    expect(bins[3].count).toBe(1); // 3.50 to 3.99
    expect(bins[5].count).toBe(1); // 4.50 to 5.00
  });

  it('returns all-zero bins for an empty list (never empty array)', () => {
    const bins = buildCurrentScoreHistogram([]);
    expect(bins).toHaveLength(6);
    expect(bins.every((b) => b.count === 0)).toBe(true);
  });
});

describe('buildComparisonChangeHistogram', () => {
  const comparison = (change: number): ComparisonSummary => ({
    currentQuestion: 'Q', comparisonQuestion: 'Q', matchType: 'Exact',
    currentMean: 0, comparisonMean: 0, change, direction: classifyDirection(change), comment: '',
  });

  it('bins changes into the five fixed change bands', () => {
    const bins = buildComparisonChangeHistogram([
      comparison(-0.6), comparison(-0.3), comparison(0.05), comparison(0.3), comparison(0.6),
    ]);
    expect(bins.map((b) => b.count)).toEqual([1, 1, 1, 1, 1]);
    expect(bins.map((b) => b.label)).toEqual([
      'Declined significantly', 'Declined marginally', 'Stable', 'Improved marginally', 'Improved significantly',
    ]);
  });

  it('returns an empty array (not zeroed bins) when there is nothing to compare', () => {
    expect(buildComparisonChangeHistogram([])).toEqual([]);
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

  it('cross-sectional report omits comparative + cross-module + comparison-histogram sections', () => {
    const a = analyse(rows, Object.keys(rows[0]), 3, null);
    const report = buildReport(a);
    expect(report).toContain('1. Executive Summary');
    expect(report).toContain('4. Histogram of Current Survey Results');
    expect(report).toContain('5. Quantitative Analysis');
    expect(report).not.toContain('Comparative Analysis');
    expect(report).not.toContain('Histogram of Comparative Results');
    expect(report).not.toContain('Cross-Module Pooled Analysis'); // single module
    expect(report).toContain('Thematic Analysis of Qualitative Feedback'); // has comments
    // Histogram of Current Survey Results reflects the two question means (Q1: 4.5, Q2: 2).
    expect(report).toContain('4.50 to 5.00: 1');
    expect(report).toContain('2.00 to 2.99: 1');
    // Q2 mean 2 < threshold 3 -> flagged
    expect(a.actionAreas.some((x) => x.question === 'Q2')).toBe(true);
  });

  it('includes the comparative section and its histogram when comparison data + maps are present', () => {
    const cmp: DataRow[] = [{ Q1: 3, Q2: 3 }];
    const a = analyse(rows, Object.keys(rows[0]), 3, {
      rows: cmp,
      maps: [
        { currentQuestion: 'Q1', comparisonQuestion: 'Q1', matchType: 'Exact' },
      ],
    });
    const report = buildReport(a);
    expect(report).toContain('4. Histogram of Current Survey Results');
    expect(report).toContain('5. Quantitative Analysis');
    expect(report).toContain('6. Comparative Analysis');
    expect(report).toContain('7. Histogram of Comparative Results');
    expect(report).toContain('Key Improvements and Areas of Decline');
  });

  it('omits the comparative histogram section when comparison data has no mapped questions', () => {
    const a = analyse(rows, Object.keys(rows[0]), 3, { rows: [{ Q1: 3 }], maps: [] });
    const report = buildReport(a);
    expect(report).not.toContain('Comparative Analysis');
    expect(report).not.toContain('Histogram of Comparative Results');
  });

  it('never emits an em dash (style rule: commas, not em dashes)', () => {
    const a = analyse(rows, Object.keys(rows[0]), 3, null);
    expect(buildReport(a)).not.toContain('—');
  });
});
