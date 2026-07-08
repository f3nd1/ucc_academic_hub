// Student Survey Analysis — pure analysis engine (no I/O, no xlsx, no DOM), so
// it is fully unit-testable. File parsing lives in surveyParse.ts and document
// export in surveyExports.ts; this module only turns parsed rows into
// summaries, comparisons, themes, and the final report text.
//
// Ported from the reference implementation and aligned to the system
// requirements (formal report structure, comma style, constructive framing,
// no mention of response volume / sample size).

export type DataRow = Record<string, string | number | boolean | null | undefined>;

export interface ParsedDataset {
  fileName: string;
  rows: DataRow[];
  columns: string[];
}

export interface QuestionSummary {
  question: string;
  mean: number;
  count: number;
  interpretation: string;
  belowThreshold: boolean;
}

export type MatchType = 'Exact' | 'Manual';
export type Direction = 'Improved' | 'Declined' | 'Stable';

export interface ComparisonMap {
  currentQuestion: string;
  comparisonQuestion: string;
  matchType: MatchType;
}

export interface ComparisonSummary extends ComparisonMap {
  currentMean: number;
  comparisonMean: number;
  change: number;
  direction: Direction;
  comment: string;
}

export interface Metadata {
  courseName: string;
  moduleNames: string[];
  reportingPeriod: string;
  responseCount: number;
  hasMultipleModules: boolean;
}

export interface QualitativeTheme {
  title: string;
  comments: string[];
}

export interface HistogramBin {
  label: string;
  count: number;
}

/** Movements smaller than this (absolute) are treated as broadly stable. */
export const STABILITY_MARGIN = 0.1;

/** Text Likert phrases → 1..5. Both "strongly"/"highly" wordings map to 1/5. */
export const LIKERT_MAP: Record<string, number> = {
  'strongly disagree': 1,
  'highly disagree': 1,
  disagree: 2,
  neutral: 3,
  'neither agree nor disagree': 3,
  agree: 4,
  'strongly agree': 5,
  'highly agree': 5,
};

// Longest keys first, so "strongly agree" is tried before "agree" and can't be
// shadowed by it (matters for the prefix match below).
const LIKERT_KEYS_BY_LENGTH = Object.keys(LIKERT_MAP).sort((a, b) => b.length - a.length);

/** Convert a numeric or text Likert value to a number, or null if it isn't one. */
export function convertLikertToNumber(value: unknown): number | null {
  if (typeof value === 'number' && !Number.isNaN(value)) return value;

  const normalised = String(value ?? '').trim().toLowerCase();
  if (!normalised) return null;

  const numeric = Number(normalised);
  if (!Number.isNaN(numeric)) return numeric;

  if (normalised in LIKERT_MAP) return LIKERT_MAP[normalised];

  // Bilingual exports (e.g. Google Forms) append a translation after the
  // English phrase, e.g. "Strongly Agree 非常同意". Match on the English
  // phrase as a prefix so that trailing text doesn't block detection.
  for (const key of LIKERT_KEYS_BY_LENGTH) {
    if (normalised.startsWith(key)) return LIKERT_MAP[key];
  }

  return null;
}

/** Columns that are clearly metadata, never survey questions. */
const EXCLUDED_COLUMN_PATTERNS = [
  'timestamp', 'date', 'time', 'name', 'email', 'phone', 'contact',
  'course', 'programme', 'program', 'module', 'subject', 'class', 'cohort',
  'intake', 'student id', 'id',
];

/**
 * Metadata headers are short labels ("Course", "Student ID", "Timestamp").
 * Real Likert question headers are full sentences (e.g. "The teacher
 * provided appropriate academic guidance..."), and those sentences routinely
 * contain the same substrings in ordinary English ("...during this module",
 * "...in a timely manner", "guidance" containing "id"). Only applying the
 * exclusion patterns to short headers keeps metadata detection working
 * without misclassifying long question text as metadata.
 */
