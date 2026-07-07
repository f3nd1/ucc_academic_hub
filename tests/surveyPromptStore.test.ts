import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_SURVEY_PROMPT,
  SURVEY_PROMPT_STORAGE_KEY,
  loadSurveyPrompt,
  saveSurveyPrompt,
} from '../src/tools/survey/surveyPromptStore';

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

describe('surveyPromptStore', () => {
  it('returns the default prompt when nothing is stored', () => {
    expect(loadSurveyPrompt()).toBe(DEFAULT_SURVEY_PROMPT);
  });

  it('persists a custom prompt and reads it back', () => {
    saveSurveyPrompt('write tersely');
    expect(localStorage.getItem(SURVEY_PROMPT_STORAGE_KEY)).toBe('write tersely');
    expect(loadSurveyPrompt()).toBe('write tersely');
  });

  it('uses an "ucc:"-prefixed key so it syncs with the workspace snapshot', () => {
    expect(SURVEY_PROMPT_STORAGE_KEY.startsWith('ucc')).toBe(true);
  });

  it('clearing (blank save) restores the default', () => {
    saveSurveyPrompt('custom');
    saveSurveyPrompt('   ');
    expect(localStorage.getItem(SURVEY_PROMPT_STORAGE_KEY)).toBeNull();
    expect(loadSurveyPrompt()).toBe(DEFAULT_SURVEY_PROMPT);
  });
});
