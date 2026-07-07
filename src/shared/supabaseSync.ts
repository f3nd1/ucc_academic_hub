import type { AppSettings } from './settings';
import { SETTINGS_STORAGE_KEY, envLockedKeys } from './settings';

// ---------------------------------------------------------------------------
// Cloud sync (Supabase) — save/load the whole workspace's localStorage as one
// JSON snapshot in a single Supabase table row.
// ---------------------------------------------------------------------------
// No extra passcode: anyone who has this Project URL and Anon key can read or
// overwrite everything saved here — the Anon key is not really secret (it
// ships in the app's public JS bundle), so treat the Project URL itself as
// the thing to keep private. This is a simple shared-team convenience, not a
// security boundary — appropriate for a small internal tool, not a substitute
// for real per-user auth.
//
// Unlike ERPNext, Supabase's REST API sends permissive CORS headers by
// design (it is meant to be called directly from browsers), so this talks to
// Supabase directly — no same-origin proxy needed here.
// ---------------------------------------------------------------------------

/** Every localStorage key this app writes starts with "ucc" (either the
 *  "ucc:<tool>:*" namespaced convention or older "ucc-*" keys). */
const isAppKey = (key: string): boolean => key.startsWith('ucc');

/** Local-only Settings fields: the connection info for reaching Supabase
 *  itself. Never included in what gets uploaded — see the module comment. */
const LOCAL_ONLY_SETTINGS_KEYS = ['supabaseUrl', 'supabaseAnonKey'] as const;

const sanitizeSettingsJson = (raw: string): string => {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const k of LOCAL_ONLY_SETTINGS_KEYS) delete obj[k];
    // Env-provided fields live in each server's .env — never push them to the
    // cloud (every deployment supplies its own, and secrets shouldn't travel).
    for (const k of envLockedKeys()) delete obj[k];
    return JSON.stringify(obj);
  } catch {
    return raw;
  }
};

/** Snapshot every app-owned localStorage key into a plain string map, with
 *  this browser's Supabase connection fields stripped from the settings
 *  entry before it travels anywhere. */
export function snapshotLocalStorage(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !isAppKey(key)) continue;
    const value = localStorage.getItem(key);
    if (value === null) continue;
    out[key] = key === SETTINGS_STORAGE_KEY ? sanitizeSettingsJson(value) : value;
  }
  return out;
}

/**
 * Write a downloaded snapshot back into localStorage. The snapshot never
 * contains this browser's Supabase connection fields (snapshotLocalStorage
 * strips them before upload) — so those are preserved from what's already in
 * this browser rather than being blanked out by the incoming data.
 */
export function applySnapshot(snapshot: Record<string, string>): void {
  const currentRaw = localStorage.getItem(SETTINGS_STORAGE_KEY);
  const preserved: Record<string, unknown> = {};
  if (currentRaw) {
    try {
      const cur = JSON.parse(currentRaw) as Record<string, unknown>;
      for (const k of LOCAL_ONLY_SETTINGS_KEYS) {
        if (k in cur) preserved[k] = cur[k];
      }
    } catch {
      /* ignore */
    }
  }

  for (const [key, value] of Object.entries(snapshot)) {
    if (key === SETTINGS_STORAGE_KEY) {
      try {
        const obj = JSON.parse(value) as Record<string, unknown>;
        Object.assign(obj, preserved);
        localStorage.setItem(key, JSON.stringify(obj));
        continue;
      } catch {
        /* fall through to a raw write below */
      }
    }
    localStorage.setItem(key, value);
  }
}

export interface SyncResult {
  ok: boolean;
  message: string;
}

/** The single-row table (see supabase/schema.sql) holding the whole snapshot. */
const TABLE = 'ucc_workspace_sync';

const tableUrl = (baseUrl: string, query: string): string =>
  `${baseUrl.replace(/\/+$/, '')}/rest/v1/${TABLE}?${query}`;

