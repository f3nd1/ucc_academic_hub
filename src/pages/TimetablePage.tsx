import { useMemo, useState } from 'react';
import { TEACHER_LABEL } from '../constants';
import type { ScheduledLesson, ClassGroupConfig } from '../types';
import {
  EMPTY_FORM,
  DEMO_FORM,
  validateForm,
  buildConfig,
  buildHolidays,
  type RawForm,
  type SchedulingMode,
} from '../formModel';
import { generateSchedule } from '../scheduler';
import { exportCsv, exportPdf } from '../exports';
import { downloadIcs } from '../googleCalendar';
import { exportToGoogleSheets } from '../googleSheets';
import { importFromErpnext } from '../erpnext';
import { useSettings } from '../settings';
import { formatDisplayDate } from '../dateUtils';
import { ListView } from '../views/ListView';
import { AgendaView } from '../views/AgendaView';
import { MonthView } from '../views/MonthView';

const EXPORT_EMPTY_MESSAGE =
  'Generate a timetable before exporting — there is nothing to download yet.';

type ViewMode = 'list' | 'agenda' | 'month';
type Banner = { ok: boolean; message: string } | null;

export function TimetablePage() {
  const [settings] = useSettings();
  const [form, setForm] = useState<RawForm>(EMPTY_FORM);
  const [lessons, setLessons] = useState<ScheduledLesson[] | null>(null);
  const [config, setConfig] = useState<ClassGroupConfig | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [view, setView] = useState<ViewMode>('list');
  const [banner, setBanner] = useState<Banner>(null);
  const [busy, setBusy] = useState(false);

  const set =
    <K extends keyof RawForm>(key: K) =>
    (value: RawForm[K]) =>
      setForm((f) => ({ ...f, [key]: value }));

  const setMode = (mode: SchedulingMode) => setForm((f) => ({ ...f, mode }));

  const summary = useMemo(() => {
    if (!lessons || lessons.length === 0) return null;
    return {
      total: lessons.length,
      first: formatDisplayDate(lessons[0].date),
      last: formatDisplayDate(lessons[lessons.length - 1].date),
    };
  }, [lessons]);

  const resetResults = () => {
    setLessons(null);
    setConfig(null);
    setMessages([]);
    setBanner(null);
  };

  const handleGenerate = () => {
    setBanner(null);
    const errors = validateForm(form);
    if (errors.length > 0) {
      setMessages(errors);
      setLessons(null);
      setConfig(null);
      return;
    }

    const cfg = buildConfig(form);
    const holidays = buildHolidays(form);
    try {
      const result = generateSchedule(cfg, holidays);
      setLessons(result);
      setConfig(cfg);
      setMessages([]);
    } catch (err) {
      // Surface the scheduler's month-capacity error in the same message area.
      setMessages([err instanceof Error ? err.message : String(err)]);
      setLessons(null);
      setConfig(null);
    }
  };

  const handleLoadDemo = () => {
    setForm(DEMO_FORM);
    resetResults();
  };

  const handleClear = () => {
    setForm(EMPTY_FORM);
    resetResults();
  };

  const handleImportErpnext = async () => {
    setBusy(true);
    setBanner(null);
    const result = await importFromErpnext(settings);
    if (result.ok && result.data) {
      setForm(result.data);
      setLessons(null);
      setConfig(null);
      setMessages([]);
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
    setBusy(true);
    setBanner(null);
    const result = await exportToGoogleSheets(
      lessons,
      config,
      settings.googleClientId,
    );
    if (result.ok && result.url) window.open(result.url, '_blank', 'noopener');
    setBanner({ ok: result.ok, message: result.message });
    setBusy(false);
  };

  const perMonthDisabled = form.mode !== 'permonth';
  const hasLessons = !!lessons && lessons.length > 0;

  return (
    <div className="layout">
      {/* ---------------- Left: setup + holidays ---------------- */}
      <section className="panel">
        <div className="setup-head">
          <h2>Setup</h2>
          <div className="setup-actions">
            <button
              type="button"
              className="btn btn--demo"
              onClick={handleImportErpnext}
              disabled={busy}
            >
              Import from ERPNext
            </button>
            <button
              type="button"
              className="btn btn--demo"
              onClick={handleLoadDemo}
            >
              Load demo data
            </button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="courseName">Course name</label>
          <input
            id="courseName"
            value={form.courseName}
            onChange={(e) => set('courseName')(e.target.value)}
            placeholder="e.g. Foundations of Data Science"
          />
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="classGroup">Class group</label>
            <input
              id="classGroup"
              value={form.classGroup}
              onChange={(e) => set('classGroup')(e.target.value)}
              placeholder="e.g. DS-2026A"
            />
          </div>
          <div className="field">
            <label htmlFor="teacher">{TEACHER_LABEL}</label>
            <input
              id="teacher"
              value={form.teacher}
              onChange={(e) => set('teacher')(e.target.value)}
              placeholder="e.g. Ms Tan"
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="classroom">Classroom</label>
          <input
            id="classroom"
            value={form.classroom}
            onChange={(e) => set('classroom')(e.target.value)}
            placeholder="e.g. Room 3-01"
          />
        </div>

        <div className="field">
          <label htmlFor="lessonNames">Lesson names (one per line)</label>
          <textarea
            id="lessonNames"
            rows={4}
            value={form.lessonNamesRaw}
            onChange={(e) => set('lessonNamesRaw')(e.target.value)}
            placeholder={'Introduction\nData Types\nControl Flow'}
          />
        </div>

        <div className="grid-2">
          <div className="field">
            <label htmlFor="totalLessons">Total lessons</label>
            <input
              id="totalLessons"
              type="number"
              min={1}
              value={form.totalLessons}
              onChange={(e) => set('totalLessons')(e.target.value)}
              placeholder="e.g. 20"
            />
          </div>
          <div className="field">
            <label htmlFor="lessonsPerMonth">Lessons per month</label>
            <input
              id="lessonsPerMonth"
              type="number"
              min={1}
              value={form.lessonsPerMonth}
              onChange={(e) => set('lessonsPerMonth')(e.target.value)}
              disabled={perMonthDisabled}
              placeholder={perMonthDisabled ? 'Per month mode only' : 'e.g. 8'}
            />
          </div>
        </div>

        <div className="field">
          <label>Scheduling mode</label>
          <div className="segmented" role="group" aria-label="Scheduling mode">
            <button
              type="button"
              className={form.mode === 'weekday' ? 'active' : ''}
              aria-pressed={form.mode === 'weekday'}
              onClick={() => setMode('weekday')}
            >
              Every weekday
            </button>
            <button
              type="button"
              className={form.mode === 'permonth' ? 'active' : ''}
              aria-pressed={form.mode === 'permonth'}
              onClick={() => setMode('permonth')}
            >
              Per month
            </button>
          </div>
        </div>

        <div className="grid-3">
          <div className="field">
            <label htmlFor="startDate">Start date</label>
            <input
              id="startDate"
              type="date"
              value={form.startDate}
              onChange={(e) => set('startDate')(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="startTime">Start time</label>
            <input
              id="startTime"
              type="time"
              value={form.startTime}
              onChange={(e) => set('startTime')(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="endTime">End time</label>
            <input
              id="endTime"
              type="time"
              value={form.endTime}
              onChange={(e) => set('endTime')(e.target.value)}
            />
          </div>
        </div>

        <h2 className="panel__subhead">Holidays</h2>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="uccHolidays">
              UCC school holidays (one per line)
            </label>
            <textarea
              id="uccHolidays"
              rows={4}
              value={form.uccHolidaysRaw}
              onChange={(e) => set('uccHolidaysRaw')(e.target.value)}
              placeholder={'2026-09-01\n2026-09-02'}
            />
          </div>
          <div className="field">
            <label htmlFor="publicHolidays">
              Singapore public holidays (one per line)
            </label>
            <textarea
              id="publicHolidays"
              rows={4}
              value={form.publicHolidaysRaw}
              onChange={(e) => set('publicHolidaysRaw')(e.target.value)}
              placeholder={'2026-08-09\n2026-12-25'}
            />
          </div>
        </div>

        <div className="actions">
          <button className="btn btn--primary" onClick={handleGenerate}>
            Generate timetable
          </button>
          <button className="btn" onClick={handleClear}>
            Clear
          </button>
        </div>
      </section>

      {/* ---------------- Right: preview + exports ---------------- */}
      <section className="panel">
        <div className="preview-head">
          <h2>Preview</h2>
          <div className="exports">
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
              onClick={() => guardedExport(() => exportPdf(lessons!, config!))}
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
          <div className="segmented view-switch" role="group" aria-label="View">
            {(['list', 'agenda', 'month'] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                className={view === v ? 'active' : ''}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {v === 'list' ? 'List' : v === 'agenda' ? 'Agenda' : 'Month'}
              </button>
            ))}
          </div>
        )}

        {hasLessons ? (
          view === 'list' ? (
            <ListView lessons={lessons!} courseName={config!.courseName} />
          ) : view === 'agenda' ? (
            <AgendaView lessons={lessons!} courseName={config!.courseName} />
          ) : (
            <MonthView
              lessons={lessons!}
              firstDayOfWeek={settings.firstDayOfWeek}
              courseName={config!.courseName}
            />
          )
        ) : (
          !messages.length && (
            <p className="empty">
              No timetable yet. Fill in the setup and click{' '}
              <strong>Generate timetable</strong>.
            </p>
          )
        )}
      </section>
    </div>
  );
}
