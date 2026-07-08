// AI report writer for the Student Survey Analysis tool.
//
// Two responsibilities, kept separate so the first is pure and testable:
//   1. buildSurveyDataBlock(analysis) — turn the computed Analysis into a
//      compact, unambiguous text block of figures for the model to write from.
//   2. generateAiReport(...) — send that block plus the user's editable prompt
//      to Claude and return the report text.
//
// The call goes straight from the browser to api.anthropic.com. Anthropic
// gates browser calls behind an explicit opt-in header
// (anthropic-dangerous-direct-browser-access), acknowledging that the API key
// is exposed to the page — the same trade-off already accepted for the ERPNext
// secret here. This keeps the app a pure static site with no backend.

import type { Analysis, ComparisonSummary, QuestionSummary } from './surveyModel';

const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

const fmt = (n: number) => n.toFixed(2);

const listQuestions = (items: QuestionSummary[]): string =>
  items.length === 0
    ? 'none detected'
    : items.map((i) => `${i.question} (mean ${fmt(i.mean)})`).join('; ');

/**
 * Render the analysis as a plain-text data block. Deterministic and free of any
 * narrative — the model supplies the prose; this supplies only the facts, so
 * the report can never contain a figure that wasn't computed here.
 */
export function buildSurveyDataBlock(a: Analysis): string {
  const lines: string[] = [];
  const overallMean =
    a.currentSummaries.length === 0
      ? 0
      : a.currentSummaries.reduce((s, i) => s + i.mean, 0) / a.currentSummaries.length;

  lines.push('SURVEY DATA BLOCK (use only these figures)');
  lines.push('');
  lines.push('Metadata:');
  lines.push(`- Course: ${a.metadata.courseName}`);
  lines.push(`- Module(s): ${a.metadata.moduleNames.join(', ')}`);
  lines.push(`- Reporting period: ${a.metadata.reportingPeriod}`);
  lines.push(`- Multiple modules present: ${a.metadata.hasMultipleModules ? 'yes' : 'no'}`);
  lines.push(`- Action threshold: ${fmt(a.threshold)}`);
  lines.push(`- Overall mean across detected items: ${fmt(overallMean)}`);
  lines.push('');

  lines.push('Quantitative results (question | mean | response count | interpretation):');
  if (a.currentSummaries.length === 0) {
    lines.push('- none detected');
  } else {
    for (const i of a.currentSummaries) {
      lines.push(`- ${i.question} | ${fmt(i.mean)} | ${i.count} | ${i.interpretation}`);
    }
  }
  lines.push('');

  lines.push(`Strongest-rated areas: ${listQuestions(a.strongestAreas)}`);
  lines.push(`Lowest-rated areas: ${listQuestions(a.lowerRatedAreas)}`);
  lines.push(
    `Areas below the action threshold of ${fmt(a.threshold)}: ${listQuestions(a.actionAreas)}`,
  );
  lines.push('');

  lines.push('Comparison with a second dataset:');
  if (!a.hasComparison) {
    lines.push('- No comparison dataset was provided.');
  } else if (a.comparisonSummaries.length === 0) {
    lines.push('- Comparison data was provided, but no comparable questions were mapped.');
  } else {
    lines.push(
      '- Rows (current question | comparison question | match type | current mean | comparison mean | change | direction):',
    );
    for (const c of a.comparisonSummaries as ComparisonSummary[]) {
      lines.push(
        `  ${c.currentQuestion} | ${c.comparisonQuestion} | ${c.matchType} | ${fmt(c.currentMean)} | ${fmt(c.comparisonMean)} | ${fmt(c.change)} | ${c.direction}`,
      );
    }
  }
  lines.push('');

  lines.push('Qualitative feedback themes (with an illustrative comment each):');
  if (a.qualitativeThemes.length === 0) {
    lines.push('- No qualitative comments were detected.');
  } else {
    for (const t of a.qualitativeThemes) {
      const example = t.comments[0] ? ` — e.g. "${t.comments[0]}"` : '';
      lines.push(`- ${t.title} (${t.comments.length} comment(s))${example}`);
    }
  }
  lines.push('');

  lines.push('Histogram of current survey results (score band: question count):');
  for (const bin of a.currentHistogram) lines.push(`- ${bin.label}: ${bin.count}`);
  if (a.comparisonHistogram.length > 0) {
    lines.push('');
    lines.push('Histogram of comparative results (change band: item count):');
    for (const bin of a.comparisonHistogram) lines.push(`- ${bin.label}: ${bin.count}`);
  }

  return lines.join('\n');
}

export interface GenerateAiReportOptions {
  apiKey: string;
  model: string;
  /** The user-editable instruction that steers tone and structure. */
  prompt: string;
  /** The deterministic figures produced by buildSurveyDataBlock. */
  dataBlock: string;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
  maxTokens?: number;
}

/** A friendly, actionable error surfaced to the UI (never the raw API JSON). */
export class AiReportError extends Error {}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}
interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { type?: string; message?: string };
}

export interface AiReportResult {
  text: string;
  /** Token usage reported by the API (0 if the response omitted it). */
  inputTokens: number;
  outputTokens: number;
}

/**
 * Ask Claude to write the report. Returns the narrative plus token usage, or
 * throws an AiReportError whose message is safe to show the user.
 */
export async function generateAiReport(options: GenerateAiReportOptions): Promise<AiReportResult> {
  const { apiKey, model, prompt, dataBlock, fetchImpl = fetch, maxTokens = 4096 } = options;

  if (!apiKey.trim()) {
    throw new AiReportError(
      'No Anthropic API key is set. Add one in Settings, or the report will be written by the built-in (non-AI) writer.',
    );
  }

  let response: Response;
  try {
    response = await fetchImpl(ANTHROPIC_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey.trim(),
        'anthropic-version': ANTHROPIC_VERSION,
        // Opt in to direct browser access (no backend proxy in this app).
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system: prompt,
        messages: [{ role: 'user', content: dataBlock }],
      }),
    });
  } catch {
    throw new AiReportError(
      'Could not reach the Anthropic API. Check the network connection and try again.',
    );
  }

  let data: AnthropicResponse;
  try {
    data = (await response.json()) as AnthropicResponse;
  } catch {
    throw new AiReportError(
      `The Anthropic API returned an unexpected response (status ${response.status}).`,
    );
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new AiReportError('The Anthropic API key was rejected (401). Check the key in Settings.');
    }
    if (response.status === 429) {
      throw new AiReportError('Anthropic rate limit reached (429). Wait a moment and try again.');
    }
    const detail = data.error?.message ? `: ${data.error.message}` : '';
    throw new AiReportError(`The Anthropic API request failed (status ${response.status})${detail}.`);
  }

  const text = (data.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('')
    .trim();

  if (!text) {
    throw new AiReportError('The Anthropic API returned an empty report. Try again.');
  }
  return {
    text,
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}
