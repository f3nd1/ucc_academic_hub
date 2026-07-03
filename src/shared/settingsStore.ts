import { createContext, useContext } from 'react';
import type { AppSettings } from './settings';

export type SettingsContextValue = [
  AppSettings,
  (patch: Partial<AppSettings>) => void,
];

export const SettingsCtx = createContext<SettingsContextValue | null>(null);

/**
 * Shared settings: one state instance for the whole app, provided by
 * SettingsProvider. Same-tab updates propagate immediately (the Settings page
 * and the Timetable page see each other's changes live); cross-tab updates
 * arrive via the storage event in the provider.
 */
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsCtx);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
}
