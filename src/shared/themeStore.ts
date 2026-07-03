import { createContext, useContext } from 'react';
import type { Skin } from './theme';

export type ThemeContextValue = [Skin, (skin: Skin) => void];

export const ThemeCtx = createContext<ThemeContextValue | null>(null);

/** Current workspace skin + setter. Shared by the whole app via ThemeProvider. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
