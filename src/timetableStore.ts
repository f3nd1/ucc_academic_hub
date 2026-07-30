import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import type { ScheduledLesson, Course, Conflict, HolidaySet } from './types';
import type { WizardState } from './wizard/wizardModel';
import type { LoadedItem } from './shared/savedItems';
import type { PlannerColumnMode } from './planner';

export type ViewMode = 'list' | 'calendar' | 'hybrid' | 'amend';
export type Banner = { ok: boolean; message: string } | null;
export type FormLayout = 'wizard' | 'full';

/**
 * All timetable state that must survive route changes. React Router unmounts
 * the Timetable page when the user visits /settings; holding this in the page
 * used to throw away the generated timetable and the wizard progress on every
 * round trip. The provider lives above the routes, so nothing is lost.
 */
export interface TimetableStore {
  wizard: WizardState;
  setWizard: Dispatch<SetStateAction<WizardState>>;
  wizardStep: number;
  setWizardStep: Dispatch<SetStateAction<number>>;
  layout: FormLayout;
  setLayout: Dispatch<SetStateAction<FormLayout>>;
  /** Collapses the setup/config panel so List/Calendar/Hybrid/Amend can use
   *  the full width; persisted under "ucc:timetable:setupCollapsed". */
  setupCollapsed: boolean;
  setSetupCollapsed: (collapsed: boolean) => void;
  /** Hybrid planner's second sub-column: Activity or Module name. Applies to
   *  the on-screen view and every planner export (PDF/CSV/Sheets); persisted
   *  under "ucc:timetable:plannerColumnMode". */
  plannerColumnMode: PlannerColumnMode;
  setPlannerColumnMode: (mode: PlannerColumnMode) => void;
  lessons: ScheduledLesson[] | null;
  setLessons: Dispatch<SetStateAction<ScheduledLesson[] | null>>;
  course: Course | null;
  setCourse: Dispatch<SetStateAction<Course | null>>;
  holidays: HolidaySet | null;
  setHolidays: Dispatch<SetStateAction<HolidaySet | null>>;
  conflicts: Conflict[];
  setConflicts: Dispatch<SetStateAction<Conflict[]>>;
  view: ViewMode;
  setView: Dispatch<SetStateAction<ViewMode>>;
  messages: string[];
  setMessages: Dispatch<SetStateAction<string[]>>;
  banner: Banner;
  setBanner: Dispatch<SetStateAction<Banner>>;
  /** The Saved Item currently open (enables "Save over this one"); persists
   *  across navigation like the rest of the timetable state. */
  savedItem: LoadedItem | null;
  setSavedItem: Dispatch<SetStateAction<LoadedItem | null>>;
}

export const TimetableCtx = createContext<TimetableStore | null>(null);

export function useTimetableStore(): TimetableStore {
  const ctx = useContext(TimetableCtx);
  if (!ctx)
    throw new Error('useTimetableStore must be used within TimetableProvider');
  return ctx;
}
