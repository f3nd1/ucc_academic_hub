import type { AppSettings } from './settings';
import { SETTINGS_STORAGE_KEY } from './settings';

// ---------------------------------------------------------------------------
// Cloud sync (Supabase) — save/load the whole workspace's localStorage as one
// JSON snapshot, gated by a shared passcode checked SERVER-SIDE in Postgres.
// ---------------------------------------------------------------------------
// The Anon/publishable key is not a secret — it ends up in the app's public
// JS bundle, readable by anyone. It is NOT what protects this data. The real
// gate is two Postgres RPC functions (workspace_sync_load/save, see
// supabase/schema.sql) that check a passcode hash server-side before touching
// the table; Row Level Security denies the anon role ANY direct access to the
// table itself, so the only door in is through those two passcode-checked
// functions. This is a simple shared-team barrier, not full per-user auth —
// appropriate for a small internal tool, not a substitute for real auth.
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
const LOCAL_ONLY_SETTINGS_KEYS = [
  'supabaseUrl',
  'supabaseAnonKey',
  'supabasePasscode',
] as const;

const sanitizeSettingsJson = (raw: string): string => {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    for (const k of LOCAL_ONLY_SETTINGS_KEYS) delete obj[k];
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

const rpcUrl = (baseUrl: string, fn: string): string =>
  `${baseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${fn}`;

interface RpcOutcome {
  ok: boolean;
  data?: unknown;
  message: string;
  /** True when the RPC itself reported a wrong passcode (not a network/config problem). */
  wrongPasscode?: boolean;
}

async function callRpc(
  baseUrl: string,
  anonKey: string,
  fn: string,
  args: Record<string, unknown>,
): Promise<RpcOutcome> {
  try {
    const res = await fetch(rpcUrl(baseUrl, fn), {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(args),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const message =
        body && typeof body === 'object' && 'message' in body
          ? String((body as { message: unknown }).message)
          : `Supabase responded ${res.status} ${res.statusText}`;
      return { ok: false, message, wrongPasscode: message.includes('invalid passcode') };
    }
    return { ok: true, data: body, message: 'ok' };
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
  if (!settings.supabasePasscode.trim())
    return { ok: false, message: 'Enter the shared passcode first.' };
  return null;
};

/** Connectivity + passcode check, without saving or loading anything. */
export async function testSupabaseConnection(
  settings: AppSettings,
): Promise<SyncResult> {
  const blocked = guardConfig(settings);
  if (blocked) return blocked;

  const result = await callRpc(
    settings.supabaseUrl,
    settings.supabaseAnonKey,
    'workspace_sync_load',
    { p_passcode: settings.supabasePasscode },
  );
  if (result.ok) return { ok: true, message: 'Connected to Supabase — passcode accepted.' };
  if (result.wrongPasscode)
    return {
      ok: false,
      message: 'Reached Supabase, but the passcode is wrong — check it and try again.',
    };
  return { ok: false, message: result.message };
}

/** Push this browser's entire app state up to Supabase (full replace). */
export async function saveToSupabase(settings: AppSettings): Promise<SyncResult> {
  const blocked = guardConfig(settings);
  if (blocked) return blocked;

  const snapshot = snapshotLocalStorage();
  const result = await callRpc(
    settings.supabaseUrl,
    settings.supabaseAnonKey,
    'workspace_sync_save',
    { p_passcode: settings.supabasePasscode, p_data: snapshot },
  );
  if (!result.ok) {
    return {
      ok: false,
      message: result.wrongPasscode ? 'Wrong passcode — nothing was saved.' : result.message,
    };
  }
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

  const result = await callRpc(
    settings.supabaseUrl,
    settings.supabaseAnonKey,
    'workspace_sync_load',
    { p_passcode: settings.supabasePasscode },
  );
  if (!result.ok) {
    return {
      ok: false,
      message: result.wrongPasscode ? 'Wrong passcode — nothing was loaded.' : result.message,
    };
  }
  const data = result.data;
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
  applySnapshot(data as Record<string, string>);
  return { ok: true, message: 'Loaded from Supabase.' };
}
