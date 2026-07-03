import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import type { ScheduledLesson, Course, HolidaySet } from './types';
import type { WizardState } from './wizard/wizardModel';

export type ViewMode = 'list' | 'calendar' | 'hybrid';
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
  lessons: ScheduledLesson[] | null;
  setLessons: Dispatch<SetStateAction<ScheduledLesson[] | null>>;
  course: Course | null;
  setCourse: Dispatch<SetStateAction<Course | null>>;
  holidays: HolidaySet | null;
  setHolidays: Dispatch<SetStateAction<HolidaySet | null>>;
  view: ViewMode;
  setView: Dispatch<SetStateAction<ViewMode>>;
  messages: string[];
  setMessages: Dispatch<SetStateAction<string[]>>;
  banner: Banner;
  setBanner: Dispatch<SetStateAction<Banner>>;
}

export const TimetableCtx = createContext<TimetableStore | null>(null);

export function useTimetableStore(): TimetableStore {
  const ctx = useContext(TimetableCtx);
  if (!ctx)
    throw new Error('useTimetableStore must be used within TimetableProvider');
  return ctx;
}