const METADATA_HEADER_MAX_WORDS = 6;

function isMetadataColumn(column: string): boolean {
  const lower = column.toLowerCase().trim();
  if (lower.split(/\s+/).filter(Boolean).length > METADATA_HEADER_MAX_WORDS) return false;
  return EXCLUDED_COLUMN_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Detect quantitative survey question columns: exclude obvious metadata, then
 * keep columns where at least 70% of non-empty values are numeric or map to a
 * Likert number.
 */
export function detectSurveyColumns(rows: DataRow[], columns: string[]): string[] {
  return columns.filter((column) => {
    if (isMetadataColumn(column)) return false;

    const values = rows
      .map((row) => row[column])
      .filter((v) => v !== null && v !== undefined && String(v).trim() !== '');
    if (values.length === 0) return false;

    const convertible = values
      .map(convertLikertToNumber)
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));

    return convertible.length / values.length >= 0.7;
  });
}

export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function interpretScore(mean: number, threshold: number): string {
  if (mean < threshold)
    return 'Below the selected action threshold and may require attention.';
  if (mean >= 4.2) return 'Strong result indicating a positively rated area.';
  if (mean >= 3.5)
    return 'Generally positive result with scope for continued enhancement.';
  return 'Moderate result that may benefit from monitoring.';
}

export function classifyDirection(change: number): Direction {
  if (change > STABILITY_MARGIN) return 'Improved';
  if (change < -STABILITY_MARGIN) return 'Declined';
  return 'Stable';
}

function buildComparisonComment(direction: Direction, change: number): string {
  if (direction === 'Improved')
    return `The result improved by ${change.toFixed(2)}, suggesting positive movement in this area.`;
  if (direction === 'Declined')
    return `The result declined by ${Math.abs(change).toFixed(2)}, suggesting that further attention may be required.`;
  return 'The result remained broadly stable, with no meaningful movement observed.';
}

export function buildQuestionSummaries(
  rows: DataRow[],
  columns: string[],
  threshold: number,
): QuestionSummary[] {
  return columns.map((column) => {
    const values = rows
      .map((row) => convertLikertToNumber(row[column]))
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    const mean = calculateMean(values);
    return {
      question: column,
      mean,
      count: values.length,
      interpretation: interpretScore(mean, threshold),
      belowThreshold: mean < threshold,
    };
  });
}

export function buildComparisonSummaries(
  currentRows: DataRow[],
  comparisonRows: DataRow[],
  maps: ComparisonMap[],
): ComparisonSummary[] {
  return maps.map((map) => {
    const current = currentRows
      .map((row) => convertLikertToNumber(row[map.currentQuestion]))
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    const comparison = comparisonRows
      .map((row) => convertLikertToNumber(row[map.comparisonQuestion]))
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));

    const currentMean = calculateMean(current);
    const comparisonMean = calculateMean(comparison);
    const change = currentMean - comparisonMean;
    const direction = classifyDirection(change);

    return {
      ...map,
      currentMean,
      comparisonMean,
      change,
      direction,
      comment: buildComparisonComment(direction, change),
    };
  });
}

/** Bins current-result means into fixed 5-point-scale bands. */
export function buildCurrentScoreHistogram(summaries: QuestionSummary[]): HistogramBin[] {
  const bins: HistogramBin[] = [
    { label: '1.00 to 1.99', count: 0 },
    { label: '2.00 to 2.99', count: 0 },
    { label: '3.00 to 3.49', count: 0 },
    { label: '3.50 to 3.99', count: 0 },
    { label: '4.00 to 4.49', count: 0 },
    { label: '4.50 to 5.00', count: 0 },
  ];
  for (const s of summaries) {
    if (s.mean < 2) bins[0].count += 1;
    else if (s.mean < 3) bins[1].count += 1;
    else if (s.mean < 3.5) bins[2].count += 1;
    else if (s.mean < 4) bins[3].count += 1;
    else if (s.mean < 4.5) bins[4].count += 1;
    else bins[5].count += 1;
  }
  return bins;
}

