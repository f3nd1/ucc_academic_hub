// Token pricing for the Anthropic models this app can call, so the AI log can
// show a per-report cost estimate. Prices are USD per 1,000,000 tokens and are
// a manual snapshot (kept alongside the model list in the claude-api guidance);
// the API does not return prices, so these must be updated by hand if Anthropic
// changes them. Cost shown in the app is always an ESTIMATE for this reason.

export interface ModelPrice {
  /** USD per 1M input tokens. */
  input: number;
  /** USD per 1M output tokens. */
  output: number;
}

/** Snapshot of list prices (per 1M tokens). Update if Anthropic's pricing changes. */
export const MODEL_PRICES: Record<string, ModelPrice> = {
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 3, output: 15 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
  'claude-fable-5': { input: 10, output: 50 },
};

/** Opus-tier is the safe default when a model id isn't in the table. */
const FALLBACK_PRICE: ModelPrice = { input: 5, output: 25 };

/** Look up a model's price, falling back to Opus-tier for unknown ids. */
export function priceFor(model: string): ModelPrice {
  return MODEL_PRICES[model] ?? FALLBACK_PRICE;
}

/** True when the model id wasn't in the table (so the cost is a rough guess). */
export function isPriceEstimated(model: string): boolean {
  return !(model in MODEL_PRICES);
}

/** Estimated USD cost for a call, from input/output token counts. */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const price = priceFor(model);
  return (inputTokens / 1_000_000) * price.input + (outputTokens / 1_000_000) * price.output;
}

/** Format a USD cost compactly: sub-cent amounts keep more precision. */
export function formatUsd(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}
