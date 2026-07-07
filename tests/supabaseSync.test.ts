import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  snapshotLocalStorage,
  applySnapshot,
  testSupabaseConnection,
  saveToSupabase,
  loadFromSupabase,
} from '../src/shared/supabaseSync';
import { DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY, type AppSettings } from '../src/shared/settings';

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

const SETTINGS: AppSettings = {
  ...DEFAULT_SETTINGS,
  erpApiKey: 'the-key',
  supabaseUrl: 'https://miwtrwmyfgcepcgxjryo.supabase.co/',
  supabaseAnonKey: 'anon-key',
};

describe('snapshotLocalStorage', () => {
  it('only includes "ucc"-prefixed keys, dropping anything else', () => {
    localStorage.setItem('ucc-timetable-settings', JSON.stringify(SETTINGS));
    localStorage.setItem('ucc:timetable:state', '{"a":1}');
    localStorage.setItem('some-other-app-key', 'should not be captured');

    const snap = snapshotLocalStorage();
    expect(Object.keys(snap).sort()).toEqual([
      'ucc-timetable-settings',
      'ucc:timetable:state',
    ]);
  });

  it('strips the Supabase connection fields out of the settings entry before it can travel anywhere', () => {
    localStorage.setItem('ucc-timetable-settings', JSON.stringify(SETTINGS));
    const snap = snapshotLocalStorage();
    const savedSettings = JSON.parse(snap[SETTINGS_STORAGE_KEY]) as Record<string, unknown>;
    expect(savedSettings.supabaseUrl).toBeUndefined();
    expect(savedSettings.supabaseAnonKey).toBeUndefined();
    expect(savedSettings.erpApiKey).toBe('the-key'); // everything else survives
  });
});

describe('applySnapshot', () => {
  it('writes every key from the snapshot into localStorage', () => {
    applySnapshot({ 'ucc:timetable:state': '{"x":2}', 'ucc-tour-done': 'true' });
    expect(localStorage.getItem('ucc:timetable:state')).toBe('{"x":2}');
    expect(localStorage.getItem('ucc-tour-done')).toBe('true');
  });

  it("preserves THIS browser's Supabase connection fields instead of blanking them", () => {
    // This browser is already connected to Supabase...
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({ ...DEFAULT_SETTINGS, supabaseUrl: 'https://keep-me.supabase.co' }),
    );
    // ...and the downloaded snapshot (as snapshotLocalStorage would produce it)
    // has no Supabase fields at all, plus a different erpApiKey from elsewhere.
    const incoming = JSON.stringify({ ...DEFAULT_SETTINGS, erpApiKey: 'from-other-browser' });
    applySnapshot({ [SETTINGS_STORAGE_KEY]: incoming });

    const merged = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY)!);
    expect(merged.supabaseUrl).toBe('https://keep-me.supabase.co'); // preserved, not wiped
    expect(merged.erpApiKey).toBe('from-other-browser'); // everything else applied
  });
});

const stubFetch = (impl: (url: string, init?: RequestInit) => Promise<Response>) => {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return impl(url, init);
    }),
  );
  return calls;
};

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    statusText: status === 401 ? 'Unauthorized' : status === 404 ? 'Not Found' : 'OK',
    headers: { 'Content-Type': 'application/json' },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('testSupabaseConnection', () => {
  it('requires the Project URL and Anon key before calling out', async () => {
    const result = await testSupabaseConnection({ ...DEFAULT_SETTINGS });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Supabase Project URL and Anon key');
  });

  it('reports success when the row is reachable, hitting the table endpoint directly (no RPC, no passcode)', async () => {
    const calls = stubFetch(() => Promise.resolve(jsonResponse(200, [{ id: 1 }])));
    const result = await testSupabaseConnection(SETTINGS);
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe(
      'https://miwtrwmyfgcepcgxjryo.supabase.co/rest/v1/ucc_workspace_sync?id=eq.1&select=id',
    );
    expect((calls[0].init!.headers as Record<string, string>).apikey).toBe('anon-key');
  });

  it('reports a helpful hint when the row is missing (schema.sql not run yet)', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(200, [])));
    const result = await testSupabaseConnection(SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('one-time setup SQL');
  });

  it('surfaces a 401/403 as an auth failure', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(401, { message: 'Invalid API key' })));
    const result = await testSupabaseConnection(SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Project URL and Anon key are correct');
  });

  it('reports a thrown fetch as a reachability failure', async () => {
    stubFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    const result = await testSupabaseConnection(SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Could not reach Supabase');
  });
});

describe('saveToSupabase', () => {
  it('PATCHes the sanitized snapshot to the table row directly (no RPC)', async () => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(SETTINGS));
    localStorage.setItem('ucc:timetable:state', '{"lessons":[]}');
    const calls = stubFetch(() => Promise.resolve(jsonResponse(200, [{ id: 1 }])));

    const result = await saveToSupabase(SETTINGS);
    expect(result.ok).toBe(true);
    expect(calls[0].url).toBe(
      'https://miwtrwmyfgcepcgxjryo.supabase.co/rest/v1/ucc_workspace_sync?id=eq.1',
    );
    expect((calls[0].init as RequestInit).method).toBe('PATCH');
    const body = JSON.parse((calls[0].init as RequestInit).body as string);
    expect(body.data['ucc:timetable:state']).toBe('{"lessons":[]}');
    // The uploaded settings entry never carries this browser's own Supabase fields.
    const uploadedSettings = JSON.parse(body.data[SETTINGS_STORAGE_KEY]);
    expect(uploadedSettings.supabaseAnonKey).toBeUndefined();
  });

  it('reports when no row was updated instead of silently succeeding', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(200, [])));
    const result = await saveToSupabase(SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Nothing was saved');
  });

  it('surfaces an auth failure', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(401, { message: 'Invalid API key' })));
    const result = await saveToSupabase(SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Anon key are correct');
  });
});

describe('loadFromSupabase', () => {
  it('GETs the row and applies its data to localStorage', async () => {
    stubFetch((url) => {
      expect(url).toBe(
        'https://miwtrwmyfgcepcgxjryo.supabase.co/rest/v1/ucc_workspace_sync?id=eq.1&select=data',
      );
      return Promise.resolve(
        jsonResponse(200, [{ data: { 'ucc:timetable:state': '{"lessons":[1]}' } }]),
      );
    });
    const result = await loadFromSupabase(SETTINGS);
    expect(result.ok).toBe(true);
    expect(localStorage.getItem('ucc:timetable:state')).toBe('{"lessons":[1]}');
  });

  it('treats an empty data blob as "nothing saved yet", not silent success', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(200, [{ data: {} }])));
    const result = await loadFromSupabase(SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Nothing has been saved');
  });

  it('reports a missing row with the setup hint, without applying anything', async () => {
    stubFetch(() => Promise.resolve(jsonResponse(200, [])));
    const result = await loadFromSupabase(SETTINGS);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('one-time setup SQL');
  });
});
