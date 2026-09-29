import type { ScheduledLesson } from '../types';
import type { AmendableField } from '../amendModel';
import { formatDisplayDate } from '../shared/dates';
import { AL_LABEL } from '../constants';

interface Props {
  lessons: ScheduledLesson[];
  /**
   * An entry is identified by its INDEX in `lessons`, not by
   * (moduleId, lessonNo) — every AL day of a module shares `lessonNo: 0`, so
   * that pair addresses all of them at once. See amendModel.
   */
  onEdit: (index: number, field: AmendableField, value: string) => void;
  /** Append a blank extra session, prefilled and ready to edit in place. */
  onAdd: () => void;
  /** Remove a hand-added or generated session outright. */
  onRemove: (index: number) => void;
}

/**
 * Editable timetable: every generated entry is amendable in place (date, times,
 * teacher, classroom, module, lesson, activity). Edits update the timetable
 * immediately and re-run conflict detection, so a manual change that makes two
 * different modules share a teacher + classroom + overlapping time on the same
 * date is highlighted here (and in every other view). Row order is kept stable
 * while editing so a date change never makes the row you're typing in jump.
 *
 * "Add session" exists because the generator only ever places a module's own
 * lessons across its own window: pinning one extra session to a date that
 * already has one (an afternoon workshop on a morning module's day) is a manual
 * act, not something a delivery mode can express.
 *
 * AL buffer days are listed here TOO, not just real lessons. They used to be
 * filtered out, which left them frozen on the dates the generator first chose:
 * moving a lesson off a date did not free the AL day sitting on the date it
 * moved to, and no screen offered any way to move it. An AL day is a row like
 * any other, so it can be shifted onto the date the lesson vacated, or removed.
 */
export function AmendView({ lessons, onEdit, onAdd, onRemove }: Props) {
  const cell = (
    l: ScheduledLesson,
    index: number,
    field: AmendableField,
    type: 'text' | 'date' | 'time',
    ariaLabel: string,
  ) => (
    <td>
      <input
        className="rv-input amend__input"
        type={type}
        value={(l[field as keyof ScheduledLesson] as string) ?? ''}
        aria-label={ariaLabel}
        onChange={(e) => onEdit(index, field, e.target.value)}
      />
      {type === 'date' && l.date && (
        <span className="amend__date">{formatDisplayDate(l.date)}</span>
      )}
    </td>
  );

  return (
    <>
      <div className="table-wrap">
        <table className="rv-table amend-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Module</th>
              <th>Lesson</th>
              <th>Activity</th>
              <th>Start</th>
              <th>End</th>
              <th>Teacher</th>
              <th>Classroom</th>
              <th aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {lessons.map((l, index) => {
              const al = l.kind === 'AL';
              const what = al ? `${AL_LABEL} day` : 'session';
              return (
                <tr
                  // Index, deliberately: (moduleId, lessonNo) is not unique
                  // across AL days, and the date is what the user is editing,
                  // so keying on it would remount the input mid-keystroke.
                  key={index}
                  className={
                    l.conflicts?.length
                      ? 'row--conflict'
                      : al
                        ? 'row--al'
                        : ''
                  }
                >
                  {cell(l, index, 'date', 'date', 'Lesson date')}
                  {cell(l, index, 'moduleName', 'text', 'Module name')}
                  {cell(l, index, 'lessonName', 'text', 'Lesson name')}
                  {cell(l, index, 'activity', 'text', 'Activity')}
                  {cell(l, index, 'startTime', 'time', 'Start time')}
                  {cell(l, index, 'endTime', 'time', 'End time')}
                  {cell(l, index, 'teacher', 'text', 'Teacher')}
                  {cell(l, index, 'classroom', 'text', 'Classroom')}
                  <td>
                    <button
                      type="button"
                      className="btn amend__remove"
                      aria-label={`Remove ${what} on ${l.date}`}
                      title={`Remove this ${what}`}
                      onClick={() => onRemove(index)}
                    >
                      –
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn btn--demo" onClick={onAdd}>
        + Add session
      </button>
      <p className="hint">
        Adds an extra session you can pin to any date, including one that already
        has a lesson. Set its own times so it does not overlap. {AL_LABEL} buffer
        days are listed here too (shown greyed) — change an {AL_LABEL} row&rsquo;s
        date to move it onto a day a lesson has left, or remove it outright.
      </p>
    </>
  );
}
