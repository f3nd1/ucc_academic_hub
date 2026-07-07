import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  envSettings,
  envLockedKeys,
  loadSettings,
  saveSettings,
} from '../src/shared/settings';

// vitest runs in the node environment (no DOM) — a minimal in-memory
// localStorage stand-in is enough to exercise the storage functions.
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

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('envSettings / envLockedKeys', () => {
  it('is empty when no VITE_* vars are set', () => {
    expect(envSettings()).toEqual({});
    expect(envLockedKeys().size).toBe(0);
  });

  it('maps set VITE_* vars to their settings fields, trimmed', () => {
    vi.stubEnv('VITE_ERP_API_KEY', '  368b262e7b75bd0  ');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_ERP_API_SECRET', ''); // blank is treated as unset

    expect(envSettings()).toEqual({
      erpApiKey: '368b262e7b75bd0',
      supabaseUrl: 'https://x.supabase.co',
    });
    expect([...envLockedKeys()].sort()).toEqual(['erpApiKey', 'supabaseUrl']);
  });
});

describe('loadSettings with env', () => {
  it('lets a VITE_* value override the stored value', () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, erpApiKey: 'typed-in-browser' }),
    );
    vi.stubEnv('VITE_ERP_API_KEY', 'from-server-env');
    expect(loadSettings().erpApiKey).toBe('from-server-env');
  });

  it('falls back to the stored value when the env var is unset', () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, erpApiKey: 'typed-in-browser' }),
    );
    expect(loadSettings().erpApiKey).toBe('typed-in-browser');
  });

  it('applies env values even with no stored settings at all', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'abc.apps.googleusercontent.com');
    expect(loadSettings().googleClientId).toBe('abc.apps.googleusercontent.com');
  });
});

describe('saveSettings never persists env-locked fields', () => {
  it('drops env-provided keys from what is written to localStorage', () => {
    vi.stubEnv('VITE_ERP_API_SECRET', 'server-secret');
    saveSettings({
      ...DEFAULT_SETTINGS,
      erpApiSecret: 'server-secret', // came from env at load
      erpDocType: 'Course', // a normal typed value
    });
    const stored = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!);
    expect('erpApiSecret' in stored).toBe(false); // never written to disk
    expect(stored.erpDocType).toBe('Course'); // ordinary field persists
  });
});
