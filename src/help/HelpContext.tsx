import { useEffect, useState, type ReactNode } from 'react';
import { HelpCtx } from './helpStore';

const HELP_KEY = 'ucc-help-enabled';
const TOUR_KEY = 'ucc-tour-done';

const readBool = (key: string, fallback: boolean): boolean => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : raw === 'true';
  } catch {
    return fallback;
  }
};

export function HelpProvider({ children }: { children: ReactNode }) {
  const [helpEnabled, setHelpEnabledState] = useState(() =>
    readBool(HELP_KEY, true),
  );
  const [tourDone, setTourDone] = useState(() => readBool(TOUR_KEY, false));
  // Auto-open the tour on first ever load (help on, tour not yet completed).
  const [tourOpen, setTourOpen] = useState(
    () => readBool(HELP_KEY, true) && !readBool(TOUR_KEY, false),
  );

  const setHelpEnabled = (v: boolean) => {
    setHelpEnabledState(v);
    try {
      localStorage.setItem(HELP_KEY, String(v));
    } catch {
      /* ignore */
    }
  };

  const startTour = () => setTourOpen(true);

  const closeTour = (dontShowAgain: boolean) => {
    setTourOpen(false);
    if (dontShowAgain) {
      setTourDone(true);
      try {
        localStorage.setItem(TOUR_KEY, 'true');
      } catch {
        /* ignore */
      }
    }
  };

  // If help is switched off, also drop any open tour prompt.
  useEffect(() => {
    if (!helpEnabled) setTourOpen(false);
  }, [helpEnabled]);

  return (
    <HelpCtx.Provider
      value={{
        helpEnabled,
        setHelpEnabled,
        tourDone,
        tourOpen,
        startTour,
        closeTour,
      }}
    >
      {children}
    </HelpCtx.Provider>
  );
}
