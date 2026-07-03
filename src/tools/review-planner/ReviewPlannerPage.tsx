import { Fragment, useEffect, useMemo, useState } from 'react';
import { formatDisplayDate } from '../../shared/dates';
import { Hint } from '../../shared/help/Hint';
import {
  computeCourse,
  courseFieldInvalid,
  courseReviewErrors,
  emptyCourseReview,
  emptyModuleReview,
  moduleFieldInvalid,
  moduleReviewDate,
  moduleReviewErrors,
  type CourseReview,
  type ModuleReview,
} from './reviewModel';
import { loadReviewData, saveReviewData } from './reviewStore';
import {
  exportReviewCsv,
  exportReviewExcel,
  exportReviewPdf,
} from './reviewExports';

/** Read-only computed date cell: DD MMMM YYYY, or a muted dash when blank. */
function Computed({ value, title }: { value: string; title: string }) {
  return (
    <div className="rv-computed" title={title}>
      {value ? (
        formatDisplayDate(value)
      ) : (
        <span className="rv-computed__blank">—</span>
      )}
    </div>
  );
}

/** Editable date input with a DD MMMM YYYY caption beneath it. */
function DateField({
  value,
  onChange,
  invalid,
  disabled,
  label,
  autoNote,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  label: string;
  autoNote?: boolean;
}) {
  return (
    <div className="rv-datecell">
      <input
        type="date"
        className={`rv-input${invalid ? ' input--invalid' : ''}`}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="rv-datecell__display">
        {value ? formatDisplayDate(value) : '—'}
        {autoNote && <em className="rv-auto"> · auto-calculated</em>}
      </span>
    </div>
  );
}

