import { formatDisplayDate } from '../../shared/dates';

export type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

export interface ChangelogFileChange {
  path: string;
  changeType: ChangeType;
}

/** One commit, as generated into src/data/changelog.json by the build script. */
export interface ChangelogEntry {
  hash: string; // short hash
  date: string; // ISO (commit date), e.g. 2026-07-06T07:57:37+00:00
  author: string;
  subject: string;
  body?: string;
  files: ChangelogFileChange[];
}

const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * Convert an entry's ISO commit date to its Singapore (UTC+8) wall-clock
 * instant, expressed via the UTC getters so the result never depends on
 * whatever timezone the machine running this code happens to be in.
 *
 * `git log --date=iso-strict` records each commit in the AUTHOR'S OWN local
 * offset at the time — this repo's history mixes +00:00 and +08:00 commits.
 * Two commits 30 seconds apart in real time can carry different offsets, so
 * reading the calendar day straight off the raw ISO string (the old
 * `e.date.slice(0, 10)`) can label them on different days even though
 * they're effectively simultaneous — that mislabeling, not just git log's
 * traversal order, is what actually split "30 July" around a "31 July"
 * entry in the Changelog. Normalising every commit to one fixed reference
 * zone (Singapore, this project's home timezone) fixes that regardless of
 * where any individual commit was authored.
 */
function toSingaporeTime(iso: string): Date {
  return new Date(Date.parse(iso) + SGT_OFFSET_MS);
}

/** The YYYY-MM-DD day of an entry in Singapore time (used for grouping and range filtering). */
export const entryDay = (e: ChangelogEntry): string => {
  const t = toSingaporeTime(e.date);
  const y = t.getUTCFullYear();
  const m = String(t.getUTCMonth() + 1).padStart(2, '0');
  const d = String(t.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Display date "DD MMMM YYYY" from an entry's ISO commit date (Singapore time). */
export const entryDisplayDate = (e: ChangelogEntry): string =>
  formatDisplayDate(entryDay(e));

/** "HH:mm" in Singapore time — consistent regardless of the commit's own recorded offset. */
export const entryTime = (e: ChangelogEntry): string => {
  const t = toSingaporeTime(e.date);
  const h = String(t.getUTCHours()).padStart(2, '0');
  const min = String(t.getUTCMinutes()).padStart(2, '0');
  return `${h}:${min}`;
};

/** Colour role for a change type, aligned with the app's status tokens. */
export const changeTypeRole = (t: ChangeType): 'ok' | 'error' | 'neutral' => {
  if (t === 'added') return 'ok';
  if (t === 'deleted') return 'error';
  return 'neutral'; // modified + renamed
};

/**
 * Filter entries by a free-text query (subject + body, case-insensitive) and an
 * inclusive date range (either bound optional). Order is preserved — the
 * build-time generator sorts entries newest-first before this ever runs, and
 * groupByDay below sorts again defensively rather than trusting that.
 */
export function filterEntries(
  entries: ChangelogEntry[],
  query: string,
  from: string,
  to: string,
): ChangelogEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => {
    if (q) {
      const hay = `${e.subject}\n${e.body ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    const day = entryDay(e);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}

export interface DayGroup {
  day: string; // YYYY-MM-DD
  display: string; // DD MMMM YYYY
  entries: ChangelogEntry[];
}

/**
 * Group entries under a header per calendar day, newest-first, each day
 * appearing exactly once. Sorts by commit date/time first rather than
 * trusting the input is already ordered — `git log`'s default traversal
 * follows the commit graph, not a strict date sort, so once several
 * branches have merged in, entries for the same day can arrive
 * non-contiguously (e.g. "30 Jul", "31 Jul", "30 Jul" again). Grouping
 * unsorted input would silently split a day into two separate sections.
 */
export function groupByDay(entries: ChangelogEntry[]): DayGroup[] {
  const sorted = [...entries].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const groups: DayGroup[] = [];
  for (const e of sorted) {
    const day = entryDay(e);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(e);
    else groups.push({ day, display: entryDisplayDate(e), entries: [e] });
  }
  return groups;
}
