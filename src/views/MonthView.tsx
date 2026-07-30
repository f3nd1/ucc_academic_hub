import { useEffect, useMemo, useState } from 'react';
import type { ScheduledLesson } from '../types';
import type { FirstDayOfWeek } from '../shared/settings';
import {
  formatDate,
  parseLocal,
  DAY_NAMES_SHORT,
  MONTH_NAMES,
} from '../shared/dates';
import { calendarLinkFor } from '../googleCalendar';

interface Props {
  lessons: ScheduledLesson[];
  firstDayOfWeek: FirstDayOfWeek;
  courseName: string;
}

interface Cell {
  date: Date;
  iso: string;
  inMonth: boolean;
  lessons: ScheduledLesson[];
}

/** Standard month calendar: 7 columns × 6 rows, first-day-of-week aware. */
export function MonthView({ lessons, firstDayOfWeek, courseName }: Props) {
  const startOffset = firstDayOfWeek === 'monday' ? 1 : 0;

  // Lessons indexed by ISO date. A date can hold several sessions (a morning
  // and an afternoon module, say), so each day's entries are ordered by start
  // time to read top-to-bottom chronologically in the cell.
  const byDate = useMemo(() => {
    const m = new Map<string, ScheduledLesson[]>();
    for (const l of lessons) {
      const arr = m.get(l.date);
      if (arr) arr.push(l);
      else m.set(l.date, [l]);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
    }
    return m;
  }, [lessons]);

  // Visible month, initialised (and re-synced) to the earliest lesson's month.
  // Found by scan rather than lessons[0]: an Amend edit or a hand-added session
  // leaves the list unsorted, and the view would then open on the wrong month.
  const firstLessonMonth = useMemo(() => {
    if (lessons.length === 0) return null;
    let earliest = lessons[0].date;
    for (const l of lessons) if (l.date < earliest) earliest = l.date;
    const d = parseLocal(earliest);
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [lessons]);

  // Every month that contains lessons, with counts — so the user can see and
  // jump to scheduled months instead of paging blind through empty ones.
  const populatedMonths = useMemo(() => {
    const counts = new Map<string, number>();
    for (const l of lessons) {
      const key = l.date.slice(0, 7); // YYYY-MM
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()].sort().map(([key, count]) => {
      const [y, m] = key.split('-').map(Number);
      return { year: y, month: m - 1, count };
    });
  }, [lessons]);

  const [view, setView] = useState(
    () => firstLessonMonth ?? { year: 2026, month: 0 },
  );

  // Jump to the first scheduled lesson's month whenever a new schedule loads.
  useEffect(() => {
    if (firstLessonMonth) setView(firstLessonMonth);
  }, [firstLessonMonth]);

  const cells: Cell[] = useMemo(() => {
    const first = new Date(view.year, view.month, 1);
    const lead = (first.getDay() - startOffset + 7) % 7;
    const out: Cell[] = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(view.year, view.month, 1 - lead + i);
      const iso = formatDate(date);
      out.push({
        date,
        iso,
        inMonth: date.getMonth() === view.month,
        lessons: byDate.get(iso) ?? [],
      });
    }
    return out;
  }, [view, startOffset, byDate]);

  const headers = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => DAY_NAMES_SHORT[(startOffset + i) % 7]),
    [startOffset],
  );

  const step = (delta: number) =>
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  return (
    <div className="month">
      <div className="month__nav">
        <button className="btn" onClick={() => step(-1)}>
          ‹ Prev
        </button>
        <div className="month__title">
          {MONTH_NAMES[view.month]} {view.year}
        </div>
        <button className="btn" onClick={() => step(1)}>
          Next ›
        </button>
      </div>

      {populatedMonths.length > 0 && (
        <div className="month__chips" role="group" aria-label="Months with lessons">
          {populatedMonths.map((m) => {
            const active = m.year === view.year && m.month === view.month;
            return (
              <button
                key={`${m.year}-${m.month}`}
                type="button"
                className={`month__chip${active ? ' active' : ''}`}
                aria-pressed={active}
                onClick={() => setView({ year: m.year, month: m.month })}
              >
                {MONTH_NAMES[m.month].slice(0, 3)} {m.year}
                <span className="month__chip-count">{m.count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="month__grid">
        {headers.map((h) => (
          <div className="month__weekday" key={h}>
            {h}
          </div>
        ))}
        {cells.map((c) => (
          <div
            className={`month__cell${c.inMonth ? '' : ' month__cell--out'}`}
            key={c.iso}
          >
            <div className="month__daynum">{c.date.getDate()}</div>
            {c.lessons.map((l, i) => {
              if (l.kind === 'AL') {
                return (
                  <span
                    className="month__lesson month__lesson--al"
                    key={`al-${l.moduleId}-${i}`}
                    title={`AL buffer day · ${l.moduleName}`}
                  >
                    <span className="month__lesson-name">{l.lessonName}</span>
                    <span className="month__lesson-meta">{l.moduleName}</span>
                  </span>
                );
              }
              const conflicted = (l.conflicts?.length ?? 0) > 0;
              return (
                <a
                  className={`month__lesson${conflicted ? ' month__lesson--conflict' : ''}`}
                  key={`${l.moduleId}-${l.lessonNo}`}
                  href={calendarLinkFor(l, courseName)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={
                    (conflicted
                      ? `⚠ ${l.conflicts!.map((c) => c.detail).join('\n')}\n`
                      : '') +
                    `${l.lessonName}\n${l.startTime}–${l.endTime}\n${l.teacher} · ${l.classroom} · ${l.classGroup}`
                  }
                >
                  <span className="month__lesson-name">
                    {conflicted ? '⚠ ' : ''}
                    {l.lessonName}
                  </span>
                  <span className="month__lesson-meta">{l.moduleName}</span>
                  <span className="month__lesson-meta">
                    {l.startTime}–{l.endTime}
                  </span>
                  <span className="month__lesson-meta">{l.teacher}</span>
                  <span className="month__lesson-meta">{l.classroom}</span>
                  <span className="month__lesson-meta">{l.classGroup}</span>
                </a>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
