import { useState, type ReactNode } from 'react';
import type { ScheduledLesson, ClassGroupConfig, HolidaySet } from './types';
import { loadWizard, type WizardState } from './wizard/wizardModel';
import { useSettings } from './settingsStore';
import {
  TimetableCtx,
  type ViewMode,
  type Banner,
  type FormLayout,
} from './timetableStore';

/** Route-persistent home for the wizard, results, and view state. */
export function TimetableProvider({ children }: { children: ReactNode }) {
  const [settings] = useSettings();
  const [wizard, setWizard] = useState<WizardState>(() =>
    loadWizard(settings.firstDayOfWeek),
  );
  const [wizardStep, setWizardStep] = useState(0);
  const [layout, setLayout] = useState<FormLayout>('wizard');
  const [lessons, setLessons] = useState<ScheduledLesson[] | null>(null);
  const [config, setConfig] = useState<ClassGroupConfig | null>(null);
  const [holidays, setHolidays] = useState<HolidaySet | null>(null);
  const [view, setView] = useState<ViewMode>('list');
  const [messages, setMessages] = useState<string[]>([]);
  const [banner, setBanner] = useState<Banner>(null);

  return (
    <TimetableCtx.Provider
      value={{
        wizard,
        setWizard,
        wizardStep,
        setWizardStep,
        layout,
        setLayout,
        lessons,
        setLessons,
        config,
        setConfig,
        holidays,
        setHolidays,
        view,
        setView,
        messages,
        setMessages,
        banner,
        setBanner,
      }}
    >
      {children}
    </TimetableCtx.Provider>
  );
}
