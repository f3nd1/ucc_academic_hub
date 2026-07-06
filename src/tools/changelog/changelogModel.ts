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

/** The YYYY-MM-DD day of an entry (used for grouping and range filtering). */
export const entryDay = (e: ChangelogEntry): string => e.date.slice(0, 10);

/** Display date "DD MMMM YYYY" from an entry's ISO commit date. */
export const entryDisplayDate = (e: ChangelogEntry): string =>
  formatDisplayDate(entryDay(e));

/** "HH:mm" local-ish time straight off the ISO string (no timezone maths). */
export const entryTime = (e: ChangelogEntry): string => {
  const m = e.date.match(/T(\d{2}:\d{2})/);
  return m ? m[1] : '';
};

/** Colour role for a change type, aligned with the app's status tokens. */
export const changeTypeRole = (t: ChangeType): 'ok' | 'error' | 'neutral' => {
  if (t === 'added') return 'ok';
  if (t === 'deleted') return 'error';
  return 'neutral'; // modified + renamed
};

/**
 * Filter entries by a free-text query (subject + body, case-insensitive) and an
 * inclusive date range (either bound optional). Order is preserved (git log is
 * already newest-first).
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

/** Group already-sorted (newest-first) entries under a header per calendar day. */
export function groupByDay(entries: ChangelogEntry[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const e of entries) {
    const day = entryDay(e);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.entries.push(e);
    else groups.push({ day, display: entryDisplayDate(e), entries: [e] });
  }
  return groups;
}
