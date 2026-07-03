import {
  EMPTY_FORM,
  validateDetails,
  validateRules,
  type CourseForm,
} from '../formModel';
import type { FirstDayOfWeek } from '../settings';
import { SCOPE_LABELS } from '../help/helpText';

/** What the user primarily wants to produce (also the initial view). */
export type Intent = 'list' | 'calendar' | 'hybrid';

/** What the timetable represents — a labelling/grouping choice only. */
export type Scope = 'course' | 'module' | 'classGroup';

/** All wizard/form state in one object so nothing is lost between steps. */
export interface WizardState {
  intent: Intent;
  scope: Scope;
  form: CourseForm;
  firstDayOfWeek: FirstDayOfWeek;
}

export const primaryNameLabel = (scope: Scope): string =>
  SCOPE_LABELS[scope].name;

export const scopeTitleLabel = (scope: Scope): string =>
  SCOPE_LABELS[scope].title;

export const makeInitialWizard = (
  firstDayOfWeek: FirstDayOfWeek,
): WizardState => ({
  intent: 'list',
  scope: 'module',
  form: EMPTY_FORM,
  firstDayOfWeek,
});

// --- Persistence (prefill last-used values after first generation) ----------
// Key bumped for the v5 course-shaped form: merging an old flat RawForm into
// the new CourseForm shape would produce a broken hybrid, so stale state from
// the previous key is deliberately ignored.
const STATE_KEY = 'ucc-wizard-state-v6';

export function loadWizard(fallbackFdow: FirstDayOfWeek): WizardState {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return makeInitialWizard(fallbackFdow);
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    const base = makeInitialWizard(fallbackFdow);
    return {
      intent: parsed.intent ?? base.intent,
      scope: parsed.scope ?? base.scope,
      form: { ...base.form, ...parsed.form },
      firstDayOfWeek: parsed.firstDayOfWeek ?? base.firstDayOfWeek,
    };
  } catch {
    return makeInitialWizard(fallbackFdow);
  }
}

export function saveWizard(state: WizardState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

// --- Per-step validation ----------------------------------------------------
export const WIZARD_STEPS = [
  'Output',
  'Scope',
  'Details',
  'Rules',
  'Review',
] as const;
export type StepIndex = 0 | 1 | 2 | 3 | 4;

/** Validation messages for a given step (empty = the step may advance). */
export function validateStep(step: number, state: WizardState): string[] {
  switch (step) {
    case 0: // Output intent — always valid
    case 1: // Scope — always valid
      return [];
    case 2: // Details
      return validateDetails(state.form, primaryNameLabel(state.scope));
    case 3: // Calendar rules
      return validateRules(state.form);
    case 4: // Review — full check
      return [
        ...validateDetails(state.form, primaryNameLabel(state.scope)),
        ...validateRules(state.form),
      ];
    default:
      return [];
  }
}
