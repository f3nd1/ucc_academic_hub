import { useCallback, useEffect, useState } from 'react';

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

const STORAGE_KEY = 'ucc-timetable-settings';

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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/**
 * React hook exposing the current settings and a setter that persists to
 * localStorage. Cross-tab updates are picked up via the storage event so the
 * Timetable and Settings pages stay in sync.
 */
export function useSettings(): [
  AppSettings,
  (patch: Partial<AppSettings>) => void,
] {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSettings(loadSettings());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  return [settings, update];
}