const authHeaders = (anonKey: string): HeadersInit => ({
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`,
});

interface RestOutcome {
  ok: boolean;
  status?: number;
  rows?: { data?: Record<string, string> }[];
  message: string;
}

async function restCall(
  url: string,
  anonKey: string,
  init: RequestInit,
): Promise<RestOutcome> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { ...authHeaders(anonKey), ...init.headers },
    });
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      const detail =
        body && typeof body === 'object' && 'message' in body
          ? String((body as { message: unknown }).message)
          : `${res.status} ${res.statusText}`;
      const authHint =
        res.status === 401 || res.status === 403
          ? ' Check the Project URL and Anon key are correct.'
          : '';
      return { ok: false, status: res.status, message: `Supabase error: ${detail}.${authHint}` };
    }
    const rows: unknown = await res.json().catch(() => []);
    return { ok: true, rows: Array.isArray(rows) ? rows : [], message: 'ok' };
  } catch (err) {
    return {
      ok: false,
      message: `Could not reach Supabase: ${
        err instanceof Error ? err.message : String(err)
      }. Check the Project URL and your internet connection.`,
    };
  }
}

const guardConfig = (settings: AppSettings): SyncResult | null => {
  if (!settings.supabaseUrl.trim() || !settings.supabaseAnonKey.trim())
    return { ok: false, message: 'Set the Supabase Project URL and Anon key first.' };
  return null;
};

const NOT_SEEDED_HINT =
  ' Has the one-time setup SQL (supabase/schema.sql) been run in your Supabase project yet?';

/** Connectivity check, without saving or loading anything. */
export async function testSupabaseConnection(
  settings: AppSettings,
): Promise<SyncResult> {
  const blocked = guardConfig(settings);
  if (blocked) return blocked;

  const result = await restCall(
    tableUrl(settings.supabaseUrl, 'id=eq.1&select=id'),
    settings.supabaseAnonKey,
    { method: 'GET' },
  );
  if (!result.ok) return { ok: false, message: result.message };
  if (!result.rows || result.rows.length === 0)
    return { ok: false, message: `Connected, but no saved row was found.${NOT_SEEDED_HINT}` };
  return { ok: true, message: 'Connected to Supabase.' };
}

/** Push this browser's entire app state up to Supabase (full replace). */
export async function saveToSupabase(settings: AppSettings): Promise<SyncResult> {
  const blocked = guardConfig(settings);
  if (blocked) return blocked;

  const snapshot = snapshotLocalStorage();
  const result = await restCall(
    tableUrl(settings.supabaseUrl, 'id=eq.1'),
    settings.supabaseAnonKey,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify({ data: snapshot }),
    },
  );
  if (!result.ok) return { ok: false, message: result.message };
  if (!result.rows || result.rows.length === 0)
    return { ok: false, message: `Nothing was saved — no row was updated.${NOT_SEEDED_HINT}` };
  return { ok: true, message: 'Saved to Supabase.' };
}

/**
 * Pull the saved snapshot down from Supabase and apply it to this browser's
 * localStorage. Caller is responsible for reloading the page afterward so
 * every part of the app re-reads its now-updated storage.
 */
export async function loadFromSupabase(settings: AppSettings): Promise<SyncResult> {
  const blocked = guardConfig(settings);
  if (blocked) return blocked;

  const result = await restCall(
    tableUrl(settings.supabaseUrl, 'id=eq.1&select=data'),
    settings.supabaseAnonKey,
    { method: 'GET' },
  );
  if (!result.ok) return { ok: false, message: result.message };
  if (!result.rows || result.rows.length === 0)
    return { ok: false, message: `Nothing was found to load.${NOT_SEEDED_HINT}` };

  const data = result.rows[0].data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, message: 'Supabase returned an unexpected reply — nothing was loaded.' };
  }
  if (Object.keys(data).length === 0) {
    return {
      ok: false,
      message:
        'Nothing has been saved to Supabase yet — use "Save & reload" from a browser that already has your data first.',
    };
  }
  applySnapshot(data);
  return { ok: true, message: 'Loaded from Supabase.' };
}
