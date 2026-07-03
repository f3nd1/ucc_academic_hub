import { useMemo, useState } from 'react';
import {
  EMPTY_FORM,
  DEMO_FORM,
  validateForm,
  buildConfig,
  buildHolidays,
  type RawForm,
} from '../formModel';
import { generateSchedule } from '../scheduler';
import { exportCsv, exportPdf } from '../exports';
import { downloadIcs } from '../googleCalendar';
import { exportToGoogleSheets } from '../googleSheets';
import {
  listErpRecords,
  fetchErpRecord,
  type ErpRecordSummary,
} from '../erpnext';
import type { FirstDayOfWeek } from '../settings';
import { useSettings } from '../settingsStore';
import { useTimetableStore, type ViewMode } from '../timetableStore';
import { formatDisplayDate, formatDate } from '../dateUtils';
import { buildPlanner } from '../planner';
import { exportPlannerCsv, exportPlannerToSheets } from '../plannerExports';
import { openTabForAsyncUrl } from '../popup';
import { ListView } from '../views/ListView';
import { MonthView } from '../views/MonthView';
import { HybridView } from '../views/HybridView';
import { Wizard } from '../wizard/Wizard';
import { FullForm } from '../FullForm';
import {
  saveWizard,
  primaryNameLabel,
  scopeTitleLabel,
  type Intent,
  type Scope,
} from '../wizard/wizardModel';

const EXPORT_EMPTY_MESSAGE =
  'Generate a timetable before exporting — there is nothing to download yet.';