/** Bins comparison changes into five bands; empty when there is nothing to compare. */
export function buildComparisonChangeHistogram(summaries: ComparisonSummary[]): HistogramBin[] {
  if (summaries.length === 0) return [];
  const bins: HistogramBin[] = [
    { label: 'Declined significantly', count: 0 },
    { label: 'Declined marginally', count: 0 },
    { label: 'Stable', count: 0 },
    { label: 'Improved marginally', count: 0 },
    { label: 'Improved significantly', count: 0 },
  ];
  for (const s of summaries) {
    if (s.change <= -0.5) bins[0].count += 1;
    else if (s.change < -STABILITY_MARGIN) bins[1].count += 1;
    else if (s.change <= STABILITY_MARGIN) bins[2].count += 1;
    else if (s.change < 0.5) bins[3].count += 1;
    else bins[4].count += 1;
  }
  return bins;
}

/** Exact-name matches between the two datasets' detected question columns. */
export function exactMatches(
  currentColumns: string[],
  comparisonColumns: string[],
): ComparisonMap[] {
  const comp = new Set(comparisonColumns);
  return currentColumns
    .filter((c) => comp.has(c))
    .map((c) => ({ currentQuestion: c, comparisonQuestion: c, matchType: 'Exact' as const }));
}

/** Merge exact + manual maps, dropping duplicate (current::comparison) pairs. */
export function mergeMaps(
  automatic: ComparisonMap[],
  manual: ComparisonMap[],
): ComparisonMap[] {
  const seen = new Set<string>();
  const out: ComparisonMap[] = [];
  for (const m of [...automatic, ...manual]) {
    const key = `${m.currentQuestion}::${m.comparisonQuestion}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

// --- Metadata detection ------------------------------------------------------

function findColumn(columns: string[], keywords: string[]): string | null {
  return (
    columns.find((c) => {
      const lower = c.toLowerCase();
      return keywords.some((k) => lower.includes(k));
    }) ?? null
  );
}

function getMostCommonValue(rows: DataRow[], column: string): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[column] ?? '').trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  if (counts.size === 0) return 'Not detected';
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

function getUniqueValues(rows: DataRow[], column: string): string[] {
  const values = rows.map((row) => String(row[column] ?? '').trim()).filter(Boolean);
  return [...new Set(values)];
}

/** A cell is a date if it is a Date, or a string that Date can parse. Excel
 *  serial numbers are converted to Dates at parse time (cellDates), so numeric
 *  cells are not treated as dates here. */
function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Reporting period as "Month YYYY" from the earliest date in the date column. */
function inferReportingPeriod(rows: DataRow[], column: string): string {
  const dates = rows
    .map((row) => parseDateValue(row[column]))
    .filter((d): d is Date => d instanceof Date);
  if (dates.length === 0) return 'Not detected';
  const earliest = dates.sort((a, b) => a.getTime() - b.getTime())[0];
  return earliest.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' });
}

export function detectMetadata(rows: DataRow[], columns: string[]): Metadata {
  const courseColumn = findColumn(columns, ['course', 'programme', 'program']);
  const moduleColumn = findColumn(columns, ['module', 'subject', 'unit']);
  const dateColumn = findColumn(columns, ['timestamp', 'date', 'submitted', 'time']);

  const moduleValues = moduleColumn ? getUniqueValues(rows, moduleColumn) : [];

  return {
    courseName: courseColumn ? getMostCommonValue(rows, courseColumn) : 'Not detected',
    moduleNames: moduleValues.length > 0 ? moduleValues : ['Not detected'],
    reportingPeriod: dateColumn ? inferReportingPeriod(rows, dateColumn) : 'Not detected',
    responseCount: rows.length,
    hasMultipleModules:
      moduleValues.filter((v) => v !== 'Not detected').length > 1,
  };
}

// --- Qualitative themes ------------------------------------------------------

const THEME_MAP: { title: string; keywords: string[] }[] = [
  { title: 'Clarity of Teaching', keywords: ['clear', 'clarity', 'explain', 'understand', 'teaching'] },
  { title: 'Pace of Delivery', keywords: ['pace', 'fast', 'slow', 'speed', 'time'] },
  { title: 'Practical Relevance', keywords: ['practical', 'example', 'real', 'workplace', 'application'] },
  { title: 'Assessment and Feedback', keywords: ['assessment', 'test', 'exam', 'assignment', 'feedback'] },
  { title: 'Learning Materials', keywords: ['material', 'slide', 'notes', 'resource', 'handout'] },
  { title: 'Engagement and Participation', keywords: ['engaging', 'participation', 'activity', 'discussion', 'interactive'] },
];

const COMMENT_COLUMN_HINTS = ['comment', 'feedback', 'suggestion', 'improve', 'remarks'];

export function detectQualitativeThemes(rows: DataRow[]): QualitativeTheme[] {
  if (rows.length === 0) return [];
  const columns = Object.keys(rows[0]);
  const textColumns = columns.filter((c) => {
    const lower = c.toLowerCase();
    return COMMENT_COLUMN_HINTS.some((h) => lower.includes(h));
  });

  const comments = textColumns.flatMap((column) =>
    rows.map((row) => String(row[column] ?? '').trim()).filter((v) => v.length > 0),
  );
  if (comments.length === 0) return [];

  return THEME_MAP.map((theme) => ({
    title: theme.title,
    comments: comments.filter((c) => {
      const lower = c.toLowerCase();
      return theme.keywords.some((k) => lower.includes(k));
    }),
  })).filter((theme) => theme.comments.length > 0);
}

// --- Derived selections ------------------------------------------------------

export interface Analysis {
  metadata: Metadata;
  currentSummaries: QuestionSummary[];
  comparisonSummaries: ComparisonSummary[];
  actionAreas: QuestionSummary[];
  strongestAreas: QuestionSummary[];
  lowerRatedAreas: QuestionSummary[];
  qualitativeThemes: QualitativeTheme[];
  currentHistogram: HistogramBin[];
  comparisonHistogram: HistogramBin[];
  threshold: number;
  hasComparison: boolean;
}

const formatQuestionList = (items: QuestionSummary[]): string =>
  items.length === 0
    ? 'no clearly detected areas'
    : items.map((i) => `${i.question} (${i.mean.toFixed(2)})`).join(', ');

const formatComparisonList = (items: ComparisonSummary[]): string =>
  items.length === 0
    ? 'no clearly detected areas'
    : items.map((i) => `${i.currentQuestion} (${i.change.toFixed(2)})`).join(', ');

/** Render a histogram's bins as "label: count" text lines. */
const formatHistogramLines = (bins: HistogramBin[]): string =>
  bins.map((b) => `${b.label}: ${b.count}`).join('\n');

/**
 * Build the full analytical report text. Sections are numbered sequentially as
 * they're written (via a running counter), so conditional sections (comparative
 * analysis, its histogram, qualitative feedback, cross-module, key
 * improvements) never leave a gap or a wrong number. Fixed section order
 * follows the spec: Executive Summary, Survey Overview, Summary Table,
 * Histogram of Current Results, Quantitative Analysis, [Comparative Analysis,
 * Histogram of Comparative Results], [Thematic Analysis], [Cross-Module
 * Pooled Analysis], [Key Improvements and Areas of Decline], Key Insights,
 * Recommendations, Conclusion. Style follows the requirements (formal
 * English, commas not em dashes, constructive, tables for data, histograms
 * for score distributions).
 */
export function buildReport(a: Analysis): string {
  const {
    metadata, currentSummaries, comparisonSummaries, threshold,
    actionAreas, strongestAreas, lowerRatedAreas, hasComparison, qualitativeThemes,
    currentHistogram, comparisonHistogram,
  } = a;

  const overallMean = calculateMean(currentSummaries.map((i) => i.mean));
  const improved = comparisonSummaries.filter((i) => i.direction === 'Improved');
  const declined = comparisonSummaries.filter((i) => i.direction === 'Declined');
  const stable = comparisonSummaries.filter((i) => i.direction === 'Stable');
  const comparisonAvailable = hasComparison && comparisonSummaries.length > 0;

  let r = '';
  r += `Student Survey Results Report for ${metadata.courseName}\n`;
  r += `Reporting Period: ${metadata.reportingPeriod}\n\n`;

  let n = 1;

  r += `${n}. Executive Summary\n`;
  r += `The results indicate an overall mean score of ${overallMean.toFixed(2)} across the detected quantitative survey items. Students rated ${formatQuestionList(strongestAreas)} particularly positively. The relatively lower-rated areas were ${formatQuestionList(lowerRatedAreas)}. `;
  r += actionAreas.length > 0
    ? `Based on the selected action threshold of ${threshold.toFixed(2)}, ${actionAreas.length} area or areas may benefit from further enhancement. `
    : `No detected quantitative area fell below the selected action threshold of ${threshold.toFixed(2)}. `;
  if (comparisonAvailable)
    r += `Compared with the comparison dataset, ${improved.length} item or items improved, ${declined.length} item or items declined, and ${stable.length} item or items remained broadly stable. `;
  r += `The findings provide a useful basis for strengthening course enhancement, teaching quality, learner experience, assessment design, and module delivery.\n\n`;
  n += 1;

  r += `${n}. Survey Overview\n`;
  r += `The survey relates to ${metadata.courseName}. The detected module name or names are ${metadata.moduleNames.join(', ')}. The reporting period is ${metadata.reportingPeriod}. The current dataset contains ${metadata.responseCount} response or responses. The survey evaluated ${currentSummaries.length} quantitative item or items. `;
  if (hasComparison) {
    r += comparisonSummaries.length > 0
      ? `Comparison data was provided and ${comparisonSummaries.length} comparable item or items were identified through exact or manual question mapping.`
      : `Comparison data was provided, but no comparable quantitative question mappings were identified.`;
  } else {
    r += `No comparison dataset was provided.`;
  }
  r += `\n\n`;
  n += 1;

  r += `${n}. Summary Table of Results\n`;
  r += `Survey Dimension / Question | Mean Score / Rating | Response Count | Interpretation\n`;
  for (const i of currentSummaries)
    r += `${i.question} | ${i.mean.toFixed(2)} | ${i.count} | ${i.interpretation}\n`;
  r += `\n`;

  if (comparisonAvailable) {
    r += `Comparison Summary\n`;
    r += `Current Question | Comparison Question | Match Type | Current Score | Comparison Score | Change | Direction of Change | Interpretation\n`;
    for (const i of comparisonSummaries)
      r += `${i.currentQuestion} | ${i.comparisonQuestion} | ${i.matchType} | ${i.currentMean.toFixed(2)} | ${i.comparisonMean.toFixed(2)} | ${i.change.toFixed(2)} | ${i.direction} | ${i.comment}\n`;
    r += `\n`;
  }
  n += 1;

  r += `${n}. Histogram of Current Survey Results\n`;
  r += `The histogram of current survey results shows how the detected survey questions are distributed across the score bands, providing a visual indication of whether results are concentrated at lower, moderate, or stronger levels of student rating.\n`;
  r += formatHistogramLines(currentHistogram);
  r += `\n\n`;
  n += 1;

  r += `${n}. Quantitative Analysis\n`;
  r += `The quantitative results show that the highest-rated areas were ${formatQuestionList(strongestAreas)}. These results suggest that students responded positively to these aspects of the course or module experience. The relatively lower-rated areas were ${formatQuestionList(lowerRatedAreas)}. These areas may benefit from further monitoring and enhancement, especially where the scores are close to or below the selected action threshold. `;
  r += actionAreas.length > 0
    ? `The areas below threshold were ${formatQuestionList(actionAreas)}. These results suggest that targeted action may be required to improve the learner experience in these specific areas.`
    : `As no item fell below the selected action threshold, the results suggest that the current quantitative performance is generally acceptable across the detected survey dimensions.`;
  r += `\n\n`;
  n += 1;

  if (comparisonAvailable) {
    r += `${n}. Comparative Analysis\n`;
    r += `The comparative analysis shows that the strongest improvements were observed in ${formatComparisonList(improved)}. Areas of relative decline were ${formatComparisonList(declined)}. Areas that remained broadly stable were ${formatComparisonList(stable)}. `;
    r += `The comparison included exact question matches and manually mapped similar questions where applicable. `;
    if (improved.length > 0)
      r += `The positive movements suggest that some aspects of teaching, delivery, learner support, materials, assessment, or engagement may have strengthened compared with the comparison dataset. `;
    if (declined.length > 0)
      r += `The declined areas should be reviewed constructively to identify whether refinements are needed in course delivery, assessment design, learning support, or student engagement. `;
    if (stable.length > 0)
      r += `The stable areas indicate continuity in the learner experience and should continue to be monitored.`;
    r += `\n\n`;
    n += 1;

    if (comparisonHistogram.length > 0) {
      r += `${n}. Histogram of Comparative Results\n`;
      r += `The histogram of comparative results shows the distribution of change across comparable items, indicating how many areas declined, remained broadly stable, or improved when compared against the comparison dataset.\n`;
      r += formatHistogramLines(comparisonHistogram);
      r += `\n\n`;
      n += 1;
    }
  }

  if (qualitativeThemes.length > 0) {
    r += `${n}. Thematic Analysis of Qualitative Feedback\n`;
    for (const theme of qualitativeThemes) {
      r += `${theme.title}\n`;
      r += `Student comments under this theme suggest that this area formed part of the learner experience. The comments indicate recurring attention to ${theme.title.toLowerCase()}, which may be considered when reviewing course delivery and learner support. `;
      r += `Illustrative comment: "${theme.comments[0]}"\n\n`;
    }
    n += 1;
  }

  if (metadata.hasMultipleModules) {
    r += `${n}. Cross-Module Pooled Analysis\n`;
    r += `The pooled findings across the detected modules suggest that students responded most positively to ${formatQuestionList(strongestAreas)}. Recurring areas for enhancement include ${formatQuestionList(lowerRatedAreas)}. The pooled results provide an institutional-level view of the learner experience and can support course-level quality monitoring.`;
    if (comparisonAvailable)
      r += ` In comparison with the comparison dataset, the pooled pattern shows ${improved.length} improved area or areas, ${declined.length} declined area or areas, and ${stable.length} broadly stable area or areas.`;
    r += `\n\n`;
    n += 1;
  }

  if (comparisonAvailable) {
    r += `${n}. Key Improvements and Areas of Decline\n`;
    r += `A. Areas of Improvement\n`;
    if (improved.length > 0)
      for (const i of improved)
        r += `${i.currentQuestion}: The current result was ${i.currentMean.toFixed(2)}, compared with ${i.comparisonMean.toFixed(2)}. This represents an improvement of ${i.change.toFixed(2)}, suggesting positive movement in this area.\n`;
    else r += `The results do not indicate any significant areas of improvement based on the provided comparable data.\n`;
    r += `\nB. Areas Requiring Attention\n`;
    if (declined.length > 0)
      for (const i of declined)
        r += `${i.currentQuestion}: The current result was ${i.currentMean.toFixed(2)}, compared with ${i.comparisonMean.toFixed(2)}. This represents a decline of ${Math.abs(i.change).toFixed(2)}, suggesting that further review may be useful.\n`;
    else r += `The results do not indicate any significant areas of decline based on the provided data.\n`;
    r += `\n`;
    n += 1;
  }

  r += `${n}. Key Insights\n`;
  r += `1. The overall mean score of ${overallMean.toFixed(2)} indicates the general level of student satisfaction across the detected quantitative survey dimensions.\n`;
  r += `2. The strongest current areas were ${formatQuestionList(strongestAreas)}, suggesting that these aspects are perceived positively by students.\n`;
  r += `3. The relatively lower-rated areas were ${formatQuestionList(lowerRatedAreas)}, indicating where further enhancement may be most useful.\n`;
  r += comparisonAvailable
    ? `4. Compared with the comparison dataset, the results show ${improved.length} improved item or items, ${declined.length} declined item or items, and ${stable.length} stable item or items.\n`
    : `4. As no comparison dataset was provided, the analysis focuses on the current cross-sectional survey results.\n`;
  r += `\n`;
  n += 1;

  r += `${n}. Recommendations\n`;
  r += `Teaching and Facilitation\n`;
  r += `Lecturers should review the lower-rated areas and identify practical teaching strategies that can improve clarity, engagement, pacing, and learner support.\n\n`;
  r += `Assessment and Feedback\n`;
  r += `Programme and module teams should review assessment-related items, especially where scores are relatively lower or below threshold, to ensure expectations, instructions, and feedback processes are clear.\n\n`;
  r += `Learning Materials and Resources\n`;
  r += `Learning materials should be reviewed to ensure that they remain clear, accessible, relevant, and aligned with the intended learning outcomes.\n\n`;
  r += `Student Engagement\n`;
  r += `Teaching teams should continue to strengthen classroom interaction, applied examples, and opportunities for learner participation.\n\n`;
  if (comparisonAvailable) {
    r += `Monitoring of Improvement Areas\n`;
    r += `Areas that improved should be reviewed to identify practices that can be sustained or standardised. Areas that declined should be monitored in the next review cycle, with targeted enhancement actions where appropriate.\n\n`;
  }
  n += 1;

  r += `${n}. Conclusion\n`;
  r += `Overall, the survey results provide a constructive picture of the current learner experience. The findings highlight areas of strength while identifying specific areas where enhancement may support teaching quality, course delivery, learner engagement, assessment design, and academic management.`;
  if (comparisonAvailable)
    r += ` Compared with the comparison dataset, the overall pattern should be interpreted through the identified improvements, declines, and areas of stability, with priority given to sustaining positive movement and addressing areas requiring further attention.`;

  return r;
}

/** Assemble the full analysis (selections + report inputs) from parsed data. */
export function analyse(
  currentRows: DataRow[],
  currentColumns: string[],
  threshold: number,
  comparison: { rows: DataRow[]; maps: ComparisonMap[] } | null,
): Analysis {
  const surveyColumns = detectSurveyColumns(currentRows, currentColumns);
  const currentSummaries = buildQuestionSummaries(currentRows, surveyColumns, threshold);
  const comparisonSummaries = comparison
    ? buildComparisonSummaries(currentRows, comparison.rows, comparison.maps)
    : [];

  return {
    metadata: detectMetadata(currentRows, currentColumns),
    currentSummaries,
    comparisonSummaries,
    actionAreas: currentSummaries.filter((i) => i.belowThreshold),
    strongestAreas: [...currentSummaries].sort((a, b) => b.mean - a.mean).slice(0, 3),
    lowerRatedAreas: [...currentSummaries].sort((a, b) => a.mean - b.mean).slice(0, 3),
    qualitativeThemes: detectQualitativeThemes(currentRows),
    currentHistogram: buildCurrentScoreHistogram(currentSummaries),
    comparisonHistogram: buildComparisonChangeHistogram(comparisonSummaries),
    threshold,
    hasComparison: comparison !== null,
  };
}
