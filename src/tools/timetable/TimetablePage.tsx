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
} from '../../formModel';
import {
  generateCourseSchedule,
  detectConflicts,
  validateModuleFit,
  observedPublicHolidays,
} from '../../courseEngine';
import { exportCsv, exportListPdf, exportCalendarPdf } from '../../exports';
import { downloadIcs } from '../../googleCalendar';
import { exportToGoogleSheets } from '../../googleSheets';
import {
  listErpRecords,
  fetchErpRecord,
  type ErpRecordSummary,
} from '../../erpnext';
import { loadErpFieldMapping } from '../../erpFieldMapping';
import { Icon } from '../../shared/Icon';
import type { ScheduledLesson } from '../../types';
import type { FirstDayOfWeek } from '../../shared/settings';
import { useSettings } from '../../shared/settingsStore';
import { useTimetableStore, type ViewMode } from '../../timetableStore';
import {
  formatDisplayDate,
  formatDate,
  dayName,
  parseLocal,
} from '../../shared/dates';
import { buildPlanner } from '../../planner';
import {
  exportPlannerCsv,
  exportPlannerToSheets,
  exportPlannerPdf,
} from '../../plannerExports';
import { openTabForAsyncUrl } from '../../popup';
import { ListView } from '../../views/ListView';
import { MonthView } from '../../views/MonthView';
import { HybridView } from '../../views/HybridView';
import { AmendView, type AmendableField } from '../../views/AmendView';
import { Wizard } from '../../wizard/Wizard';
import { FullForm } from '../../FullForm';
import { SavedItemControls } from '../../shared/SavedItemControls';
import { parseTimetablePayload, type TimetablePayload } from './timetableSaved';
import {
  saveWizard,
  primaryNameLabel,
  scopeTitleLabel,
  type Intent,
  type Scope,
} from '../../wizard/wizardModel';

const EXPORT_EMPTY_MESSAGE =
  'Generate a timetable before exporting — there is nothing to download yet.';

