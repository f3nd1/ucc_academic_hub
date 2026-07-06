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
  sortModuleRows,
  type CourseReview,
  type DeliveryMode,
  type ModuleReview,
  type ModuleSort,
  type ModuleSortField,
} from './reviewModel';
import { loadReviewData, saveReviewData } from './reviewStore';
import {
  exportReviewCsv,
  exportReviewExcel,
  exportReviewPdf,
} from './reviewExports';

/**
 * Read-only computed date cell: a single DD MMMM YYYY value (or a muted dash),
 * with an optional "auto-calculated" note. Never renders an editable input, so
 * a derived date is shown once — not as a raw date input plus a caption.
 */
function ComputedDate({
  value,
  title,
  auto,
}: {
  value: string;
  title: string;
  auto?: boolean;
}) {
  return (
    <div className="rv-computed" title={title}>
      <span className="rv-computed__val">
        {value ? formatDisplayDate(value) : <span className="rv-computed__blank">—</span>}
      </span>
      {auto && <span className="rv-computed__auto">auto-calculated</span>}
    </div>
  );
}

/** Editable native date input — a single control, no formatted caption below. */
function DateInput({
  value,
  onChange,
  invalid,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  invalid?: boolean;
  label: string;
}) {
  return (
    <input
      type="date"
      className={`rv-input${invalid ? ' input--invalid' : ''}`}
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/** A sortable Module Review column header (click to sort / toggle direction). */
function SortHeader({
  field,
  label,
  sort,
  onSort,
}: {
  field: ModuleSortField;
  label: string;
  sort: ModuleSort | null;
  onSort: (field: ModuleSortField) => void;
}) {
  const active = sort?.field === field;
  const arrow = active ? (sort!.dir === 'asc' ? '▲' : '▼') : '↕';
  return (
    <th>
      <button
        type="button"
        className={`rv-sort${active ? ' rv-sort--active' : ''}`}
        onClick={() => onSort(field)}
        aria-label={`Sort by ${label}${
          active ? (sort!.dir === 'asc' ? ', ascending' : ', descending') : ''
        }`}
      >
        {label}
        <span className="rv-sort__arrow" aria-hidden="true">
          {arrow}
        </span>
      </button>
    </th>
  );
}

export function ReviewPlannerPage() {
  const initial = useMemo(loadReviewData, []);
  const [modules, setModules] = useState<ModuleReview[]>(initial.modules);
  const [courses, setCourses] = useState<CourseReview[]>(initial.courses);
  const [banner, setBanner] = useState<string | null>(null);
  const [sort, setSort] = useState<ModuleSort | null>(null);

  // Persist to the tool's namespaced localStorage slice on every change.
  useEffect(() => {
    saveReviewData({ modules, courses });
  }, [modules, courses]);

  // Course calculations recompute live whenever any module or course changes.
  const courseComputed = useMemo(
    () => courses.map((c) => computeCourse(c, modules)),
    [courses, modules],
  );

  // Sorting is a display-only view over the source rows — the stored order and
  // row identity are untouched, so edit/delete by id keep working.
  const displayModules = useMemo(
    () => sortModuleRows(modules, sort),
    [modules, sort],
  );

  const onSort = (field: ModuleSortField) =>
    setSort((prev) =>
      prev && prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: 'asc' },
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
          <Hint text="Module Review Date is the Actual Start Date plus one month for Series delivery, or plus three months for Parallel — clamped to the month's last day when the next month is shorter. Click a column header to sort." />
        </div>
        <div className="table-wrap">
          <table className="rv-table">
            <thead>
              <tr>
                <SortHeader field="courseName" label="Course name" sort={sort} onSort={onSort} />
                <SortHeader field="moduleName" label="Module name" sort={sort} onSort={onSort} />
                <SortHeader field="plannedStartDate" label="Planned start" sort={sort} onSort={onSort} />
                <SortHeader field="actualStartDate" label="Actual start" sort={sort} onSort={onSort} />
                <th>Delivery mode</th>
                <th>Module Review Date</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {displayModules.length === 0 && (
                <tr>
                  <td colSpan={7} className="rv-empty">
                    No modules yet. Add one to start.
                  </td>
                </tr>
              )}
              {displayModules.map((m) => {
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
                        <DateInput
                          label="Planned start date"
                          value={m.plannedStartDate}
                          invalid={inv.plannedStartDate}
                          onChange={(v) =>
                            updateModule(m.id, { plannedStartDate: v })
                          }
                        />
                      </td>
                      <td>
                        <DateInput
                          label="Actual start date"
                          value={m.actualStartDate}
                          invalid={inv.actualStartDate}
                          onChange={(v) =>
                            updateModule(m.id, { actualStartDate: v })
                          }
                        />
                      </td>
                      <td>
                        <select
                          className="rv-input"
                          value={m.deliveryMode}
                          aria-label="Delivery mode"
                          onChange={(e) =>
                            updateModule(m.id, {
                              deliveryMode: e.target.value as DeliveryMode,
                            })
                          }
                        >
                          <option value="Series">Series</option>
                          <option value="Parallel">Parallel</option>
                        </select>
                      </td>
                      <td>
                        <ComputedDate
                          value={moduleReviewDate(m)}
                          title={
                            m.deliveryMode === 'Parallel'
                              ? 'Actual Start Date + 3 months (Parallel)'
                              : 'Actual Start Date + 1 month (Series)'
                          }
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
        <button type="button" className="btn rvp__add" onClick={addModule}>
          + Add module
        </button>
      </section>

      {/* ----------------------- Course Review ----------------------- */}
      <section className="panel rvp__section">
        <div className="rvp__section-head">
          <h2>Course Review</h2>
          <Hint text="Planned Start, Actual Start and Per Cycle Review Date roll up from modules with the same course name (earliest start, and latest module review for Per Cycle). With no matching modules they fall back to manual entry. Scheduled Review Date is Per Cycle plus 2 years." />
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
                const { plannedStart, actualStart, perCycle, scheduled } =
                  courseComputed[i];
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
                      {/* Planned / Actual / Per Cycle: auto-rolled-up from
                          matching modules (read-only), else manual entry. */}
                      <td>
                        {plannedStart.hasMatchingModules ? (
                          <ComputedDate
                            value={plannedStart.date}
                            title="Earliest Planned Start among matching modules"
                            auto
                          />
                        ) : (
                          <DateInput
                            label="Planned start date"
                            value={c.plannedStartDate}
                            invalid={inv.plannedStartDate}
                            onChange={(v) =>
                              updateCourse(c.id, { plannedStartDate: v })
                            }
                          />
                        )}
                      </td>
                      <td>
                        {actualStart.hasMatchingModules ? (
                          <ComputedDate
                            value={actualStart.date}
                            title="Earliest Actual Start among matching modules"
                            auto
                          />
                        ) : (
                          <DateInput
                            label="Actual start date"
                            value={c.actualStartDate}
                            invalid={inv.actualStartDate}
                            onChange={(v) =>
                              updateCourse(c.id, { actualStartDate: v })
                            }
                          />
                        )}
                      </td>
                      <td>
                        {perCycle.hasMatchingModules ? (
                          <ComputedDate
                            value={perCycle.date}
                            title="Latest Module Review Date among matching modules"
                            auto
                          />
                        ) : (
                          <DateInput
                            label="Per Cycle Review Date"
                            value={c.manualPerCycleReviewDate}
                            invalid={inv.manualPerCycleReviewDate}
                            onChange={(v) =>
                              updateCourse(c.id, {
                                manualPerCycleReviewDate: v,
                              })
                            }
                          />
                        )}
                      </td>
                      <td>
                        <ComputedDate
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
