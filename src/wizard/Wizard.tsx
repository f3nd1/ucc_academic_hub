import { useState } from 'react';
import type { RawForm } from '../formModel';
import type { FirstDayOfWeek } from '../settings';
import { formatDisplayDate } from '../dateUtils';
import { Tooltip } from '../help/Tooltip';
import { TOOLTIPS } from '../help/helpText';
import { DetailsFields } from '../components/DetailsFields';
import { RulesFields } from '../components/RulesFields';
import { Stepper } from './Stepper';
import {
  WIZARD_STEPS,
  validateStep,
  primaryNameLabel,
  parseLinesCount,
  type WizardState,
  type Intent,
  type Scope,
} from './wizardModel';

interface Props {
  state: WizardState;
  setIntent: (i: Intent) => void;
  setScope: (s: Scope) => void;
  setFirstDayOfWeek: (d: FirstDayOfWeek) => void;
  updateForm: (patch: Partial<RawForm>) => void;
  onGenerate: () => void;
  onSwitchToFullForm: () => void;
  busy: boolean;
}

const INTENTS: {
  key: Intent;
  title: string;
  desc: string;
  thumb: React.ReactNode;
}[] = [
  {
    key: 'list',
    title: 'List',
    desc: 'A simple table of every lesson.',
    thumb: (
      <svg viewBox="0 0 40 28" className="intent__thumb" aria-hidden="true">
        {[4, 10, 16, 22].map((y) => (
          <rect key={y} x="4" y={y} width="32" height="4" rx="1" />
        ))}
      </svg>
    ),
  },
  {
    key: 'calendar',
    title: 'Calendar',
    desc: 'A month grid with lessons in each day.',
    thumb: (
      <svg viewBox="0 0 40 28" className="intent__thumb" aria-hidden="true">
        {[0, 1, 2, 3].map((r) =>
          [0, 1, 2, 3, 4].map((c) => (
            <rect
              key={`${r}-${c}`}
              x={4 + c * 6.5}
              y={4 + r * 5.5}
              width="5.5"
              height="4.5"
              rx="0.8"
            />
          )),
        )}
      </svg>
    ),
  },
  {
    key: 'hybrid',
    title: 'Hybrid planner',
    desc: 'The UCC course-planner matrix by month.',
    thumb: (
      <svg viewBox="0 0 40 28" className="intent__thumb" aria-hidden="true">
        <rect x="4" y="4" width="6" height="20" rx="1" />
        {[0, 1, 2, 3].map((c) => (
          <rect key={c} x={12 + c * 6.5} y="4" width="5.5" height="20" rx="0.8" />
        ))}
      </svg>
    ),
  },
];

const SCOPES: { key: Scope; title: string; desc: string }[] = [
  { key: 'course', title: 'Per course', desc: 'A whole programme.' },
  { key: 'module', title: 'Per module', desc: 'One subject or module.' },
  { key: 'classGroup', title: 'Per class group', desc: 'One class group.' },
];

