import type { CourseReview, ModuleReview } from './reviewModel';

/**
 * A saved Module & Course Review dataset: just the raw table rows. The derived
 * dates (Module Review Date, Per Cycle, Scheduled Review Date, roll-ups) are
 * NOT stored — they recompute live from these rows on load, so a reopened
 * dataset never shows stale calculations.
 */
export interface ReviewPayload {
  version: 1;
  modules: ModuleReview[];
  courses: CourseReview[];
}

/** Validate an unknown payload (from Supabase) into a ReviewPayload, or null. */
export function parseReviewPayload(payload: unknown): ReviewPayload | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.modules) || !Array.isArray(p.courses)) return null;
  return p as unknown as ReviewPayload;
}
