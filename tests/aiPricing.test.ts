import { describe, it, expect } from 'vitest';
import {
  estimateCost,
  isPriceEstimated,
  priceFor,
  formatUsd,
} from '../src/shared/aiPricing';

describe('aiPricing', () => {
  it('prices a known model from its per-1M rates', () => {
    // opus-4-8: $5/1M in, $25/1M out. 1M in + 1M out = 5 + 25 = 30.
    expect(estimateCost('claude-opus-4-8', 1_000_000, 1_000_000)).toBeCloseTo(30);
    // A realistic small report: 1500 in, 900 out.
    expect(estimateCost('claude-opus-4-8', 1500, 900)).toBeCloseTo(0.0075 + 0.0225);
  });

  it('falls back to opus-tier pricing for an unknown model and flags it', () => {
    expect(priceFor('some-future-model')).toEqual({ input: 5, output: 25 });
    expect(isPriceEstimated('some-future-model')).toBe(true);
    expect(isPriceEstimated('claude-haiku-4-5')).toBe(false);
  });

  it('haiku is cheaper than opus for the same usage', () => {
    const usage: [number, number] = [10_000, 5_000];
    expect(estimateCost('claude-haiku-4-5', ...usage)).toBeLessThan(
      estimateCost('claude-opus-4-8', ...usage),
    );
  });

  it('formats sub-cent costs with more precision', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(0.0075)).toBe('$0.0075');
    expect(formatUsd(1.5)).toBe('$1.50');
  });
});
