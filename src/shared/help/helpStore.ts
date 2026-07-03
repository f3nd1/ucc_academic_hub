import { createContext, useContext } from 'react';

export interface HelpContextValue {
  /** Master toggle: when false, all tooltips and inline hints are suppressed. */
  helpEnabled: boolean;
  setHelpEnabled: (v: boolean) => void;
  /** True once the tour is finished or dismissed with "Don't show again". */
  tourDone: boolean;
  /** Whether the tour overlay is currently visible. */
  tourOpen: boolean;
  startTour: () => void;
  /** Close the tour; pass true to never auto-show it again. */
  closeTour: (dontShowAgain: boolean) => void;
}

export const HelpCtx = createContext<HelpContextValue | null>(null);

export function useHelp(): HelpContextValue {
  const ctx = useContext(HelpCtx);
  if (!ctx) throw new Error('useHelp must be used within a HelpProvider');
  return ctx;
}
