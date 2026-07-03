import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { loadSkin, saveSkin, type Skin } from './theme';
import { ThemeCtx } from './themeStore';

/**
 * Single source of truth for the workspace skin. Stamps data-theme on <html>
 * (the inline script in index.html stamps it first to avoid a flash) and
 * persists the choice under "ucc:workspace:theme". Composes with data-mode
 * (light/dark), which SettingsProvider owns.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [skin, setSkinState] = useState<Skin>(loadSkin);

  useEffect(() => {
    document.documentElement.dataset.theme = skin;
  }, [skin]);

  const setSkin = useCallback((next: Skin) => {
    setSkinState(next);
    saveSkin(next);
  }, []);

  return (
    <ThemeCtx.Provider value={[skin, setSkin]}>{children}</ThemeCtx.Provider>
  );
}
