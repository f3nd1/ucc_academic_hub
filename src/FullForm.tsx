import type { CourseForm, ModuleForm } from './formModel';
import type { FirstDayOfWeek } from './settings';
import type { ErpRecordSummary } from './erpnext';
import { DetailsFields } from './components/DetailsFields';
import { RulesFields } from './components/RulesFields';
import {
  type WizardState,
  type Intent,
  type Scope,
} from './wizard/wizardModel';

interface Props {
  state: WizardState;
  setIntent: (i: Intent) => void;
  setScope: (s: Scope) => void;
  setFirstDayOfWeek: (d: FirstDayOfWeek) => void;
  updateForm: (patch: Partial<CourseForm>) => void;
  updateModule: (id: string, patch: Partial<ModuleForm>) => void;
  addModule: () => void;
  removeModule: (id: string) => void;
  onGenerate: () => void;
  onLoadDemo: () => void;
  onClear: () => void;
  onImportErpnext: () => void;
  /** Non-null while the ERPNext record picker is open. */
  erpRecords: ErpRecordSummary[] | null;
  onPickErpRecord: (name: string) => void;
  onCancelErpPick: () => void;
  onSwitchToWizard: () => void;
  busy: boolean;
}

/** Legacy all-at-once form for power users. Shares fields with the wizard. */
export function FullForm({
  state,
  setIntent,
  setScope,
  setFirstDayOfWeek,
  updateForm,
  updateModule,
  addModule,
  removeModule,
  onGenerate,
  onLoadDemo,
  onClear,
  onImportErpnext,
  erpRecords,
  onPickErpRecord,
  onCancelErpPick,
  onSwitchToWizard,
  busy,
}: Props) {
  return (
    <section className="panel">
      <div className="setup-head">
        <h2>Setup</h2>
        <div className="setup-actions">
          <button type="button" className="linkbtn" onClick={onSwitchToWizard}>
            Back to wizard
          </button>
          <button
            type="button"
            className="btn btn--demo"
            onClick={onImportErpnext}
            disabled={busy}
          >
            Import from ERPNext
          </button>
          <button type="button" className="btn btn--demo" onClick={onLoadDemo}>
            Load demo data
          </button>
        </div>
      </div>

      {erpRecords && (
        <div className="erp-picker" role="region" aria-label="ERPNext records">
          <div className="erp-picker__head">
            <strong>Pick a record to import</strong>
            <button type="button" className="linkbtn" onClick={onCancelErpPick}>
              Cancel
            </button>
          </div>
          <ul className="erp-picker__list">
            {erpRecords.map((r) => (
              <li key={r.name}>
                <button
                  type="button"
                  className="erp-picker__item"
                  onClick={() => onPickErpRecord(r.name)}
                  disabled={busy}
                >
                  <span className="erp-picker__label">{r.label}</span>
                  <span className="erp-picker__name">{r.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid-2">
        <div className="field">
          <span className="field__labelrow">
            <label htmlFor="ff-scope">Scope</label>
          </span>
          <select
            id="ff-scope"
            value={state.scope}
            onChange={(e) => setScope(e.target.value as Scope)}
          >
            <option value="course">Per course</option>
            <option value="module">Per module</option>
            <option value="classGroup">Per class group</option>
          </select>
        </div>
        <div className="field">
          <span className="field__labelrow">
            <label htmlFor="ff-intent">Default view</label>
          </span>
          <select
            id="ff-intent"
            value={state.intent}
            onChange={(e) => setIntent(e.target.value as Intent)}
          >
            <option value="list">List</option>
            <option value="calendar">Calendar</option>
            <option value="hybrid">Hybrid planner</option>
          </select>
        </div>
      </div>

      <DetailsFields
        form={state.form}
        update={updateForm}
        updateModule={updateModule}
        addModule={addModule}
        removeModule={removeModule}
        scope={state.scope}
      />

      <h2 className="panel__subhead">Holidays &amp; week</h2>
      <RulesFields
        form={state.form}
        update={updateForm}
        firstDayOfWeek={state.firstDayOfWeek}
        setFirstDayOfWeek={setFirstDayOfWeek}
      />

      <div className="actions">
        <button className="btn btn--primary" onClick={onGenerate}>
          Generate timetable
        </button>
        <button className="btn" onClick={onClear}>
          Clear
        </button>
      </div>
    </section>
  );
}
