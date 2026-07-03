import { useMemo, useState } from 'react';
import {
  EMPTY_FORM,
  DEMO_FORM,
  emptyModule,
  validateForm,
  buildCourse,
  buildHolidays,
  type CourseForm,
  type ModuleForm,
} from '../formModel';
import {
  generateCourseSchedule,
  detectConflicts,
  shiftModuleLater,
} from '../courseEngine';
import { exportCsv, exportListPdf, exportCalendarPdf } from '../exports';
import { downloadIcs } from '../googleCalendar';
import { exportToGoogleSheets } from '../googleSheets';
import {
  listErpRecords,
  fetchErpRecord,
  type ErpRecordSummary,
} from '../erpnext';
import { loadErpFieldMapping } from '../erpFieldMapping';
import type { FirstDayOfWeek } from '../settings';
import { CLASS_GROUP_LABEL } from '../constants';
import { useSettings } from '../settingsStore';
import { useTimetableStore, type ViewMode } from '../timetableStore';
import { formatDisplayDate, formatDate } from '../dateUtils';
import { buildPlanner } from '../planner';
import {
  exportPlannerCsv,
  exportPlannerToSheets,
  exportPlannerPdf,
} from '../plannerExports';
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
  } = useTimetableStore();
  const [busy, setBusy] = useState(false);
  // ERPNext record picker contents (null = picker closed). Transient UI state,
  // deliberately NOT in the route-persistent store.
  const [erpRecords, setErpRecords] = useState<ErpRecordSummary[] | null>(null);

  const todayIso = useMemo(() => formatDate(new Date()), []);

  const updateForm = (patch: Partial<CourseForm>) =>
    setWizard((w) => ({ ...w, form: { ...w.form, ...patch } }));
  const updateModule = (id: string, patch: Partial<ModuleForm>) =>
    setWizard((w) => ({
      ...w,
      form: {
        ...w.form,
        modules: w.form.modules.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      },
    }));
  const addModule = () =>
    setWizard((w) => ({
      ...w,
      form: { ...w.form, modules: [...w.form.modules, emptyModule()] },
    }));
  const removeModule = (id: string) =>
    setWizard((w) => ({
      ...w,
      form: {
        ...w.form,
        modules: w.form.modules.filter((m) => m.id !== id),
      },
    }));
  const setIntent = (intent: Intent) => setWizard((w) => ({ ...w, intent }));
  const setScope = (scope: Scope) => setWizard((w) => ({ ...w, scope }));
  const setFirstDayOfWeek = (firstDayOfWeek: FirstDayOfWeek) =>
    setWizard((w) => ({ ...w, firstDayOfWeek }));

  const summary = useMemo(() => {
    if (!lessons || lessons.length === 0) return null;
    // Real lessons only; AL buffer days pad the course but are not sessions.
    const real = lessons.filter((l) => l.kind === 'lesson');
    if (real.length === 0) return null;
    return {
      total: real.length,
      al: lessons.length - real.length,
      first: formatDisplayDate(real[0].date),
      last: formatDisplayDate(real[real.length - 1].date),
    };
  }, [lessons]);

  const plannerModel = useMemo(() => {
    if (!lessons || lessons.length === 0 || !course || !holidays) return null;
    return buildPlanner(
      lessons,
      course,
      holidays,
      wizard.firstDayOfWeek,
      todayIso,
      scopeTitleLabel(wizard.scope),
    );
  }, [lessons, course, holidays, wizard.firstDayOfWeek, wizard.scope, todayIso]);

  const resetResults = () => {
    setLessons(null);
    setCourse(null);
    setHolidays(null);
    setConflicts([]);
    setMessages([]);
    setBanner(null);
  };

  const handleGenerate = () => {
    setBanner(null);
    const errors = validateForm(wizard.form, primaryNameLabel(wizard.scope));
    if (errors.length > 0) {
      setMessages(errors);
      setLessons(null);
      setCourse(null);
      setHolidays(null);
      return;
    }

    const builtCourse = buildCourse(wizard.form);
    const holidaySet = buildHolidays(wizard.form);
    try {
      const generated = generateCourseSchedule(builtCourse, holidaySet);
      // Scan for cross-module clashes and attach them for highlighting.
      const scanned = detectConflicts(generated);
      setLessons(scanned.lessons);
      setConflicts(scanned.conflicts);
      setCourse(builtCourse);
      setHolidays(holidaySet);
      setMessages([]);
      setView(wizard.intent); // open in the intent chosen in Step 1
      saveWizard(wizard); // prefill next visit with these values
    } catch (err) {
      setMessages([err instanceof Error ? err.message : String(err)]);
      setLessons(null);
      setCourse(null);
      setHolidays(null);
      setConflicts([]);
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
  // chosen document mapped through the saved per-DocType field mapping
  // (Settings). With exactly one record there's nothing to pick, so it's
  // imported straight away with a note; lesson names are never imported —
  // they stay whatever the user typed.
  const handleImportErpnext = async () => {
    setBusy(true);
    setBanner(null);
    const mapping = loadErpFieldMapping(settings.erpDocType);
    const result = await listErpRecords(settings, mapping);
    if (result.ok && result.data && result.data.length === 1) {
      const only = result.data[0];
      const imported = await fetchErpRecord(settings, mapping, only.name);
      if (imported.ok && imported.data) {
        setWizard((w) => ({ ...w, form: imported.data! }));
        setLessons(null);
        setCourse(null);
        setHolidays(null);
        setMessages([]);
      }
      setErpRecords(null);
      setBanner({
        ok: imported.ok,
        message: imported.ok
          ? `Only one "${settings.erpDocType}" record found — imported "${only.name}" automatically.`
          : imported.message,
      });
      setBusy(false);
      return;
    }
    setErpRecords(result.ok && result.data ? result.data : null);
    setBanner({ ok: result.ok, message: result.message });
    setBusy(false);
  };

  const handlePickErpRecord = async (name: string) => {
    setBusy(true);
    setBanner(null);
    const mapping = loadErpFieldMapping(settings.erpDocType);
    const result = await fetchErpRecord(settings, mapping, name);
    if (result.ok && result.data) {
      setWizard((w) => ({ ...w, form: result.data! }));
      setLessons(null);
      setCourse(null);
      setHolidays(null);
      setMessages([]);
      setErpRecords(null); // close the picker on success
    }
    setBanner({ ok: result.ok, message: result.message });
    setBusy(false);
  };

  // Shift a module later by 1|2 valid teaching days (consumes AL buffer in
  // series mode). Rejected with a warning when it would pass the module's
  // end-of-month deadline; conflicts re-scan after every applied shift.
  const handleShift = (moduleId: string, days: 1 | 2) => {
    if (!lessons || !holidays) return;
    setBanner(null);
    const result = shiftModuleLater(lessons, moduleId, days, holidays);
    if (!result.ok) {
      setBanner({ ok: false, message: result.message });
      return;
    }
    const scanned = detectConflicts(result.lessons);
    setLessons(scanned.lessons);
    setConflicts(scanned.conflicts);
    const name = course?.modules.find((m) => m.id === moduleId)?.name ?? 'Module';
    setBanner({
      ok: true,
      message: `${name} shifted ${days} teaching day${days > 1 ? 's' : ''} later.`,
    });
  };

  const guardedExport = (fn: () => void) => {
    if (!lessons || lessons.length === 0 || !course) {
      setMessages([EXPORT_EMPTY_MESSAGE]);
      return;
    }
    fn();
  };

  // PDF follows the ACTIVE view: List -> table, Calendar -> month grids,
  // Hybrid -> the planner matrix (matching the Planner Sheets export).
  const handlePdf = () =>
    guardedExport(() => {
      if (view === 'calendar') {
        exportCalendarPdf(
          lessons!,
          course!,
          wizard.firstDayOfWeek,
          scopeTitleLabel(wizard.scope),
        );
      } else if (view === 'hybrid' && plannerModel) {
        exportPlannerPdf(plannerModel);
      } else {
        exportListPdf(lessons!, course!, scopeTitleLabel(wizard.scope));
      }
    });

  const handleGoogleSheets = async () => {
    if (!lessons || lessons.length === 0 || !course) {
      setMessages([EXPORT_EMPTY_MESSAGE]);
      return;
    }
    // Open the tab now, inside the click gesture, so it isn't popup-blocked.
    const navigateTab = openTabForAsyncUrl();
    setBusy(true);
    setBanner(null);
    const result = await exportToGoogleSheets(
      lessons,
      course,
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
          updateModule={updateModule}
          addModule={addModule}
          removeModule={removeModule}
          onGenerate={handleGenerate}
          onSwitchToFullForm={() => setLayout('full')}
          onLoadDemo={handleLoadDemo}
          busy={busy}
        />
      ) : (
        <FullForm
          state={wizard}
          setIntent={setIntent}
          setScope={setScope}
          setFirstDayOfWeek={setFirstDayOfWeek}
          updateForm={updateForm}
          updateModule={updateModule}
          addModule={addModule}
          removeModule={removeModule}
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
              title="Always exports the list-style table, whatever view is active."
              onClick={() => guardedExport(() => exportCsv(lessons!, course!))}
            >
              CSV (list)
            </button>
            <button
              className="btn"
              title="Excel export is unavailable in this build (SheetJS dependency blocked by network policy)."
              disabled
            >
              Excel (list)
            </button>
            <button
              className="btn"
              title="Exports whichever view is currently selected."
              onClick={handlePdf}
            >
              PDF (current view)
            </button>
            <button
              className="btn"
              onClick={() => guardedExport(() => downloadIcs(lessons!, course!))}
            >
              .ics
            </button>
            <button
              className="btn"
              title="Always exports the list-style table to Google Sheets."
              onClick={handleGoogleSheets}
              disabled={busy}
            >
              Sheets (list)
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
              <strong>{summary.total}</strong> lessons
            </span>
            {summary.al > 0 && (
              <span>
                <strong>{summary.al}</strong> AL days
              </span>
            )}
            <span>
              First <strong>{summary.first}</strong>
            </span>
            <span>
              Last <strong>{summary.last}</strong>
            </span>
          </div>
        )}

        {hasLessons && course && (
          <div className="modules-panel" data-tour="shift">
            <p className="modules-panel__title">Modules</p>
            {course.modules.map((m) => {
              const modLessons = (lessons ?? []).filter(
                (l) => l.moduleId === m.id && l.kind === 'lesson',
              );
              if (modLessons.length === 0) return null;
              const first = formatDisplayDate(modLessons[0].date);
              const last = formatDisplayDate(
                modLessons[modLessons.length - 1].date,
              );
              return (
                <div className="modules-panel__row" key={m.id}>
                  <span>
                    <strong>{m.name}</strong>{' '}
                    <span className="modules-panel__meta">
                      {modLessons.length} lessons · {first} – {last}
                    </span>
                  </span>
                  <span className="modules-panel__actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleShift(m.id, 1)}
                    >
                      Shift +1 day
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleShift(m.id, 2)}
                    >
                      +2 days
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {hasLessons &&
          (conflicts.length > 0 ? (
            <div className="conflicts" role="alert" data-tour="conflicts">
              <p className="conflicts__title">
                ⚠ {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''}{' '}
                detected
              </p>
              <ul className="conflicts__list">
                {conflicts.map((c, i) => (
                  <li className="conflicts__item" key={i}>
                    <strong>{formatDisplayDate(c.date)}</strong> —{' '}
                    {c.type === 'teacher'
                      ? 'Teacher clash'
                      : c.type === 'classroom'
                        ? 'Classroom clash'
                        : `${CLASS_GROUP_LABEL} clash`}
                    : {c.detail}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="conflicts conflicts--clear" role="status">
              ✓ No conflicts — teachers, classrooms, and class groups are clear
              across all modules.
            </div>
          ))}

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
            <ListView lessons={lessons!} courseName={course!.name} />
          ) : view === 'calendar' ? (
            <MonthView
              lessons={lessons!}
              firstDayOfWeek={wizard.firstDayOfWeek}
              courseName={course!.name}
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
