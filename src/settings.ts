export type FirstDayOfWeek = 'sunday' | 'monday';

/** App settings persisted to localStorage. */
export interface AppSettings {
  erpBaseUrl: string;
  erpApiKey: string;
  erpApiSecret: string;
  erpDocType: string;
  googleClientId: string;
  firstDayOfWeek: FirstDayOfWeek;
}

export const DEFAULT_SETTINGS: AppSettings = {
  erpBaseUrl: '',
  erpApiKey: '',
  erpApiSecret: '',
  erpDocType: '',
  googleClientId: '',
  firstDayOfWeek: 'monday',
};

export const SETTINGS_STORAGE_KEY = 'ucc-timetable-settings';
const STORAGE_KEY = SETTINGS_STORAGE_KEY;

/** Read settings from localStorage, falling back to defaults for any gap. */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private mode / quota exceeded: settings stay in memory for the session.
  }
}

// The useSettings hook lives in settingsStore.ts (context-based) so every
// consumer shares ONE state instance. The old per-caller hook here meant
// same-tab writes never propagated between pages — the storage event does not
// fire in the document that wrote it; it only worked by remount coincidence.