export function Wizard({
  state,
  setIntent,
  setScope,
  setFirstDayOfWeek,
  updateForm,
  onGenerate,
  onSwitchToFullForm,
  busy,
}: Props) {
  const [step, setStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);

  const stepErrors = validateStep(step, state);

  const goNext = () => {
    if (stepErrors.length > 0) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    setStep((s) => Math.min(s + 1, WIZARD_STEPS.length - 1));
  };

  const goBack = () => {
    setShowErrors(false);
    setStep((s) => Math.max(s - 1, 0));
  };

  const selectStep = (target: number) => {
    if (target <= step) {
      // Back navigation is always allowed.
      setShowErrors(false);
      setStep(target);
      return;
    }
    // Forward only if every step in between is valid.
    for (let i = step; i < target; i++) {
      if (validateStep(i, state).length > 0) {
        setShowErrors(true);
        return;
      }
    }
    setShowErrors(false);
    setStep(target);
  };

  const primaryName = state.form.courseName || '—';

  return (
    <section className="panel wizard">
      <div className="wizard__head">
        <h2>Create a timetable</h2>
        <button type="button" className="linkbtn" onClick={onSwitchToFullForm}>
          Skip wizard, use full form
        </button>
      </div>

      <Stepper steps={WIZARD_STEPS} current={step} onSelect={selectStep} />

      <div className="wizard__body">
        {step === 0 && (
          <div data-tour="intent">
            <div className="field__labelrow">
              <h3>What are you creating?</h3>
              <Tooltip text={TOOLTIPS.intent} />
            </div>
            <div className="intent-grid">
              {INTENTS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`intent-card${
                    state.intent === opt.key ? ' selected' : ''
                  }`}
                  aria-pressed={state.intent === opt.key}
                  onClick={() => setIntent(opt.key)}
                >
                  {opt.thumb}
                  <span className="intent-card__title">{opt.title}</span>
                  <span className="intent-card__desc">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 1 && (
          <div>
            <div className="field__labelrow">
              <h3>What does this timetable cover?</h3>
              <Tooltip text={TOOLTIPS.scope} />
            </div>
            <div className="scope-list">
              {SCOPES.map((opt) => (
                <label
                  key={opt.key}
                  className={`scope-card${
                    state.scope === opt.key ? ' selected' : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="scope"
                    checked={state.scope === opt.key}
                    onChange={() => setScope(opt.key)}
                  />
                  <span>
                    <strong>{opt.title}</strong>
                    <span className="scope-card__desc">{opt.desc}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="hint">
              Primary field will be labelled “{primaryNameLabel(state.scope)}”.
            </p>
          </div>
        )}

        {step === 2 && (
          <DetailsFields
            form={state.form}
            update={updateForm}
            scope={state.scope}
          />
        )}

        {step === 3 && (
          <RulesFields
            form={state.form}
            update={updateForm}
            firstDayOfWeek={state.firstDayOfWeek}
            setFirstDayOfWeek={setFirstDayOfWeek}
          />
        )}

        {step === 4 && (
          <div className="review">
            <h3>Review &amp; generate</h3>
            <dl className="review__grid">
              <dt>Output</dt>
              <dd>{state.intent}</dd>
              <dt>Scope</dt>
              <dd>{SCOPES.find((s) => s.key === state.scope)?.title}</dd>
              <dt>{primaryNameLabel(state.scope)}</dt>
              <dd>{primaryName}</dd>
              <dt>Class group</dt>
              <dd>{state.form.classGroup || '—'}</dd>
              <dt>Teacher</dt>
              <dd>{state.form.teacher || '—'}</dd>
              <dt>Classroom</dt>
              <dd>{state.form.classroom || '—'}</dd>
              <dt>Lessons</dt>
              <dd>
                {state.form.totalLessons || '—'} total ·{' '}
                {state.form.mode === 'permonth'
                  ? `${state.form.lessonsPerMonth || '—'} per month`
                  : 'every weekday'}
              </dd>
              <dt>Start</dt>
              <dd>
                {state.form.startDate
                  ? formatDisplayDate(state.form.startDate)
                  : '—'}{' '}
                {state.form.startTime}–{state.form.endTime}
              </dd>
              <dt>Holidays</dt>
              <dd>
                {parseLinesCount(state.form.uccHolidaysRaw)} school ·{' '}
                {parseLinesCount(state.form.publicHolidaysRaw)} public
              </dd>
              <dt>Week starts</dt>
              <dd>
                {state.firstDayOfWeek === 'monday' ? 'Monday' : 'Sunday'}
              </dd>
            </dl>
          </div>
        )}

        {showErrors && stepErrors.length > 0 && (
          <div className="messages" role="alert">
            <ul>
              {stepErrors.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="wizard__nav">
        <button
          type="button"
          className="btn"
          onClick={goBack}
          disabled={step === 0}
        >
          Back
        </button>
        {step < WIZARD_STEPS.length - 1 ? (
          <button type="button" className="btn btn--primary" onClick={goNext}>
            Next
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={onGenerate}
            disabled={busy}
          >
            Generate timetable
          </button>
        )}
      </div>
    </section>
  );
}
