import { useMemo } from 'react';
import type { ScheduledLesson } from '../types';
import { COLUMN_HEADERS } from '../exports';
import { formatDisplayDate } from '../shared/dates';
import { calendarLinkFor } from '../googleCalendar';

interface Props {
  lessons: ScheduledLesson[];
  courseName: string;
}

/**
 * The classic table: dates as DD MMMM YYYY, Module column, AL buffer rows
 * muted, conflicted lessons highlighted, per-lesson GCal link.
 *
 * Rows are sorted by date then start time on the way in, so a date carrying
 * more than one session (a morning module and an afternoon one) lists them in
 * chronological order even after an Amend edit has left the stored array
 * unsorted.
 */
export function ListView({ lessons, courseName }: Props) {
  const rows = useMemo(
    () =>
      [...lessons].sort(
        (a, b) =>
          a.date.localeCompare(b.date) ||
          a.startTime.localeCompare(b.startTime) ||
          a.moduleName.localeCompare(b.moduleName),
      ),
    [lessons],
  );

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {COLUMN_HEADERS.map((h) => (
              <th key={h}>{h}</th>
            ))}
            <th>Calendar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l, i) => {
            const conflicted = (l.conflicts?.length ?? 0) > 0;
            const rowClass =
              l.kind === 'AL'
                ? 'row--al'
                : conflicted
                  ? 'row--conflict'
                  : undefined;
            return (
              <tr
                key={`${l.moduleId}-${l.kind}-${l.date}-${i}`}
                className={rowClass}
                title={
                  conflicted
                    ? l.conflicts!.map((c) => c.detail).join('\n')
                    : undefined
                }
              >
                <td>{l.kind === 'AL' ? '' : l.lessonNo}</td>
                <td>
                  {conflicted && (
                    <span className="conflict-icon" aria-label="Conflict">
                      ⚠{' '}
                    </span>
                  )}
                  {l.moduleName}
                </td>
                <td>{l.lessonName}</td>
                <td>{l.activity ?? ''}</td>
                <td>{formatDisplayDate(l.date)}</td>
                <td>{l.day}</td>
                <td>{l.startTime}</td>
                <td>{l.endTime}</td>
                <td>{l.teacher}</td>
                <td>{l.classroom}</td>
                <td>{l.classGroup}</td>
                <td>
                  {l.kind === 'lesson' && (
                    <a
                      className="cal-link"
                      href={calendarLinkFor(l, courseName)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Add
                    </a>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
