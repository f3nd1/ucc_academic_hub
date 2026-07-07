import { describe, it, expect } from 'vitest';
import { parseReviewPayload } from '../src/tools/review-planner/reviewSaved';

describe('parseReviewPayload', () => {
  it('accepts rows-only payloads (dates are recomputed, not stored)', () => {
    const p = parseReviewPayload({ version: 1, modules: [{ id: 'm1' }], courses: [] });
    expect(p).not.toBeNull();
    expect(p!.modules).toHaveLength(1);
  });

  it('rejects non-objects and missing row arrays', () => {
    expect(parseReviewPayload(null)).toBeNull();
    expect(parseReviewPayload({ modules: [] })).toBeNull();
    expect(parseReviewPayload({ modules: 'x', courses: [] })).toBeNull();
    expect(parseReviewPayload({ courses: [], modules: {} })).toBeNull();
  });
});
