import type { Course, ScheduledLesson } from './types';

const TZID = 'Asia/Singapore';

/** ISO date + "HH:mm" -> "YYYYMMDDTHHMMSS" (floating local wall-clock). */
const stamp = (iso: string, time: string): string =>
  `${iso.replace(/-/g, '')}T${time.replace(':', '')}00`;

/**
 * Per-lesson Google Calendar "add event" link (no OAuth). Opens a prefilled
 * event; ctz pins it to Singapore time so the wall-clock times are correct.
 */
export function calendarLinkFor(
  lesson: ScheduledLesson,
  courseName: string,
): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${courseName} - ${lesson.lessonName}`,
    dates: `${stamp(lesson.date, lesson.startTime)}/${stamp(lesson.date, lesson.endTime)}`,
    // Teacher and class group are optional; a blank one is dropped so the
    // event description never arrives as a lone ", " or an empty location.
    details: [lesson.teacher, lesson.classGroup].filter(Boolean).join(', '),
    location: lesson.classroom,
    ctz: TZID,
  });
  // URLSearchParams encodes each value; "/" in dates is left intact by Google.
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Escape a value for an ICS text field (RFC 5545). */
const icsEscape = (v: string): string =>
  v.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

const fileStem = (classGroup: string): string =>
  (classGroup.trim() || 'timetable').replace(/[^\w.-]+/g, '-');

/**
 * Build a VCALENDAR with one VEVENT per lesson, using TZID Asia/Singapore.
 * Singapore has no DST, so a fixed +08:00 VTIMEZONE makes it import cleanly.
 */
export function buildIcs(
  lessons: ScheduledLesson[],
  course: Course,
  dtstamp: string,
): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UCC//Timetable Generator//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE',
    `TZID:${TZID}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:+08',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  // AL buffer days have no times and are not calendar events — skip them.
  for (const l of lessons.filter((l) => l.kind !== 'AL')) {
    // Classroom, teacher, and class group are optional. An empty LOCATION or
    // DESCRIPTION property is filler in the importing calendar, so the whole
    // property is omitted rather than emitted blank.
    const description = [l.teacher, l.classGroup].filter(Boolean).join(', ');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${l.moduleId}-${l.lessonNo}@ucc-timetable`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;TZID=${TZID}:${stamp(l.date, l.startTime)}`,
      `DTEND;TZID=${TZID}:${stamp(l.date, l.endTime)}`,
      `SUMMARY:${icsEscape(`${course.name} - ${l.lessonName}`)}`,
      ...(l.classroom ? [`LOCATION:${icsEscape(l.classroom)}`] : []),
      ...(description ? [`DESCRIPTION:${icsEscape(description)}`] : []),
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

/** Trigger download of the .ics for all lessons. */
export function downloadIcs(
  lessons: ScheduledLesson[],
  course: Course,
): void {
  // App runtime (browser) — Date is fine here; DTSTAMP must be UTC "Z" form.
  const dtstamp = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  const ics = buildIcs(lessons, course, dtstamp);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileStem(course.name)}-timetable.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// TODO (out of scope this pass): OAuth events.insert into a chosen calendar,
// using the Google Identity Services token flow (calendar scope) so lessons
// can be written straight into a user's Google Calendar instead of via .ics.
