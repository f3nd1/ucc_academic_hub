import { describe, it, expect, vi } from 'vitest';
import { buildSurveyDataBlock, generateAiReport, AiReportError } from '../src/tools/survey/surveyAi';
import type { Analysis } from '../src/tools/survey/surveyModel';

const baseAnalysis = (over: Partial<Analysis> = {}): Analysis => ({
  metadata: {
    courseName: 'Data Science',
    moduleNames: ['Statistics'],
    reportingPeriod: 'March 2026',
    responseCount: 20,
    hasMultipleModules: false,
  },
  currentSummaries: [
    { question: 'Clarity', dimension: 'Clarity', shortLabel: 'Q1', mean: 4.5, count: 20, interpretation: 'Strong result.', belowThreshold: false },
    { question: 'Pace', dimension: 'Pace', shortLabel: 'Q2', mean: 2.8, count: 20, interpretation: 'Below threshold.', belowThreshold: true },
  ],
  comparisonSummaries: [],
  actionAreas: [
    { question: 'Pace', dimension: 'Pace', shortLabel: 'Q2', mean: 2.8, count: 20, interpretation: 'Below threshold.', belowThreshold: true },
  ],
  strongestAreas: [
    { question: 'Clarity', dimension: 'Clarity', shortLabel: 'Q1', mean: 4.5, count: 20, interpretation: 'Strong result.', belowThreshold: false },
  ],
  lowerRatedAreas: [
    { question: 'Pace', dimension: 'Pace', shortLabel: 'Q2', mean: 2.8, count: 20, interpretation: 'Below threshold.', belowThreshold: true },
  ],
  qualitativeThemes: [],
  currentHistogram: [
    { label: '2.00 to 2.99', count: 1 },
    { label: '4.50 to 5.00', count: 0 },
  ],
  comparisonHistogram: [],
  threshold: 3,
  hasComparison: false,
  ...over,
});

describe('buildSurveyDataBlock', () => {
  it('includes metadata, per-question rows, and the action threshold', () => {
    const block = buildSurveyDataBlock(baseAnalysis());
    expect(block).toContain('Course: Data Science');
    expect(block).toContain('Action threshold: 3.00');
    // Quantitative rows now use ref | dimension | mean | count | interpretation.
    expect(block).toContain('Q1 | Clarity | 4.50 | 20');
    expect(block).toContain('Q2 | Pace | 2.80 | 20');
    // overall mean = (4.5 + 2.8) / 2 = 3.65
    expect(block).toContain('Overall mean across detected items: 3.65');
    // Full wording is provided once, in the reference list.
    expect(block).toContain('Question reference');
  });

  it('states plainly when there is no comparison and no comments', () => {
    const block = buildSurveyDataBlock(baseAnalysis());
    expect(block).toContain('No comparison dataset was provided.');
    expect(block).toContain('No qualitative comments were detected.');
  });

  it('includes the current-results histogram bins', () => {
    const block = buildSurveyDataBlock(baseAnalysis());
    expect(block).toContain('2.00 to 2.99: 1');
    expect(block).toContain('4.50 to 5.00: 0');
  });

  it('renders comparison rows when a comparison is present', () => {
    const block = buildSurveyDataBlock(
      baseAnalysis({
        hasComparison: true,
        comparisonSummaries: [
          {
            currentQuestion: 'Clarity',
            comparisonQuestion: 'Clarity',
            matchType: 'Exact',
            currentDimension: 'Clarity',
            currentShortLabel: 'Q1',
            currentMean: 4.5,
            comparisonMean: 4.0,
            change: 0.5,
            direction: 'Improved',
            comment: 'up',
          },
        ],
      }),
    );
    // Comparison rows now use ref | dimension | match | current | comparison | change | direction.
    expect(block).toContain('Q1 | Clarity | Exact | 4.50 | 4.00 | 0.50 | Improved');
  });
});

describe('generateAiReport', () => {
  const okResponse = (text: string) =>
    ({
      ok: true,
      status: 200,
      json: async () => ({
        content: [{ type: 'text', text }],
        usage: { input_tokens: 1200, output_tokens: 800 },
      }),
    }) as unknown as Response;

  it('sends the required headers and body, and returns the report text + usage', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(okResponse('THE REPORT'));
    const result = await generateAiReport({
      apiKey: 'sk-test',
      model: 'claude-opus-4-8',
      prompt: 'be formal',
      dataBlock: 'FIGURES',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result.text).toBe('THE REPORT');
    expect(result.inputTokens).toBe(1200);
    expect(result.outputTokens).toBe(800);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-test');
    expect(headers['anthropic-version']).toBe('2023-06-01');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('claude-opus-4-8');
    expect(body.system).toBe('be formal');
    expect(body.messages).toEqual([{ role: 'user', content: 'FIGURES' }]);
  });

  it('throws a friendly error before calling fetch when the key is blank', async () => {
    const fetchImpl = vi.fn();
    await expect(
      generateAiReport({ apiKey: '  ', model: 'm', prompt: 'p', dataBlock: 'd', fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toBeInstanceOf(AiReportError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('maps a 401 to a key-rejected message', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'invalid x-api-key' } }),
    } as unknown as Response);
    await expect(
      generateAiReport({ apiKey: 'bad', model: 'm', prompt: 'p', dataBlock: 'd', fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/rejected \(401\)/);
  });

  it('maps a network failure to a reachability message', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(
      generateAiReport({ apiKey: 'k', model: 'm', prompt: 'p', dataBlock: 'd', fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/Could not reach the Anthropic API/);
  });

  it('throws when the response has no text content', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [] }),
    } as unknown as Response);
    await expect(
      generateAiReport({ apiKey: 'k', model: 'm', prompt: 'p', dataBlock: 'd', fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/empty report/);
  });
});
