import type { ScheduledLesson } from '../types';
import { formatDisplayDate } from '../shared/dates';

/** Fields of a generated entry the user may manually amend. */
export type AmendableField =
  | 'date'
  | 'moduleName'
  | 'lessonName'
  | 'activity'
  | 'startTime'
  | 'endTime'
  | 'teacher'
  | 'classroom';

interface Props {
  lessons: ScheduledLesson[];
  /** A lesson is identified by its (moduleId, lessonNo) — stable across edits. */
  onEdit: (
    moduleId: string,
    lessonNo: number,
    field: AmendableField,
    value: string,
  ) => void;
}

/**
 * Editable timetable: every generated entry is amendable in place (date, times,
 * teacher, classroom, module, lesson, activity). Edits update the timetable
 * immediately and re-run conflict detection, so a manual change that makes two
 * different modules share a teacher + classroom + overlapping time on the same
 * date is highlighted here (and in every other view). Row order is kept stable
 * while editing so a date change never makes the row you're typing in jump.
 */
export function AmendView({ lessons, onEdit }: Props) {
  const rows = lessons.filter((l) => l.kind === 'lesson');

  const cell = (
    l: ScheduledLesson,
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
        onChange={(e) => onEdit(l.moduleId, l.lessonNo, field, e.target.value)}
      />
      {type === 'date' && l.date && (
        <span className="amend__date">{formatDisplayDate(l.date)}</span>
      )}
    </td>
  );

  return (
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
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr
              key={`${l.moduleId}#${l.lessonNo}`}
              className={l.conflicts?.length ? 'row--conflict' : ''}
            >
              {cell(l, 'date', 'date', 'Lesson date')}
              {cell(l, 'moduleName', 'text', 'Module name')}
              {cell(l, 'lessonName', 'text', 'Lesson name')}
              {cell(l, 'activity', 'text', 'Activity')}
              {cell(l, 'startTime', 'time', 'Start time')}
              {cell(l, 'endTime', 'time', 'End time')}
              {cell(l, 'teacher', 'text', 'Teacher')}
              {cell(l, 'classroom', 'text', 'Classroom')}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
