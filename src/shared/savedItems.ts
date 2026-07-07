import type { AppSettings } from './settings';

// ---------------------------------------------------------------------------
// Saved Items service — the shared "file manager" backend for every tool.
// ---------------------------------------------------------------------------
// Folders (nestable) and saved items live in two Supabase tables (see
// supabase/schema.sql). Supabase's PostgREST auto-exposes them at
// /rest/v1/ucc_folders and /rest/v1/ucc_saved_items, so there is no separate
// server to run — this module IS the "backend endpoints" the spec describes,
// calling those REST resources directly (same pattern as supabaseSync.ts).
//
// Every tool uses this one service; there is no per-tool save/load code. An
// item carries a toolId (matches the tool registry) and a JSON payload with
// everything needed to restore that tool's state.
// ---------------------------------------------------------------------------

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

/** A saved item WITHOUT its (potentially large) payload — for list views. */
export interface SavedItemSummary {
  id: string;
  name: string;
  toolId: string;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A saved item WITH its payload — fetched only when loading into a tool. */
export interface SavedItem extends SavedItemSummary {
  payload: unknown;
}

export interface Result<T> {
  ok: boolean;
  message: string;
  data?: T;
}

// --- snake_case (Postgres) <-> camelCase (frontend) mapping -----------------

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}
interface ItemRow extends FolderRow {
  tool_id: string;
  folder_id: string | null;
  payload?: unknown;
}

