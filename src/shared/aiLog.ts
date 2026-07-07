// A lightweight audit log of every AI call the workspace makes, so a user can
// monitor what prompt was sent, what came back, and what it cost. Persisted
// per-browser under an "ucc:"-prefixed key, which means it also travels with
// the Supabase snapshot (supabaseSync syncs every "ucc"-prefixed key).
//
// This is a local monitoring aid, not a billing source of truth: the cost is an
// estimate (see aiPricing.ts) and the log is capped to a recent window.

import { estimateCost } from './aiPricing';

export const AI_LOG_STORAGE_KEY = 'ucc:ai-log';

/** Keep only the most recent N entries so the store can't grow unbounded. */
export const AI_LOG_MAX_ENTRIES = 100;

export interface AiLogEntry {
  id: string;
  /** ISO timestamp of when the call finished. */
  timestamp: string;
  /** Which tool made the call, e.g. "Student Survey Analysis". */
  tool: string;
  /** A human label for the run, e.g. the course or file name. */
  subject: string;
  model: string;
  status: 'ok' | 'error';
  /** The full prompt sent (system instructions + data block). */
  promptSent: string;
  /** The model's output, or '' for an error entry. */
  output: string;
  inputTokens: number;
  outputTokens: number;
  /** Estimated USD cost for this call. */
  costUsd: number;
  /** Present only when status is 'error'. */
  error?: string;
}

/** What a caller supplies; id/timestamp/cost are filled in by appendAiLog. */
export type NewAiLogEntry = Omit<AiLogEntry, 'id' | 'timestamp' | 'costUsd'>;

/** Read the log newest-first. Tolerates absent or corrupt storage. */
export function loadAiLog(): AiLogEntry[] {
  try {
    const raw = localStorage.getItem(AI_LOG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AiLogEntry[]) : [];
  } catch {
    return [];
  }
}

/** IDs need only be unique within this log; time + counter is plenty. */
let counter = 0;
function nextId(): string {
  counter += 1;
  return `ai-${Date.now().toString(36)}-${counter}`;
}

/**
 * Prepend an entry (stamping id, timestamp, and estimated cost), trim to the
 * cap, persist, and return the new list so the caller can update its state.
 */
export function appendAiLog(entry: NewAiLogEntry): AiLogEntry[] {
  const full: AiLogEntry = {
    ...entry,
    id: nextId(),
    timestamp: new Date().toISOString(),
    costUsd: estimateCost(entry.model, entry.inputTokens, entry.outputTokens),
  };
  const next = [full, ...loadAiLog()].slice(0, AI_LOG_MAX_ENTRIES);
  try {
    localStorage.setItem(AI_LOG_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Best effort; the returned list still drives the current session.
  }
  return next;
}

/** Empty the log. */
export function clearAiLog(): AiLogEntry[] {
  try {
    localStorage.removeItem(AI_LOG_STORAGE_KEY);
  } catch {
    // ignore
  }
  return [];
}

export interface AiLogTotals {
  count: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** Roll up totals across entries (used for the log's summary row). */
export function summariseAiLog(entries: AiLogEntry[]): AiLogTotals {
  return entries.reduce<AiLogTotals>(
    (acc, e) => ({
      count: acc.count + 1,
      inputTokens: acc.inputTokens + e.inputTokens,
      outputTokens: acc.outputTokens + e.outputTokens,
      costUsd: acc.costUsd + e.costUsd,
    }),
    { count: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
  );
}
