import { Fragment } from 'react';
import type { PlannerModel, PlannerCell } from '../planner';
import { activityText, dateText, teacherLines } from '../planner';

interface Props {
  model: PlannerModel;
}

/** CSS modifier for the activity cell's colour by kind (conflict wins). */
const activityClass = (cell: PlannerCell): string => {
  if (cell.conflict) return 'act act--conflict';
  switch (cell.kind) {
    case 'teaching':
      return 'act act--teaching';
    case 'al':
      return 'act act--al';
    case 'weekend':
      return 'act act--weekend';
    case 'schoolHoliday':
      return 'act act--school';
    case 'publicHoliday':
      return 'act act--public';
    default:
      return 'act';
  }
};

/** The UCC ULEC course-planner matrix: month blocks of weekday × week cells. */
export function HybridView({ model }: Props) {
  return (
    <div className="planner">
      <div className="planner__band">
        <div>
          <span className="planner__key">{model.scopeLabel}:</span>{' '}
          {model.course}
        </div>
        <div>
          <span className="planner__key">Timing:</span> {model.timing}
        </div>
        <div>
          <span className="planner__key">Updated:</span> {model.updatedDisplay}
        </div>
      </div>

      {model.months.map((m) => (
        <div className="planner__month table-wrap" key={`${m.year}-${m.month}`}>
          <table className="planner__table">
            <thead>
              <tr>
                <th className="planner__corner" colSpan={2} rowSpan={2}>
                  {m.monthName} {m.year}
                </th>
                {Array.from({ length: m.weeks }, (_, w) => (
                  <th className="planner__weekhead" colSpan={3} key={w}>
                    Week {w + 1}
                  </th>
                ))}
              </tr>
              <tr>
                {Array.from({ length: m.weeks }, (_, w) => (
                  <Fragment key={w}>
                    <th>Date</th>
                    <th>Activity</th>
                    <th>Teacher</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {m.grid.map((rowCells, r) => (
                <tr key={r}>
                  {r === 0 && (
                    <td className="planner__monthlabel" rowSpan={7}>
                      {m.monthName}
                    </td>
                  )}
                  <td className="planner__weekday">{model.weekdayLabels[r]}</td>
                  {rowCells.map((cell, w) => {
                    const lines = teacherLines(cell);
                    return (
                      <Fragment key={w}>
                        <td className="planner__date">{dateText(cell)}</td>
                        <td className={activityClass(cell)}>
                          {cell.conflict ? '⚠ ' : ''}
                          {activityText(cell)}
                        </td>
                        <td className="planner__teacher">
                          {lines.map((ln, i) => (
                            <div key={i}>{ln}</div>
                          ))}
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