export function ReviewPlannerPage() {
  const initial = useMemo(loadReviewData, []);
  const [modules, setModules] = useState<ModuleReview[]>(initial.modules);
  const [courses, setCourses] = useState<CourseReview[]>(initial.courses);
  const [banner, setBanner] = useState<string | null>(null);

  // Persist to the tool's namespaced localStorage slice on every change.
  useEffect(() => {
    saveReviewData({ modules, courses });
  }, [modules, courses]);

  // Course calculations recompute live whenever any module or course changes.
  const courseComputed = useMemo(
    () => courses.map((c) => computeCourse(c, modules)),
    [courses, modules],
  );

  // --- Module row handlers ---
  const addModule = () => setModules((rows) => [...rows, emptyModuleReview()]);
  const updateModule = (id: string, patch: Partial<ModuleReview>) =>
    setModules((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  const removeModule = (id: string) =>
    setModules((rows) => rows.filter((r) => r.id !== id));

  // --- Course row handlers ---
  const addCourse = () => setCourses((rows) => [...rows, emptyCourseReview()]);
  const updateCourse = (id: string, patch: Partial<CourseReview>) =>
    setCourses((rows) =>
      rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    );
  const removeCourse = (id: string) =>
    setCourses((rows) => rows.filter((r) => r.id !== id));

  const runExport = (fn: typeof exportReviewPdf) =>
    setBanner(fn({ modules, courses }).message);

  return (
    <div className="review-planner">
      <header className="rvp__head">
        <div>
          <h1>Module &amp; Course Review</h1>
          <p className="rvp__sub">
            Track planned vs actual start dates and let the review dates
            calculate themselves. All dates show as DD MMMM YYYY.
          </p>
        </div>
        <div className="exports">
          <button className="btn" onClick={() => runExport(exportReviewPdf)}>
            PDF
          </button>
          <button className="btn" onClick={() => runExport(exportReviewExcel)}>
            Excel
          </button>
          <button className="btn" onClick={() => runExport(exportReviewCsv)}>
            CSV
          </button>
        </div>
      </header>

      {banner && (
        <div className="banner banner--warn" role="status">
          {banner}
        </div>
      )}

      {/* ----------------------- Module Review ----------------------- */}
      <section className="panel rvp__section">
        <div className="rvp__section-head">
          <h2>Module Review</h2>
          <Hint text="Module Review Date is the Actual Start Date plus one month, clamped to the month's last day when the next month is shorter." />
        </div>
        <div className="table-wrap">
          <table className="rv-table">
            <thead>
              <tr>
                <th>Course name</th>
                <th>Module name</th>
                <th>Planned start</th>
                <th>Actual start</th>
                <th>Module Review Date</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {modules.length === 0 && (
                <tr>
                  <td colSpan={6} className="rv-empty">
                    No modules yet. Add one to start.
                  </td>
                </tr>
              )}
              {modules.map((m) => {
                const inv = moduleFieldInvalid(m);
                const errs = moduleReviewErrors(m);
                return (
                  <Fragment key={m.id}>
                    <tr>
                      <td>
                        <input
                          className={`rv-input${inv.courseName ? ' input--invalid' : ''}`}
                          value={m.courseName}
                          aria-label="Course name"
                          placeholder="Course name"
                          onChange={(e) =>
                            updateModule(m.id, { courseName: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className={`rv-input${inv.moduleName ? ' input--invalid' : ''}`}
                          value={m.moduleName}
                          aria-label="Module name"
                          placeholder="Module name"
                          onChange={(e) =>
                            updateModule(m.id, { moduleName: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <DateField
                          label="Planned start date"
                          value={m.plannedStartDate}
                          invalid={inv.plannedStartDate}
                          onChange={(v) =>
                            updateModule(m.id, { plannedStartDate: v })
                          }
                        />
                      </td>
                      <td>
                        <DateField
                          label="Actual start date"
                          value={m.actualStartDate}
                          invalid={inv.actualStartDate}
                          onChange={(v) =>
                            updateModule(m.id, { actualStartDate: v })
                          }
                        />
                      </td>
                      <td>
                        <Computed
                          value={moduleReviewDate(m)}
                          title="Actual Start Date + 1 month"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="rv-del"
                          aria-label="Delete module row"
                          onClick={() => removeModule(m.id)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                    {errs.length > 0 && (
                      <tr className="rv-errrow">
                        <td colSpan={6}>
                          <ul>
                            {errs.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn rvp__add" onClick={addModule}>
          + Add module
        </button>
      </section>

      {/* ----------------------- Course Review ----------------------- */}
      <section className="panel rvp__section">
        <div className="rvp__section-head">
          <h2>Course Review</h2>
          <Hint text="Per Cycle Review Date is the latest Module Review Date across modules with the same course name; with no matching modules, enter it manually. Scheduled Review Date is Per Cycle plus 2 years." />
        </div>
        <div className="table-wrap">
          <table className="rv-table">
            <thead>
              <tr>
                <th>Course name</th>
                <th>No. of modules</th>
                <th>Planned start</th>
                <th>Actual start</th>
                <th>Per Cycle Review Date</th>
                <th>Scheduled Review Date</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {courses.length === 0 && (
                <tr>
                  <td colSpan={7} className="rv-empty">
                    No courses yet. Add one to start.
                  </td>
                </tr>
              )}
              {courses.map((c, i) => {
                const inv = courseFieldInvalid(c);
                const errs = courseReviewErrors(c);
                const { perCycle, scheduled } = courseComputed[i];
                const perCycleValue = perCycle.auto
                  ? perCycle.date
                  : c.manualPerCycleReviewDate;
                return (
                  <Fragment key={c.id}>
                    <tr>
                      <td>
                        <input
                          className={`rv-input${inv.courseName ? ' input--invalid' : ''}`}
                          value={c.courseName}
                          aria-label="Course name"
                          placeholder="Course name"
                          onChange={(e) =>
                            updateCourse(c.id, { courseName: e.target.value })
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          className={`rv-input rv-input--num${inv.numberOfModules ? ' input--invalid' : ''}`}
                          value={c.numberOfModules}
                          aria-label="Number of modules"
                          placeholder="0"
                          onChange={(e) =>
                            updateCourse(c.id, {
                              numberOfModules: e.target.value,
                            })
                          }
                        />
                      </td>
                      <td>
                        <DateField
                          label="Planned start date"
                          value={c.plannedStartDate}
                          invalid={inv.plannedStartDate}
                          onChange={(v) =>
                            updateCourse(c.id, { plannedStartDate: v })
                          }
                        />
                      </td>
                      <td>
                        <DateField
                          label="Actual start date"
                          value={c.actualStartDate}
                          invalid={inv.actualStartDate}
                          onChange={(v) =>
                            updateCourse(c.id, { actualStartDate: v })
                          }
                        />
                      </td>
                      <td>
                        {/* Disabled + auto-filled when matching modules exist;
                            manual entry otherwise. */}
                        <DateField
                          label="Per Cycle Review Date"
                          value={perCycleValue}
                          disabled={perCycle.hasMatchingModules}
                          invalid={
                            !perCycle.hasMatchingModules &&
                            inv.manualPerCycleReviewDate
                          }
                          autoNote={perCycle.hasMatchingModules}
                          onChange={(v) =>
                            updateCourse(c.id, { manualPerCycleReviewDate: v })
                          }
                        />
                      </td>
                      <td>
                        <Computed
                          value={scheduled}
                          title="Per Cycle Review Date + 2 years"
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="rv-del"
                          aria-label="Delete course row"
                          onClick={() => removeCourse(c.id)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                    {errs.length > 0 && (
                      <tr className="rv-errrow">
                        <td colSpan={7}>
                          <ul>
                            {errs.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <button type="button" className="btn rvp__add" onClick={addCourse}>
          + Add course
        </button>
      </section>
    </div>
  );
}

export default ReviewPlannerPage;
