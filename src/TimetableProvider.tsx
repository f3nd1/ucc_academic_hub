import { useCallback, useState, type ReactNode } from 'react';
import type { ScheduledLesson, Course, Conflict, HolidaySet } from './types';
import type { LoadedItem } from './shared/savedItems';
import { loadWizard, type WizardState } from './wizard/wizardModel';
import { useSettings } from './shared/settingsStore';
import { loadNamespaced, saveNamespaced } from './shared/persistence';
import type { PlannerColumnMode } from './planner';
import {
  TimetableCtx,
  type ViewMode,
  type Banner,
  type FormLayout,
} from './timetableStore';

// Persisted under "ucc:timetable:*", same pattern as the skin and
// sidebar-collapsed toggles.
const TOOL_ID = 'timetable';
const SETUP_COLLAPSED_KEY = 'setupCollapsed';
const PLANNER_COLUMN_MODE_KEY = 'plannerColumnMode';

const isPlannerColumnMode = (v: unknown): v is PlannerColumnMode =>
  v === 'activity' || v === 'module';

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
  const [plannerColumnMode, setPlannerColumnModeState] =
    useState<PlannerColumnMode>(() => {
      const stored = loadNamespaced<unknown>(TOOL_ID, PLANNER_COLUMN_MODE_KEY, 'module');
      return isPlannerColumnMode(stored) ? stored : 'module';
    });
  const setPlannerColumnMode = useCallback((mode: PlannerColumnMode) => {
    setPlannerColumnModeState(mode);
    saveNamespaced(TOOL_ID, PLANNER_COLUMN_MODE_KEY, mode);
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
        plannerColumnMode,
        setPlannerColumnMode,
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
