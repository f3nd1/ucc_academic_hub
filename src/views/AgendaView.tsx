import type { ScheduledLesson } from '../types';
import { formatDisplayDate, dayNameFromIso } from '../dateUtils';
import { calendarLinkFor } from '../googleCalendar';

interface Props {
  lessons: ScheduledLesson[];
  courseName: string;
}

/** Lessons grouped by date, each group headed by the display date + weekday. */
export function AgendaView({ lessons, courseName }: Props) {
  // Group by ISO date, preserving chronological order (lessons already sorted).
  const groups: { date: string; items: ScheduledLesson[] }[] = [];
  for (const l of lessons) {
    let g = groups[groups.length - 1];
    if (!g || g.date !== l.date) {
      g = { date: l.date, items: [] };
      groups.push(g);
    }
    g.items.push(l);
  }

  return (
    <div className="agenda">
      {groups.map((g) => (
        <div className="agenda__group" key={g.date}>
          <div className="agenda__date">
            {formatDisplayDate(g.date)}
            <span className="agenda__weekday">{dayNameFromIso(g.date)}</span>
          </div>
          <ul className="agenda__items">
            {g.items.map((l) => (
              <li className="agenda__item" key={l.lessonNo}>
                <span className="agenda__time">
                  {l.startTime}–{l.endTime}
                </span>
                <span className="agenda__body">
                  <strong>{l.lessonName}</strong>
                  <span className="agenda__meta">
                    {l.teacher} · {l.classroom} · {l.classGroup}
                  </span>
                </span>
                <a
                  className="cal-link"
                  href={calendarLinkFor(l, courseName)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Add to Google Calendar
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