// Counter for hand-added sessions, so each gets a moduleId no generated module
// can collide with (generated ids come from the form's "mod-" sequence).
let manualSeq = 0;

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
  // Duplicate a module: copy every field into a new, independently-editable row
  // inserted right after the original (a fresh id, name suffixed "Copy").
  const duplicateModule = (id: string) =>
    setWizard((w) => {
      const source = w.form.modules.find((m) => m.id === id);
      if (!source) return w;
      const copy: ModuleForm = {
        ...source,
        id: emptyModule().id,
        name: source.name ? `${source.name} Copy` : '',
      };
      const idx = w.form.modules.findIndex((m) => m.id === id);
      const modules = [...w.form.modules];
      modules.splice(idx + 1, 0, copy);
      return { ...w, form: { ...w.form, modules } };
    });
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
    // Earliest/latest by scan, not by array position: a hand-added session is
    // appended at the end regardless of its date, which made "Last" report the
    // added row's date instead of the true final lesson.
    let first = real[0].date;
    let last = real[0].date;
    for (const l of real) {
      if (l.date < first) first = l.date;
      if (l.date > last) last = l.date;
    }
    return {
      total: real.length,
      al: lessons.length - real.length,
      first: formatDisplayDate(first),
      last: formatDisplayDate(last),
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
      // Non-blocking warnings for modules whose lessons don't fit their window
      // after excluding weekends/holidays (only the days that fit are placed).
      setMessages(validateModuleFit(builtCourse, holidaySet));
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

  // Manual amendment: edit a generated entry in place. The timetable updates
  // immediately and conflicts are re-detected, so an edit that makes two
  // different modules share a teacher + classroom + overlapping time on the
  // same date is highlighted at once (here and in every other view).
  const handleAmendEdit = (
    moduleId: string,
    lessonNo: number,
    field: AmendableField,
    value: string,
  ) => {
    if (!lessons) return;
    const updated = lessons.map((l) =>
      l.moduleId === moduleId && l.lessonNo === lessonNo
        ? {
            ...l,
            [field]: value,
            ...(field === 'date' && value
              ? { day: dayName(parseLocal(value)) }
              : {}),
          }
        : l,
    );
    const scanned = detectConflicts(updated);
    setLessons(scanned.lessons);
    setConflicts(scanned.conflicts);
  };

  // Add an extra session by hand. The generator only spreads a module's own
  // lessons across its own window, so pinning a second session to a date that
  // already has one is necessarily manual. The new entry gets a FRESH moduleId
  // rather than reusing an existing one: detectConflicts only compares lessons
  // from different modules, so a distinct id is what lets a genuine overlap
  // with the original session still be flagged.
  const handleAmendAdd = () => {
    if (!lessons) return;
    const real = lessons.filter((l) => l.kind === 'lesson');
    // Anchor to the earliest existing date so the row lands inside the
    // timetable's month range and is visible in Calendar/Hybrid straight away.
    const anchor = real.reduce<string>(
      (min, l) => (min === '' || l.date < min ? l.date : min),
      '',
    );
    const template = real.find((l) => l.date === anchor);
    const date = anchor || todayIso;
    const added: ScheduledLesson = {
      groupId: `manual-${++manualSeq}`,
      moduleId: `manual-${manualSeq}`,
      moduleName: 'New session',
      kind: 'lesson',
      lessonNo: 1,
      lessonName: '',
      activity: '',
      date,
      day: dayName(parseLocal(date)),
      // An afternoon default so it does not overlap a typical morning session.
      startTime: '14:00',
      endTime: '17:00',
      teacher: template?.teacher ?? '',
      classroom: template?.classroom ?? '',
      classGroup: template?.classGroup ?? '',
    };
    const scanned = detectConflicts([...lessons, added]);
    setLessons(scanned.lessons);
    setConflicts(scanned.conflicts);
    setView('amend');
  };

  const handleAmendRemove = (moduleId: string, lessonNo: number) => {
    if (!lessons) return;
    const remaining = lessons.filter(
      (l) => !(l.moduleId === moduleId && l.lessonNo === lessonNo),
    );
    const scanned = detectConflicts(remaining);
    setLessons(scanned.lessons);
    setConflicts(scanned.conflicts);
  };

  const guardedExport = (fn: () => void) => {
    if (!lessons || lessons.length === 0 || !course) {
      setMessages([EXPORT_EMPTY_MESSAGE]);
      return;
    }
    fn();
  };

  // --- Saved Items: serialise/restore the whole generated timetable ---------
  const canSaveTimetable = !!lessons && lessons.length > 0 && !!course && !!holidays;

  const buildTimetablePayload = (): TimetablePayload => ({
    version: 1,
    wizard,
    lessons: lessons ?? [],
    course: course!,
    holidays: holidays!,
  });

  // Restore a saved timetable: put the wizard/config back AND the generated
  // (possibly hand-edited) lessons, then re-run conflict detection so the
  // highlighted clashes reflect the restored schedule rather than stale data.
  const applyTimetablePayload = (payload: unknown) => {
    const p = parseTimetablePayload(payload);
    if (!p) {
      setBanner({
        ok: false,
        message: 'This saved item is missing timetable data and cannot be opened.',
      });
      return;
    }
    setWizard(p.wizard);
    const scan = detectConflicts(p.lessons);
    setLessons(scan.lessons);
    setConflicts(scan.conflicts);
    setCourse(p.course);
    setHolidays(p.holidays);
    setMessages([]);
    setView(p.wizard.intent ?? 'list');
    setBanner({ ok: true, message: 'Opened saved timetable.' });
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
  // Sunday public holidays auto-observe the following Monday; surfaced as a note.
  const observed = holidays
    ? observedPublicHolidays(holidays.publicHolidays)
    : [];

  return (
    <div className={`layout${setupCollapsed ? ' layout--collapsed' : ''}`}>
      {/* ---------------- Left: wizard or full form ---------------- */}
      {!setupCollapsed &&
        (layout === 'wizard' ? (
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
            duplicateModule={duplicateModule}
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
            duplicateModule={duplicateModule}
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
        ))}

      {/* ---------------- Right: preview + exports ---------------- */}
      <section className="panel">
        <div className="preview-head">
          <div className="preview-head__title">
            <button
              type="button"
              className="icon-toggle-btn"
              aria-label={
                setupCollapsed ? 'Show setup panel' : 'Hide setup panel'
              }
              aria-expanded={!setupCollapsed}
              title={
                setupCollapsed
                  ? 'Show the setup panel'
                  : 'Hide the setup panel to give the table more width'
              }
              onClick={() => setSetupCollapsed(!setupCollapsed)}
              data-tour="setup-toggle"
            >
              <Icon name="menu-2" size={18} />
            </button>
            <h2>Preview</h2>
          </div>
          <div className="exports" data-tour="exports">
            <SavedItemControls
              toolId="timetable"
              canSave={canSaveTimetable}
              buildPayload={buildTimetablePayload}
              applyPayload={applyTimetablePayload}
              loaded={savedItem}
              setLoaded={setSavedItem}
            />
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

        {observed.length > 0 && (
          <div className="banner banner--warn" role="note">
            <strong>Automatically observed:</strong>{' '}
            {observed
              .map((h) => `${formatDisplayDate(h.date)} — ${h.name}`)
              .join('; ')}
            . These fall the Monday after a Sunday public holiday and are
            blocked for scheduling.
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
                    <strong>{formatDisplayDate(c.date)}</strong> — Teacher, time
                    &amp; classroom clash: {c.detail}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="conflicts conflicts--clear" role="status">
              ✓ No conflicts — no two modules share the same teacher, classroom,
              and overlapping time on any date.
            </div>
          ))}

        {hasLessons && (
          <div
            className="segmented view-switch"
            role="group"
            aria-label="View"
            data-tour="view-switch"
          >
            {(['list', 'calendar', 'hybrid', 'amend'] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                className={view === v ? 'active' : ''}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === 'list'
                  ? 'List'
                  : v === 'calendar'
                    ? 'Calendar'
                    : v === 'hybrid'
                      ? 'Hybrid'
                      : 'Amend'}
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
          ) : view === 'amend' ? (
            <AmendView
              lessons={lessons!}
              onEdit={handleAmendEdit}
              onAdd={handleAmendAdd}
              onRemove={handleAmendRemove}
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

export default TimetablePage;