export function TimetablePage() {
  const [settings] = useSettings();
  // All of this lives in the route-persistent store so a trip to /settings and
  // back loses neither the generated timetable nor the wizard progress.
  const {
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
  } = useTimetableStore();
  const [busy, setBusy] = useState(false);
  // ERPNext record picker contents (null = picker closed). Transient UI state,
  // deliberately NOT in the route-persistent store.
  const [erpRecords, setErpRecords] = useState<ErpRecordSummary[] | null>(null);

  const todayIso = useMemo(() => formatDate(new Date()), []);

  const updateForm = (patch: Partial<RawForm>) =>
    setWizard((w) => ({ ...w, form: { ...w.form, ...patch } }));
  const setIntent = (intent: Intent) => setWizard((w) => ({ ...w, intent }));
  const setScope = (scope: Scope) => setWizard((w) => ({ ...w, scope }));
  const setFirstDayOfWeek = (firstDayOfWeek: FirstDayOfWeek) =>
    setWizard((w) => ({ ...w, firstDayOfWeek }));

  const summary = useMemo(() => {
    if (!lessons || lessons.length === 0) return null;
    return {
      total: lessons.length,
      first: formatDisplayDate(lessons[0].date),
      last: formatDisplayDate(lessons[lessons.length - 1].date),
    };
  }, [lessons]);

  const plannerModel = useMemo(() => {
    if (!lessons || lessons.length === 0 || !config || !holidays) return null;
    return buildPlanner(
      lessons,
      config,
      holidays,
      wizard.firstDayOfWeek,
      todayIso,
      scopeTitleLabel(wizard.scope),
    );
  }, [lessons, config, holidays, wizard.firstDayOfWeek, wizard.scope, todayIso]);

  const resetResults = () => {
    setLessons(null);
    setConfig(null);
    setHolidays(null);
    setMessages([]);
    setBanner(null);
  };

  const handleGenerate = () => {
    setBanner(null);
    const errors = validateForm(wizard.form, primaryNameLabel(wizard.scope));
    if (errors.length > 0) {
      setMessages(errors);
      setLessons(null);
      setConfig(null);
      setHolidays(null);
      return;
    }

    const cfg = buildConfig(wizard.form);
    const holidaySet = buildHolidays(wizard.form);
    try {
      const result = generateSchedule(cfg, holidaySet);
      setLessons(result);
      setConfig(cfg);
      setHolidays(holidaySet);
      setMessages([]);
      setView(wizard.intent); // open in the intent chosen in Step 1
      saveWizard(wizard); // prefill next visit with these values
    } catch (err) {
      setMessages([err instanceof Error ? err.message : String(err)]);
      setLessons(null);
      setConfig(null);
      setHolidays(null);
    }
  };

  const handleLoadDemo = () => {
    setWizard((w) => ({ ...w, form: DEMO_FORM }));
    resetResults();
  };

  const handleClear = () => {
    setWizard((w) => ({ ...w, form: EMPTY_FORM }));
    resetResults();
  };

  // ERPNext import is two-step: list records for a picker, then fetch the
  // chosen document (the single-doc endpoint returns child tables, which list
  // queries omit).
  const handleImportErpnext = async () => {
    setBusy(true);
    setBanner(null);
    const result = await listErpRecords(settings);
    setErpRecords(result.ok && result.data ? result.data : null);
    setBanner({ ok: result.ok, message: result.message });
    setBusy(false);
  };

  const handlePickErpRecord = async (name: string) => {
    setBusy(true);
    setBanner(null);
    const result = await fetchErpRecord(settings, name);
    if (result.ok && result.data) {
      setWizard((w) => ({ ...w, form: result.data! }));
      setLessons(null);
      setConfig(null);
      setHolidays(null);
      setMessages([]);
      setErpRecords(null); // close the picker on success
    }
    setBanner({ ok: result.ok, message: result.message });
    setBusy(false);
  };

  const guardedExport = (fn: () => void) => {
    if (!lessons || lessons.length === 0 || !config) {
      setMessages([EXPORT_EMPTY_MESSAGE]);
      return;
    }
    fn();
  };

  const handleGoogleSheets = async () => {
    if (!lessons || lessons.length === 0 || !config) {
      setMessages([EXPORT_EMPTY_MESSAGE]);
      return;
    }
    // Open the tab now, inside the click gesture, so it isn't popup-blocked.
    const navigateTab = openTabForAsyncUrl();
    setBusy(true);
    setBanner(null);
    const result = await exportToGoogleSheets(
      lessons,
      config,
      settings.googleClientId,
    );
    navigateTab(result.url);
    setBanner({ ok: result.ok, message: result.message });
    setBusy(false);
  };

  const handlePlannerCsv = () => {
    if (!plannerModel) {
      setMessages([EXPORT_EMPTY_MESSAGE]);
      return;
    }
    exportPlannerCsv(plannerModel);
  };

  const handlePlannerSheets = async () => {
    if (!plannerModel) {
      setMessages([EXPORT_EMPTY_MESSAGE]);
      return;
    }
    // Open the tab now, inside the click gesture, so it isn't popup-blocked.
    const navigateTab = openTabForAsyncUrl();
    setBusy(true);
    setBanner(null);
    const result = await exportPlannerToSheets(
      plannerModel,
      settings.googleClientId,
    );
    navigateTab(result.url);
    setBanner({ ok: result.ok, message: result.message });
    setBusy(false);
  };

  const hasLessons = !!lessons && lessons.length > 0;

  return (
    <div className="layout">
      {/* ---------------- Left: wizard or full form ---------------- */}
      {layout === 'wizard' ? (
        <Wizard
          state={wizard}
          step={wizardStep}
          setStep={setWizardStep}
          setIntent={setIntent}
          setScope={setScope}
          setFirstDayOfWeek={setFirstDayOfWeek}
          updateForm={updateForm}
          onGenerate={handleGenerate}
          onSwitchToFullForm={() => setLayout('full')}
          busy={busy}
        />
      ) : (
        <FullForm
          state={wizard}
          setIntent={setIntent}
          setScope={setScope}
          setFirstDayOfWeek={setFirstDayOfWeek}
          updateForm={updateForm}
          onGenerate={handleGenerate}
          onLoadDemo={handleLoadDemo}
          onClear={handleClear}
          onImportErpnext={handleImportErpnext}
          erpRecords={erpRecords}
          onPickErpRecord={handlePickErpRecord}
          onCancelErpPick={() => setErpRecords(null)}
          onSwitchToWizard={() => setLayout('wizard')}
          busy={busy}
        />
      )}

      {/* ---------------- Right: preview + exports ---------------- */}
      <section className="panel">
        <div className="preview-head">
          <h2>Preview</h2>
          <div className="exports" data-tour="exports">
            <button
              className="btn"
              onClick={() => guardedExport(() => exportCsv(lessons!, config!))}
            >
              CSV
            </button>
            <button
              className="btn"
              title="Excel export is unavailable in this build (SheetJS dependency blocked by network policy)."
              disabled
            >
              Excel
            </button>
            <button
              className="btn"
              onClick={() =>
                guardedExport(() =>
                  exportPdf(lessons!, config!, scopeTitleLabel(wizard.scope)),
                )
              }
            >
              PDF
            </button>
            <button
              className="btn"
              onClick={() => guardedExport(() => downloadIcs(lessons!, config!))}
            >
              .ics
            </button>
            <button className="btn" onClick={handleGoogleSheets} disabled={busy}>
              Google Sheets
            </button>
            {view === 'hybrid' && (
              <>
                <button
                  className="btn btn--primary"
                  onClick={handlePlannerSheets}
                  disabled={busy}
                >
                  Planner (Sheets)
                </button>
                <button className="btn" onClick={handlePlannerCsv}>
                  Planner (CSV)
                </button>
              </>
            )}
          </div>
        </div>

        {messages.length > 0 && (
          <div className="messages" role="alert">
            <ul>
              {messages.map((m, i) => (
                <li key={i}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        {banner && (
          <div
            className={`banner ${banner.ok ? 'banner--ok' : 'banner--error'}`}
            role="status"
          >
            {banner.message}
          </div>
        )}

        {summary && (
          <div className="summary">
            <span>
              <strong>{summary.total}</strong> scheduled
            </span>
            <span>
              First <strong>{summary.first}</strong>
            </span>
            <span>
              Last <strong>{summary.last}</strong>
            </span>
          </div>
        )}

        {hasLessons && (
          <div
            className="segmented view-switch"
            role="group"
            aria-label="View"
            data-tour="view-switch"
          >
            {(['list', 'calendar', 'hybrid'] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                className={view === v ? 'active' : ''}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === 'list' ? 'List' : v === 'calendar' ? 'Calendar' : 'Hybrid'}
              </button>
            ))}
          </div>
        )}

        {hasLessons ? (
          view === 'list' ? (
            <ListView lessons={lessons!} courseName={config!.courseName} />
          ) : view === 'calendar' ? (
            <MonthView
              lessons={lessons!}
              firstDayOfWeek={wizard.firstDayOfWeek}
              courseName={config!.courseName}
            />
          ) : (
            plannerModel && <HybridView model={plannerModel} />
          )
        ) : (
          !messages.length && (
            <p className="empty">
              No timetable yet. Complete the steps and click{' '}
              <strong>Generate timetable</strong>.
            </p>
          )
        )}
      </section>
    </div>
  );
}
