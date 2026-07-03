import type { ScheduledLesson } from '../types';
import { COLUMN_HEADERS } from '../exports';
import { formatDisplayDate } from '../dateUtils';
import { calendarLinkFor } from '../googleCalendar';

interface Props {
  lessons: ScheduledLesson[];
  courseName: string;
}

/** The classic table, dates shown as DD MMMM YYYY, plus a per-row GCal link. */
export function ListView({ lessons, courseName }: Props) {
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
          {lessons.map((l) => (
            <tr key={l.lessonNo}>
              <td>{l.lessonNo}</td>
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
                <a
                  className="cal-link"
                  href={calendarLinkFor(l, courseName)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Add
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
