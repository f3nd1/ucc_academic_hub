export type FirstDayOfWeek = 'sunday' | 'monday';

/** UI theme: follow the OS, or force light / dark. */
export type ThemeMode = 'system' | 'light' | 'dark';

/** App settings persisted to localStorage. */
export interface AppSettings {
  erpBaseUrl: string;
  erpApiKey: string;
  erpApiSecret: string;
  erpDocType: string;
  googleClientId: string;
  /** Base GitHub repo URL (e.g. https://github.com/owner/repo) — links Changelog commits. */
  repoUrl: string;
  firstDayOfWeek: FirstDayOfWeek;
  theme: ThemeMode;
  /**
   * Cloud sync (Supabase), both optional. These two fields are LOCAL to this
   * browser only — they describe how to reach your shared cloud store, so they
   * are deliberately excluded from what gets synced (see supabaseSync.ts);
   * syncing them would be circular and would overwrite one browser's
   * connection details with another's on every reload.
   */
  supabaseUrl: string;
  supabaseAnonKey: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  erpBaseUrl: '',
  erpApiKey: '',
  erpApiSecret: '',
  erpDocType: '',
  googleClientId: '',
  repoUrl: '',
  firstDayOfWeek: 'monday',
  theme: 'system',
  supabaseUrl: '',
  supabaseAnonKey: '',
};

export const SETTINGS_STORAGE_KEY = 'ucc-timetable-settings';
const STORAGE_KEY = SETTINGS_STORAGE_KEY;

// --- Server-provided settings via VITE_* env vars ---------------------------
//
// A `.env` file at the project root (see .env.example) can supply credentials
// once on the server instead of typing them per-browser. Each VITE_* var maps
// to one AppSettings field; when set it OVERRIDES any stored/typed value and
// the field is shown read-only in Settings. Values are read fresh each call so
// tests can stub them. (Reminder: VITE_* values are baked into the public
// bundle at build — fine for the non-secret ones, not a true hiding place for
// the ERPNext secret.)

/** The string-valued settings fields that a VITE_* env var can supply. */
type EnvBackedKey =
  | 'erpBaseUrl'
  | 'erpApiKey'
  | 'erpApiSecret'
  | 'erpDocType'
  | 'googleClientId'
  | 'supabaseUrl'
  | 'supabaseAnonKey';

const ENV_FIELD_MAP: Record<EnvBackedKey, keyof ImportMetaEnv> = {
  erpBaseUrl: 'VITE_ERP_BASE_URL',
  erpApiKey: 'VITE_ERP_API_KEY',
  erpApiSecret: 'VITE_ERP_API_SECRET',
  erpDocType: 'VITE_ERP_DOCTYPE',
  googleClientId: 'VITE_GOOGLE_CLIENT_ID',
  supabaseUrl: 'VITE_SUPABASE_URL',
  supabaseAnonKey: 'VITE_SUPABASE_ANON_KEY',
};

/** The subset of settings fixed by env vars (only non-empty ones), trimmed. */
export function envSettings(): Partial<AppSettings> {
  const out: Partial<AppSettings> = {};
  for (const [field, envKey] of Object.entries(ENV_FIELD_MAP) as [
    EnvBackedKey,
    keyof ImportMetaEnv,
  ][]) {
    const value = import.meta.env[envKey];
    if (typeof value === 'string' && value.trim() !== '') {
      out[field] = value.trim();
    }
  }
  return out;
}

/** Field keys currently fixed by env vars — shown read-only, never persisted. */
export function envLockedKeys(): Set<keyof AppSettings> {
  return new Set(Object.keys(envSettings()) as (keyof AppSettings)[]);
}

/**
 * Read settings from localStorage, falling back to defaults for any gap, then
 * layering env-provided values on top so they always win over stored ones.
 */
export function loadSettings(): AppSettings {
  const env = envSettings();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<AppSettings>) : {};
    return { ...DEFAULT_SETTINGS, ...parsed, ...env };
  } catch {
    return { ...DEFAULT_SETTINGS, ...env };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    // Never persist env-provided fields: they live in the server's .env and are
    // re-applied on every load, so writing them to localStorage would just
    // leave a stale copy behind if the .env later changes.
    const locked = envLockedKeys();
    const toStore: Record<string, unknown> = { ...settings };
    for (const key of locked) delete toStore[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  } catch {
    // Private mode / quota exceeded: settings stay in memory for the session.
  }
}

// The useSettings hook lives in settingsStore.ts (context-based) so every
// consumer shares ONE state instance. The old per-caller hook here meant
// same-tab writes never propagated between pages — the storage event does not
// fire in the document that wrote it; it only worked by remount coincidence.
