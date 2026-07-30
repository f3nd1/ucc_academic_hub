import { useCallback, useState, type ReactNode } from 'react';
import type { ScheduledLesson, Course, Conflict, HolidaySet } from './types';
import type { LoadedItem } from './shared/savedItems';
import { loadWizard, type WizardState } from './wizard/wizardModel';
import { useSettings } from './shared/settingsStore';
import { loadNamespaced, saveNamespaced } from './shared/persistence';
import {
  TimetableCtx,
  type ViewMode,
  type Banner,
  type FormLayout,
} from './timetableStore';

// Persisted under "ucc:timetable:setupCollapsed", same pattern as the skin
// and sidebar-collapsed toggles.
const TOOL_ID = 'timetable';
const SETUP_COLLAPSED_KEY = 'setupCollapsed';

/** Route-persistent home for the wizard, results, and view state. */
export function TimetableProvider({ children }: { children: ReactNode }) {
  const [settings] = useSettings();
  const [wizard, setWizard] = useState<WizardState>(() =>
    loadWizard(settings.firstDayOfWeek),
  );
  const [wizardStep, setWizardStep] = useState(0);
  const [layout, setLayout] = useState<FormLayout>('wizard');
  const [setupCollapsed, setSetupCollapsedState] = useState<boolean>(() =>
    loadNamespaced<boolean>(TOOL_ID, SETUP_COLLAPSED_KEY, false),
  );
  const setSetupCollapsed = useCallback((collapsed: boolean) => {
    setSetupCollapsedState(collapsed);
    saveNamespaced(TOOL_ID, SETUP_COLLAPSED_KEY, collapsed);
  }, []);
  const [lessons, setLessons] = useState<ScheduledLesson[] | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [holidays, setHolidays] = useState<HolidaySet | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [view, setView] = useState<ViewMode>('list');
  const [messages, setMessages] = useState<string[]>([]);
  const [banner, setBanner] = useState<Banner>(null);
  const [savedItem, setSavedItem] = useState<LoadedItem | null>(null);

  return (
    <TimetableCtx.Provider
      value={{
        wizard,
        setWizard,
        wizardStep,
        setWizardStep,
        layout,
        setLayout,
        setupCollapsed,
        setSetupCollapsed,
        lessons,
        setLessons,
        course,
        setCourse,
        holidays,
        setHolidays,
        conflicts,
        setConflicts,
        view,
        setView,
        messages,
        setMessages,
        banner,
        setBanner,
        savedItem,
        setSavedItem,
      }}
    >
      {children}
    </TimetableCtx.Provider>
  );
}
