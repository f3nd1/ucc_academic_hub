import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  loadSettings,
  saveSettings,
  SETTINGS_STORAGE_KEY,
  type AppSettings,
} from './settings';
import { SettingsCtx } from './settingsStore';

/** Single source of truth for app settings, persisted to localStorage. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(loadSettings);

  // Cross-tab sync; same-tab consumers already share this one state instance.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === SETTINGS_STORAGE_KEY) setSettings(loadSettings());
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

  return (
    <SettingsCtx.Provider value={[settings, update]}>
      {children}
    </SettingsCtx.Provider>
  );
}
