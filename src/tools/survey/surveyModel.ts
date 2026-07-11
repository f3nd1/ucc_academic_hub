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
  /** The exact original column name — used for row lookups and as an id. */
  question: string;
  /** Detected dimension/grouping, English only, e.g. "Assessment and Feedback". */
  dimension: string;
  /** Compact identifier for the report body, e.g. "Q1" (see deriveQuestionLabels). */
  shortLabel: string;
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
  /** Dimension + short label of the current question (mirrors QuestionSummary). */
  currentDimension: string;
  currentShortLabel: string;
  currentMean: number;
  comparisonMean: number;
  change: number;
  direction: Direction;
  comment: string;
}

export interface QuestionLabel {
  dimension: string;
  shortLabel: string;
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
  labels?: Map<string, QuestionLabel>,
): QuestionSummary[] {
  return columns.map((column) => {
    const values = rows
      .map((row) => convertLikertToNumber(row[column]))
      .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v));
    const mean = calculateMean(values);
    const { dimension, shortLabel } = labelFor(labels, column);
    return {
      question: column,
      dimension,
      shortLabel,
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
  labels?: Map<string, QuestionLabel>,
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
    const { dimension, shortLabel } = labelFor(labels, map.currentQuestion);

    return {
      ...map,
      currentDimension: dimension,
      currentShortLabel: shortLabel,
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

/**
 * Collapse embedded newlines/CR (from multi-line spreadsheet headers, e.g.
 * bilingual Google Forms exports that put a translation on a second line)
 * into a single space, for display only. Never applied to the underlying
 * question/column identifiers themselves (row lookups, map keys, and React
 * list keys all need the exact original string), only to text shown to a
 * person or written into a report.
 */
export function cleanLabel(s: string): string {
  return s.replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

// CJK ideographs, Kana, CJK symbols/punctuation, and fullwidth forms — used to
// find where the English part of a bilingual header ends.
const CJK_RANGE = /\p{Script=Han}/u;

/**
 * Derive a short, English-only dimension label from a survey column header.
 * Google Forms bilingual exports look like:
 *   "Assessment and Feedback 评估与反馈\r\nHow strongly do you agree ... [item 项目]"
 * The dimension is the English lead on the first line, before the translation.
 * Falls back to the cleaned header when there is no recognisable lead.
 */
export function deriveDimension(header: string): string {
  const firstLine = header.split(/[\r\n]+/)[0] ?? '';
  const cjkAt = firstLine.search(CJK_RANGE);
  const english = (cjkAt >= 0 ? firstLine.slice(0, cjkAt) : firstLine).trim();
  return english || cleanLabel(header);
}

/**
 * Assign each detected question column a compact reference label ("Q1", "Q2",
 * ...) in column order, plus its derived dimension. Keyed by the exact column
 * name so callers can look labels up from a question id. Computed once when a
 * dataset is analysed and reused everywhere, so the report body can refer to
 * questions by "Q3" instead of repeating the full bilingual sentence.
 */
export function deriveQuestionLabels(columns: string[]): Map<string, QuestionLabel> {
  const map = new Map<string, QuestionLabel>();
  columns.forEach((column, i) => {
    map.set(column, { dimension: deriveDimension(column), shortLabel: `Q${i + 1}` });
  });
  return map;
}

/** Look up a column's label, falling back to a derived one if absent. */
function labelFor(labels: Map<string, QuestionLabel> | undefined, column: string): QuestionLabel {
  return labels?.get(column) ?? { dimension: deriveDimension(column), shortLabel: column };
}

/** A signed, 2dp number, e.g. "+0.17" / "-0.83" — for change columns/prose. */
const signed = (n: number): string => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;

interface DimensionGroup {
  dimension: string;
  items: QuestionSummary[];
  avg: number;
}

/** Group question summaries by dimension, preserving first-seen order. */
function groupByDimension(items: QuestionSummary[]): DimensionGroup[] {
  const order: string[] = [];
  const map = new Map<string, QuestionSummary[]>();
  for (const it of items) {
    if (!map.has(it.dimension)) {
      map.set(it.dimension, []);
      order.push(it.dimension);
    }
    map.get(it.dimension)!.push(it);
  }
  return order.map((d) => {
    const arr = map.get(d)!;
    return { dimension: d, items: arr, avg: calculateMean(arr.map((x) => x.mean)) };
  });
}

interface ComparisonDimensionGroup {
  dimension: string;
  items: ComparisonSummary[];
  avgChange: number;
}

/** Group comparison summaries by the current question's dimension. */
function groupComparisonByDimension(items: ComparisonSummary[]): ComparisonDimensionGroup[] {
  const order: string[] = [];
  const map = new Map<string, ComparisonSummary[]>();
  for (const it of items) {
    if (!map.has(it.currentDimension)) {
      map.set(it.currentDimension, []);
      order.push(it.currentDimension);
    }
    map.get(it.currentDimension)!.push(it);
  }
  return order.map((d) => {
    const arr = map.get(d)!;
    return { dimension: d, items: arr, avgChange: calculateMean(arr.map((x) => x.change)) };
  });
}

/** Short qualitative phrase for a dimension average, relative to threshold. */
function dimensionPhrase(avg: number, threshold: number): string {
  if (avg < threshold) return 'below the action threshold';
  if (avg >= 4.2) return 'a strong result';
  if (avg >= 3.5) return 'a generally positive result';
  return 'a moderate result';
}

/** Join whole sentences until adding the next would exceed maxWords. */
function capToWords(sentences: string[], maxWords: number): string {
  const out: string[] = [];
  let count = 0;
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s) continue;
    const w = s.split(/\s+/).length;
    if (out.length > 0 && count + w > maxWords) break;
    out.push(s);
    count += w;
  }
  return out.join(' ');
}

// --- Structured report -------------------------------------------------------
//
// The report is built once as a list of typed blocks (the single source of
// truth for content and wording), which the UI renders as real HTML (tables,
// headings, paragraphs) and which a plain-text renderer flattens for
// Word/PDF export and for buildReport()'s string API. This avoids duplicating
// the prose in two places and, critically, avoids ever showing a pipe-
// delimited "table" as raw pre-wrapped text (which, combined with the
// embedded newlines in bilingual headers, was unreadable).

export type ReportBlock =
  | { type: 'title'; course: string; period: string }
  | { type: 'heading'; text: string }
  | { type: 'subheading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'histogram'; title: string; bins: HistogramBin[] };

/**
 * Build the report as a list of typed blocks. Sections are numbered
 * sequentially as they're written (via a running counter), so conditional
 * sections (comparative analysis, its histogram, qualitative feedback,
 * cross-module, key improvements) never leave a gap or a wrong number. Fixed
 * section order follows the spec: Executive Summary, Survey Overview,
 * Summary Table, Histogram of Current Results, Quantitative Analysis,
 * [Comparative Analysis, Histogram of Comparative Results], [Thematic
 * Analysis], [Cross-Module Pooled Analysis], [Key Improvements and Areas of
 * Decline], Key Insights, Recommendations, Conclusion. Style follows the
 * requirements (formal English, commas not em dashes, constructive).
 */
export function buildReportBlocks(a: Analysis): ReportBlock[] {
  const {
    metadata, currentSummaries, comparisonSummaries, threshold,
    actionAreas, hasComparison, qualitativeThemes,
    currentHistogram, comparisonHistogram,
  } = a;

  const overallMean = calculateMean(currentSummaries.map((i) => i.mean));
  const improved = comparisonSummaries.filter((i) => i.direction === 'Improved');
  const declined = comparisonSummaries.filter((i) => i.direction === 'Declined');
  const stable = comparisonSummaries.filter((i) => i.direction === 'Stable');
  const comparisonAvailable = hasComparison && comparisonSummaries.length > 0;

  // Dimension roll-ups drive the concise, grouped prose (never per-question).
  const dimGroups = groupByDimension(currentSummaries);
  const byAvgDesc = [...dimGroups].sort((x, y) => y.avg - x.avg);
  const strongDims = byAvgDesc.slice(0, 2);
  const weakDim = byAvgDesc[byAvgDesc.length - 1];
  // Per-question comparison lookup for the summary table's comparison columns.
  const compByCurrent = new Map(comparisonSummaries.map((c) => [c.currentQuestion, c]));

  const blocks: ReportBlock[] = [];
  const heading = (text: string) => blocks.push({ type: 'heading', text });
  const subheading = (text: string) => blocks.push({ type: 'subheading', text });
  const paragraph = (text: string) => blocks.push({ type: 'paragraph', text });

  blocks.push({ type: 'title', course: metadata.courseName, period: metadata.reportingPeriod });

  let n = 1;

  // 1. Executive Summary — synthesised, dimension-level, capped at 120 words.
  heading(`${n}. Executive Summary`);
  {
    const sentences: string[] = [];
    sentences.push(
      `Across ${metadata.responseCount} response${metadata.responseCount === 1 ? '' : 's'}, the survey returned an overall mean of ${overallMean.toFixed(2)} on a five-point scale.`,
    );
    if (strongDims.length > 0) {
      const names = strongDims.map((d) => d.dimension).join(' and ');
      sentences.push(
        `The strongest ${strongDims.length > 1 ? 'dimensions were' : 'dimension was'} ${names}, rated around ${strongDims[0].avg.toFixed(2)}.`,
      );
    }
    if (weakDim && (strongDims.length === 0 || weakDim.dimension !== strongDims[0].dimension)) {
      const below = weakDim.avg < threshold ? `, below the action threshold of ${threshold.toFixed(2)}` : '';
      sentences.push(`The lowest-rated dimension was ${weakDim.dimension} at ${weakDim.avg.toFixed(2)}${below}.`);
    }
    if (actionAreas.length > 0) {
      sentences.push(`${actionAreas.length} item${actionAreas.length === 1 ? '' : 's'} fell below the action threshold and warrant attention.`);
    }
    if (comparisonAvailable) {
      const trend = improved.length > declined.length ? 'improving' : declined.length > improved.length ? 'declining' : 'broadly stable';
      sentences.push(
        `Against the comparison dataset, ${improved.length} improved, ${declined.length} declined, and ${stable.length} were broadly stable, an overall ${trend} pattern.`,
      );
    }
    paragraph(capToWords(sentences, 120));
  }
  n += 1;

  // 2. Survey Overview — the one place metadata/counts are stated.
  heading(`${n}. Survey Overview`);
  {
    let p = `The survey relates to ${metadata.courseName}. The detected module name or names are ${metadata.moduleNames.join(', ')}. The reporting period is ${metadata.reportingPeriod}. The current dataset contains ${metadata.responseCount} response or responses. The survey evaluated ${currentSummaries.length} quantitative item or items across ${dimGroups.length} dimension or dimensions. `;
    if (hasComparison) {
      p += comparisonSummaries.length > 0
        ? `Comparison data was provided and ${comparisonSummaries.length} comparable item or items were identified through exact or manual question mapping.`
        : `Comparison data was provided, but no comparable quantitative question mappings were identified.`;
    } else {
      p += `No comparison dataset was provided.`;
    }
    paragraph(p);
  }
  n += 1;

  // 3. Summary Table — dimension + short label + scores only (no raw question text).
  heading(`${n}. Summary Table of Results`);
  if (comparisonAvailable) {
    blocks.push({
      type: 'table',
      headers: ['Dimension', 'Ref', 'Current avg', 'Comparison avg', 'Δ change'],
      rows: currentSummaries.map((i) => {
        const c = compByCurrent.get(i.question);
        return [
          i.dimension, i.shortLabel, i.mean.toFixed(2),
          c ? c.comparisonMean.toFixed(2) : '—',
          c ? signed(c.change) : '—',
        ];
      }),
    });
  } else {
    blocks.push({
      type: 'table',
      headers: ['Dimension', 'Ref', 'Current avg', 'Interpretation'],
      rows: currentSummaries.map((i) => [i.dimension, i.shortLabel, i.mean.toFixed(2), i.interpretation]),
    });
  }
  n += 1;

  // 4. Histogram of Current Survey Results.
  heading(`${n}. Histogram of Current Survey Results`);
  paragraph('The histogram below shows how the detected survey questions are distributed across the score bands, indicating whether results concentrate at lower, moderate, or stronger levels of student rating.');
  blocks.push({ type: 'histogram', title: 'Current Survey Results Histogram', bins: currentHistogram });
  n += 1;

  // 5. Quantitative Analysis — grouped by dimension, short labels only.
  heading(`${n}. Quantitative Analysis`);
  for (const g of dimGroups) {
    let p = `${g.dimension} averaged ${g.avg.toFixed(2)}, ${dimensionPhrase(g.avg, threshold)}.`;
    if (g.items.length > 1) {
      const sorted = [...g.items].sort((x, y) => y.mean - x.mean);
      const top = sorted[0];
      const low = sorted[sorted.length - 1];
      if (top.mean !== low.mean)
        p += ` Ratings ranged from ${low.shortLabel} (${low.mean.toFixed(2)}) to ${top.shortLabel} (${top.mean.toFixed(2)}).`;
    }
    const below = g.items.filter((i) => i.belowThreshold);
    if (below.length > 0)
      p += ` Below the action threshold: ${below.map((i) => i.shortLabel).join(', ')}.`;
    paragraph(p);
  }
  n += 1;

  if (comparisonAvailable) {
    // 6. Comparative Analysis — grouped by dimension, short labels only.
    heading(`${n}. Comparative Analysis`);
    for (const g of groupComparisonByDimension(comparisonSummaries)) {
      const dir = classifyDirection(g.avgChange);
      let p = `${g.dimension} moved ${signed(g.avgChange)} overall against the comparison dataset (${dir.toLowerCase()}).`;
      if (g.items.length > 1) {
        const sorted = [...g.items].sort((x, y) => y.change - x.change);
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];
        if (best.change !== worst.change)
          p += ` The largest gain was ${best.currentShortLabel} (${signed(best.change)}) and the largest drop was ${worst.currentShortLabel} (${signed(worst.change)}).`;
      }
      paragraph(p);
    }
    n += 1;

    if (comparisonHistogram.length > 0) {
      heading(`${n}. Histogram of Comparative Results`);
      paragraph('The histogram below shows the distribution of change across comparable items, indicating how many areas declined, remained broadly stable, or improved against the comparison dataset.');
      blocks.push({ type: 'histogram', title: 'Comparative Results Histogram', bins: comparisonHistogram });
      n += 1;
    }
  }

  if (qualitativeThemes.length > 0) {
    heading(`${n}. Thematic Analysis of Qualitative Feedback`);
    for (const theme of qualitativeThemes) {
      subheading(theme.title);
      paragraph(
        `Student comments under this theme indicate recurring attention to ${theme.title.toLowerCase()}, which may be considered when reviewing course delivery and learner support. Illustrative comment: "${theme.comments[0]}"`,
      );
    }
    n += 1;
  }

  if (metadata.hasMultipleModules) {
    heading(`${n}. Cross-Module Pooled Analysis`);
    {
      let p = `Pooled across the detected modules, students responded most positively in ${strongDims.map((d) => d.dimension).join(' and ')}. Recurring areas for enhancement centre on ${weakDim ? weakDim.dimension : 'no clearly detected area'}. The pooled view supports course-level quality monitoring.`;
      if (comparisonAvailable)
        p += ` The pooled pattern shows ${improved.length} improved, ${declined.length} declined, and ${stable.length} broadly stable item or items.`;
      paragraph(p);
    }
    n += 1;
  }

  if (comparisonAvailable) {
    // Key Improvements / Decline as compact tables (short label + dimension + scores).
    heading(`${n}. Key Improvements and Areas of Decline`);
    subheading('A. Areas of Improvement');
    if (improved.length > 0) {
      blocks.push({
        type: 'table',
        headers: ['Ref', 'Dimension', 'Current', 'Comparison', 'Δ'],
        rows: [...improved]
          .sort((x, y) => y.change - x.change)
          .map((i) => [i.currentShortLabel, i.currentDimension, i.currentMean.toFixed(2), i.comparisonMean.toFixed(2), signed(i.change)]),
      });
    } else {
      paragraph('The results do not indicate any significant areas of improvement based on the provided comparable data.');
    }
    subheading('B. Areas Requiring Attention');
    if (declined.length > 0) {
      blocks.push({
        type: 'table',
        headers: ['Ref', 'Dimension', 'Current', 'Comparison', 'Δ'],
        rows: [...declined]
          .sort((x, y) => x.change - y.change)
          .map((i) => [i.currentShortLabel, i.currentDimension, i.currentMean.toFixed(2), i.comparisonMean.toFixed(2), signed(i.change)]),
      });
    } else {
      paragraph('The results do not indicate any significant areas of decline based on the provided data.');
    }
    n += 1;
  }

  heading(`${n}. Key Insights`);
  paragraph(`1. The overall mean of ${overallMean.toFixed(2)} reflects the general level of student satisfaction across the ${dimGroups.length} detected dimension or dimensions.`);
  paragraph(`2. The strongest ${strongDims.length > 1 ? 'dimensions were' : 'dimension was'} ${strongDims.map((d) => `${d.dimension} (${d.avg.toFixed(2)})`).join(', ')}.`);
  paragraph(`3. The area most in need of enhancement is ${weakDim ? `${weakDim.dimension} (${weakDim.avg.toFixed(2)})` : 'no clearly detected area'}.`);
  paragraph(
    comparisonAvailable
      ? `4. Against the comparison dataset, ${improved.length} improved, ${declined.length} declined, and ${stable.length} remained broadly stable.`
      : `4. As no comparison dataset was provided, the analysis focuses on the current cross-sectional survey results.`,
  );
  n += 1;

  heading(`${n}. Recommendations`);
  subheading('Teaching and Facilitation');
  paragraph('Lecturers should review the lower-rated dimensions and identify practical teaching strategies that can improve clarity, engagement, pacing, and learner support.');
  subheading('Assessment and Feedback');
  paragraph('Programme and module teams should review assessment-related items, especially where scores are relatively lower or below threshold, to ensure expectations, instructions, and feedback processes are clear.');
  subheading('Learning Materials and Resources');
  paragraph('Learning materials should be reviewed to ensure that they remain clear, accessible, relevant, and aligned with the intended learning outcomes.');
  subheading('Student Engagement');
  paragraph('Teaching teams should continue to strengthen classroom interaction, applied examples, and opportunities for learner participation.');
  if (comparisonAvailable) {
    subheading('Monitoring of Improvement Areas');
    paragraph('Areas that improved should be reviewed to identify practices that can be sustained or standardised. Areas that declined should be monitored in the next review cycle, with targeted enhancement actions where appropriate.');
  }
  n += 1;

  heading(`${n}. Conclusion`);
  {
    let p = `Overall, the survey results provide a constructive picture of the current learner experience, highlighting areas of strength while identifying specific dimensions where enhancement may support teaching quality, course delivery, learner engagement, and assessment design.`;
    if (comparisonAvailable)
      p += ` The comparison should be interpreted through the identified improvements, declines, and areas of stability, with priority given to sustaining positive movement and addressing areas requiring further attention.`;
    paragraph(p);
  }
  n += 1;

  // Final appendix — the ONLY place the full original question wording appears.
  heading(`${n}. Question Reference`);
  paragraph('The full original wording of each question, including the original bilingual text, is listed once here. All sections above refer to these questions by their short labels.');
  blocks.push({
    type: 'table',
    headers: ['Ref', 'Dimension', 'Full question text'],
    rows: currentSummaries.map((i) => [i.shortLabel, i.dimension, cleanLabel(i.question)]),
  });

  return blocks;
}

/** Flatten report blocks into the plain-text form (headings, pipe-delimited
 *  table rows, "label: count" histogram lines) used by buildReport()'s string
 *  API and as a text fallback for exports. */
export function renderBlocksAsPlainText(blocks: ReportBlock[]): string {
  const lines: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case 'title':
        lines.push(`Student Survey Results Report for ${b.course}`, `Reporting Period: ${b.period}`, '');
        break;
      case 'heading':
      case 'subheading':
        lines.push(b.text);
        break;
      case 'paragraph':
        lines.push(b.text, '');
        break;
      case 'table':
        lines.push(b.headers.join(' | '));
        for (const row of b.rows) lines.push(row.join(' | '));
        lines.push('');
        break;
      case 'histogram':
        for (const bin of b.bins) lines.push(`${bin.label}: ${bin.count}`);
        lines.push('');
        break;
    }
  }
  return lines.join('\n');
}

/** Build the full analytical report as plain text (see buildReportBlocks for
 *  the structured version the UI and exports render). */
export function buildReport(a: Analysis): string {
  return renderBlocksAsPlainText(buildReportBlocks(a));
}

/** Assemble the full analysis (selections + report inputs) from parsed data. */
export function analyse(
  currentRows: DataRow[],
  currentColumns: string[],
  threshold: number,
  comparison: { rows: DataRow[]; maps: ComparisonMap[] } | null,
): Analysis {
  const surveyColumns = detectSurveyColumns(currentRows, currentColumns);
  // One label set (Q1..Qn + dimension), derived once and shared by the current
  // and comparison summaries so the same question reads the same everywhere.
  const labels = deriveQuestionLabels(surveyColumns);
  const currentSummaries = buildQuestionSummaries(currentRows, surveyColumns, threshold, labels);
  const comparisonSummaries = comparison
    ? buildComparisonSummaries(currentRows, comparison.rows, comparison.maps, labels)
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