const toFolder = (r: FolderRow): Folder => ({
  id: r.id,
  name: r.name,
  parentId: r.parent_id,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const toItem = (r: ItemRow): SavedItem => ({
  id: r.id,
  name: r.name,
  toolId: r.tool_id,
  folderId: r.folder_id,
  payload: r.payload,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

// --- REST plumbing ----------------------------------------------------------

const restBase = (settings: AppSettings): string =>
  `${settings.supabaseUrl.replace(/\/+$/, '')}/rest/v1`;

const authHeaders = (settings: AppSettings): Record<string, string> => ({
  apikey: settings.supabaseAnonKey,
  Authorization: `Bearer ${settings.supabaseAnonKey}`,
});

interface RestOutcome {
  ok: boolean;
  status?: number;
  rows: unknown[];
  message: string;
}

async function rest(
  settings: AppSettings,
  path: string,
  init: RequestInit = {},
): Promise<RestOutcome> {
  try {
    const res = await fetch(`${restBase(settings)}${path}`, {
      ...init,
      headers: { ...authHeaders(settings), ...init.headers },
    });
    if (!res.ok) {
      const body: unknown = await res.json().catch(() => null);
      const detail =
        body && typeof body === 'object' && 'message' in body
          ? String((body as { message: unknown }).message)
          : `${res.status} ${res.statusText}`;
      const hint =
        res.status === 401 || res.status === 403
          ? ' Check the Supabase Project URL and Anon key in Settings.'
          : res.status === 404
            ? ' Has the setup SQL (supabase/schema.sql) been run in your Supabase project?'
            : '';
      return { ok: false, status: res.status, rows: [], message: `Supabase error: ${detail}.${hint}` };
    }
    const text = await res.text();
    const rows = text ? (JSON.parse(text) as unknown) : [];
    return { ok: true, status: res.status, rows: Array.isArray(rows) ? rows : [rows], message: 'ok' };
  } catch (err) {
    return {
      ok: false,
      rows: [],
      message: `Could not reach Supabase: ${
        err instanceof Error ? err.message : String(err)
      }. Check the Project URL and your internet connection.`,
    };
  }
}

const jsonWrite = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify(body),
});

const guard = (settings: AppSettings): Result<never> | null =>
  settings.supabaseUrl.trim() && settings.supabaseAnonKey.trim()
    ? null
    : {
        ok: false,
        message:
          'Cloud storage is not set up. Add your Supabase Project URL and Anon key in Settings first.',
      };

/** Encode a value for a PostgREST filter (leaves plain ids/tool names intact). */
const enc = (v: string): string => encodeURIComponent(v);

// --- Folders ----------------------------------------------------------------

export async function listFolders(settings: AppSettings): Promise<Result<Folder[]>> {
  const blocked = guard(settings);
  if (blocked) return blocked;
  const out = await rest(settings, `/ucc_folders?select=*&order=name.asc`);
  if (!out.ok) return { ok: false, message: out.message };
  return { ok: true, message: 'ok', data: (out.rows as FolderRow[]).map(toFolder) };
}

export async function createFolder(
  settings: AppSettings,
  name: string,
  parentId: string | null = null,
): Promise<Result<Folder>> {
  const blocked = guard(settings);
  if (blocked) return blocked;
  if (!name.trim()) return { ok: false, message: 'Enter a folder name.' };
  const out = await rest(
    settings,
    `/ucc_folders`,
    jsonWrite('POST', { name: name.trim(), parent_id: parentId }),
  );
  if (!out.ok) return { ok: false, message: out.message };
  return { ok: true, message: 'Folder created.', data: toFolder(out.rows[0] as FolderRow) };
}

export async function renameFolder(
  settings: AppSettings,
  id: string,
  name: string,
): Promise<Result<Folder>> {
  const blocked = guard(settings);
  if (blocked) return blocked;
  if (!name.trim()) return { ok: false, message: 'Enter a folder name.' };
  const out = await rest(
    settings,
    `/ucc_folders?id=eq.${enc(id)}`,
    jsonWrite('PATCH', { name: name.trim() }),
  );
  if (!out.ok) return { ok: false, message: out.message };
  return { ok: true, message: 'Folder renamed.', data: toFolder(out.rows[0] as FolderRow) };
}

export async function moveFolder(
  settings: AppSettings,
  id: string,
  parentId: string | null,
): Promise<Result<Folder>> {
  const blocked = guard(settings);
  if (blocked) return blocked;
  if (parentId === id) return { ok: false, message: 'A folder cannot be moved into itself.' };
  const out = await rest(
    settings,
    `/ucc_folders?id=eq.${enc(id)}`,
    jsonWrite('PATCH', { parent_id: parentId }),
  );
  if (!out.ok) return { ok: false, message: out.message };
  return { ok: true, message: 'Folder moved.', data: toFolder(out.rows[0] as FolderRow) };
}

/** Delete a folder. Its items and subfolders move to root (FK ON DELETE SET NULL). */
export async function deleteFolder(settings: AppSettings, id: string): Promise<Result<void>> {
  const blocked = guard(settings);
  if (blocked) return blocked;
  const out = await rest(settings, `/ucc_folders?id=eq.${enc(id)}`, { method: 'DELETE' });
  if (!out.ok) return { ok: false, message: out.message };
  return { ok: true, message: 'Folder deleted; its contents moved to root.' };
}

// --- Items ------------------------------------------------------------------

const ITEM_SUMMARY_COLS = 'id,name,tool_id,folder_id,created_at,updated_at';

export async function listItems(
  settings: AppSettings,
  toolId?: string,
  folderId?: string | null,
): Promise<Result<SavedItemSummary[]>> {
  const blocked = guard(settings);
  if (blocked) return blocked;
  let path = `/ucc_saved_items?select=${ITEM_SUMMARY_COLS}&order=updated_at.desc`;
  if (toolId) path += `&tool_id=eq.${enc(toolId)}`;
  if (folderId !== undefined) {
    path += folderId === null ? `&folder_id=is.null` : `&folder_id=eq.${enc(folderId)}`;
  }
  const out = await rest(settings, path);
  if (!out.ok) return { ok: false, message: out.message };
  return { ok: true, message: 'ok', data: (out.rows as ItemRow[]).map(toItem) };
}

/** Fetch one item WITH its payload — for loading back into a tool. */
export async function loadItem(settings: AppSettings, id: string): Promise<Result<SavedItem>> {
  const blocked = guard(settings);
  if (blocked) return blocked;
  const out = await rest(settings, `/ucc_saved_items?id=eq.${enc(id)}&select=*`);
  if (!out.ok) return { ok: false, message: out.message };
  if (out.rows.length === 0) return { ok: false, message: 'That saved item no longer exists.' };
  return { ok: true, message: 'ok', data: toItem(out.rows[0] as ItemRow) };
}

export async function createItem(
  settings: AppSettings,
  input: { name: string; toolId: string; folderId?: string | null; payload: unknown },
): Promise<Result<SavedItem>> {
  const blocked = guard(settings);
  if (blocked) return blocked;
  if (!input.name.trim()) return { ok: false, message: 'Enter a name for this item.' };
  const out = await rest(
    settings,
    `/ucc_saved_items`,
    jsonWrite('POST', {
      name: input.name.trim(),
      tool_id: input.toolId,
      folder_id: input.folderId ?? null,
      payload: input.payload,
    }),
  );
  if (!out.ok) return { ok: false, message: out.message };
  return { ok: true, message: 'Saved.', data: toItem(out.rows[0] as ItemRow) };
}

async function patchItem(
  settings: AppSettings,
  id: string,
  patch: Record<string, unknown>,
  successMsg: string,
): Promise<Result<SavedItem>> {
  const blocked = guard(settings);
  if (blocked) return blocked;
  const out = await rest(settings, `/ucc_saved_items?id=eq.${enc(id)}`, jsonWrite('PATCH', patch));
  if (!out.ok) return { ok: false, message: out.message };
  if (out.rows.length === 0) return { ok: false, message: 'That saved item no longer exists.' };
  return { ok: true, message: successMsg, data: toItem(out.rows[0] as ItemRow) };
}

export const renameItem = (settings: AppSettings, id: string, name: string) =>
  name.trim()
    ? patchItem(settings, id, { name: name.trim() }, 'Renamed.')
    : Promise.resolve<Result<SavedItem>>({ ok: false, message: 'Enter a name.' });

export const moveItem = (settings: AppSettings, id: string, folderId: string | null) =>
  patchItem(settings, id, { folder_id: folderId }, 'Moved.');

export const overwriteItem = (settings: AppSettings, id: string, payload: unknown) =>
  patchItem(settings, id, { payload }, 'Saved over the existing item.');

export async function deleteItem(settings: AppSettings, id: string): Promise<Result<void>> {
  const blocked = guard(settings);
  if (blocked) return blocked;
  const out = await rest(settings, `/ucc_saved_items?id=eq.${enc(id)}`, { method: 'DELETE' });
  if (!out.ok) return { ok: false, message: out.message };
  return { ok: true, message: 'Deleted.' };
}
