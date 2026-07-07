import { describe, it, expect, beforeEach } from 'vitest';
import {
  AI_LOG_STORAGE_KEY,
  AI_LOG_MAX_ENTRIES,
  loadAiLog,
  appendAiLog,
  clearAiLog,
  summariseAiLog,
  type NewAiLogEntry,
} from '../src/shared/aiLog';

class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  key(index: number) {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}
if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = new MemoryStorage();
}

beforeEach(() => localStorage.clear());

const ok = (over: Partial<NewAiLogEntry> = {}): NewAiLogEntry => ({
  tool: 'Student Survey Analysis',
  subject: 'Data Science',
  model: 'claude-opus-4-8',
  status: 'ok',
  promptSent: 'system + figures',
  output: 'the report',
  inputTokens: 1000,
  outputTokens: 500,
  ...over,
});

describe('aiLog', () => {
  it('uses an "ucc:"-prefixed key so it syncs with the workspace snapshot', () => {
    expect(AI_LOG_STORAGE_KEY.startsWith('ucc')).toBe(true);
  });

  it('appends newest-first and stamps id, timestamp, and estimated cost', () => {
    appendAiLog(ok({ subject: 'first' }));
    const list = appendAiLog(ok({ subject: 'second' }));
    expect(list.map((e) => e.subject)).toEqual(['second', 'first']);
    const entry = list[0];
    expect(entry.id).toBeTruthy();
    expect(entry.timestamp).toBeTruthy();
    // 1000 in @ $5/1M + 500 out @ $25/1M = 0.005 + 0.0125 = 0.0175
    expect(entry.costUsd).toBeCloseTo(0.0175);
    expect(loadAiLog()).toHaveLength(2);
  });

  it('records error entries with zero cost', () => {
    const [entry] = appendAiLog(
      ok({ status: 'error', output: '', inputTokens: 0, outputTokens: 0, error: 'boom' }),
    );
    expect(entry.status).toBe('error');
    expect(entry.error).toBe('boom');
    expect(entry.costUsd).toBe(0);
  });

  it('caps the log at the max size, dropping the oldest', () => {
    for (let i = 0; i < AI_LOG_MAX_ENTRIES + 5; i += 1) {
      appendAiLog(ok({ subject: `run-${i}` }));
    }
    const list = loadAiLog();
    expect(list).toHaveLength(AI_LOG_MAX_ENTRIES);
    // Newest kept, oldest dropped.
    expect(list[0].subject).toBe(`run-${AI_LOG_MAX_ENTRIES + 4}`);
    expect(list.some((e) => e.subject === 'run-0')).toBe(false);
  });

  it('summarises totals across entries', () => {
    appendAiLog(ok({ inputTokens: 1000, outputTokens: 500 }));
    appendAiLog(ok({ inputTokens: 2000, outputTokens: 1000 }));
    const totals = summariseAiLog(loadAiLog());
    expect(totals.count).toBe(2);
    expect(totals.inputTokens).toBe(3000);
    expect(totals.outputTokens).toBe(1500);
    expect(totals.costUsd).toBeGreaterThan(0);
  });

  it('clears the log', () => {
    appendAiLog(ok());
    expect(clearAiLog()).toEqual([]);
    expect(loadAiLog()).toEqual([]);
  });
});
