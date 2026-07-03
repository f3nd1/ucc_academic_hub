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

  // Apply the colour scheme by stamping data-MODE on <html>. "system" resolves
  // via the OS preference and tracks live changes; the CSS keys the dark
  // palette off :root[data-mode='dark']. (data-THEME carries the skin instead,
  // set by ThemeProvider.) An inline script in index.html stamps the same
  // attribute before first paint so there is no flash of the wrong scheme.
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved =
        settings.theme === 'system'
          ? mql.matches
            ? 'dark'
            : 'light'
          : settings.theme;
      document.documentElement.dataset.mode = resolved;
    };
    apply();
    if (settings.theme === 'system') {
      mql.addEventListener('change', apply);
      return () => mql.removeEventListener('change', apply);
    }
  }, [settings.theme]);

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
