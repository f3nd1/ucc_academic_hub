import { describe, it, expect } from 'vitest';
import {
  entryDay,
  entryTime,
  filterEntries,
  groupByDay,
  type ChangelogEntry,
} from '../src/tools/changelog/changelogModel';

const entry = (hash: string, date: string, subject = hash): ChangelogEntry => ({
  hash,
  date,
  author: 'Someone',
  subject,
  files: [],
});

// Times below are kept within 00:00-15:59 UTC so +8h (Singapore) never
// crosses into the next calendar day — that boundary-crossing behaviour is
// covered on its own in the entryDay describe block below, so these stay
// focused on ordering/grouping.

describe('groupByDay', () => {
  it('merges same-day entries into one group even when the input interleaves days', () => {
    // Mirrors what `git log`'s default (commit-graph, not date) traversal
    // order can produce once several branches have merged into main: a
    // day's commits split across two non-contiguous runs with a different
    // day's commit sandwiched in between.
    const entries = [
      entry('a', '2026-07-30T10:00:00+00:00'),
      entry('b', '2026-07-31T09:00:00+00:00'),
      entry('c', '2026-07-30T08:00:00+00:00'),
    ];
    const groups = groupByDay(entries);
    expect(groups.map((g) => g.day)).toEqual(['2026-07-31', '2026-07-30']);
    expect(groups.find((g) => g.day === '2026-07-30')!.entries).toHaveLength(2);
  });

  it('orders groups newest-day-first', () => {
    const entries = [
      entry('old', '2026-07-01T10:00:00+00:00'),
      entry('new', '2026-07-15T10:00:00+00:00'),
      entry('mid', '2026-07-08T10:00:00+00:00'),
    ];
    const groups = groupByDay(entries);
    expect(groups.map((g) => g.day)).toEqual(['2026-07-15', '2026-07-08', '2026-07-01']);
  });

  it('orders entries within a day newest-first, regardless of input order', () => {
    const entries = [
      entry('early', '2026-07-30T01:00:00+00:00'),
      entry('late', '2026-07-30T15:00:00+00:00'),
      entry('mid', '2026-07-30T08:00:00+00:00'),
    ];
    const groups = groupByDay(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].entries.map((e) => e.hash)).toEqual(['late', 'mid', 'early']);
  });

  it('never splits a day into two groups no matter how badly interleaved the input is', () => {
    const entries = [
      entry('a', '2026-07-30T12:00:00+00:00'),
      entry('b', '2026-08-01T10:00:00+00:00'),
      entry('c', '2026-07-31T10:00:00+00:00'),
      entry('d', '2026-07-30T09:00:00+00:00'),
      entry('e', '2026-07-31T15:00:00+00:00'),
      entry('f', '2026-07-30T14:00:00+00:00'),
    ];
    const groups = groupByDay(entries);
    const days = groups.map((g) => g.day);
    expect(days).toEqual(['2026-08-01', '2026-07-31', '2026-07-30']);
    // Each day appears exactly once in the output.
    expect(new Set(days).size).toBe(days.length);
    expect(groups.find((g) => g.day === '2026-07-30')!.entries).toHaveLength(3);
    expect(groups.find((g) => g.day === '2026-07-31')!.entries).toHaveLength(2);
  });

  it('sets the display date from the group, not just the first-seen entry', () => {
    const groups = groupByDay([entry('a', '2026-07-30T10:00:00+00:00')]);
    expect(groups[0].display).toBe('30 July 2026');
  });
});

describe('entryDay', () => {
  it('computes the Singapore-time (UTC+8) calendar day', () => {
    // 2026-07-31T00:06:47+00:00 is 2026-07-31T08:06:47+08:00 in Singapore —
    // still 31 July either way here, but exercised via the UTC+8 shift.
    expect(entryDay(entry('a', '2026-07-31T00:06:47+00:00'))).toBe('2026-07-31');
  });

  it('shifts a late-UTC-evening commit into the next Singapore day', () => {
    // 2026-07-30T20:00:00+00:00 -> 2026-07-31T04:00:00+08:00.
    expect(entryDay(entry('a', '2026-07-30T20:00:00+00:00'))).toBe('2026-07-31');
  });

  it('normalises commits with different recorded offsets to the same Singapore day when they are effectively simultaneous', () => {
    // These two are ~32 seconds apart in real time — one recorded in UTC
    // (e.g. a CI environment), one in the author's own +08:00 local time —
    // the actual case that split "30 July" into two groups around a lone
    // "31 July" entry. Read as raw ISO date prefixes they land on
    // different calendar days; in Singapore time they're the same day.
    const utcEntry = entry('x', '2026-07-30T23:14:59+00:00');
    const sgtEntry = entry('y', '2026-07-31T07:14:27+08:00');
    expect(entryDay(utcEntry)).toBe(entryDay(sgtEntry));
    expect(entryDay(utcEntry)).toBe('2026-07-31');
  });
});

describe('entryTime', () => {
  it('renders HH:mm in Singapore time regardless of the commit\'s own recorded offset', () => {
    expect(entryTime(entry('a', '2026-07-30T23:14:59+00:00'))).toBe('07:14');
    expect(entryTime(entry('b', '2026-07-31T07:14:27+08:00'))).toBe('07:14');
  });
});

describe('filterEntries', () => {
  const entries = [
    entry('a', '2026-07-30T10:00:00+00:00', 'Fix the thing'),
    entry('b', '2026-07-15T10:00:00+00:00', 'Add a feature'),
  ];

  it('filters by free-text query against the subject', () => {
    expect(filterEntries(entries, 'feature', '', '').map((e) => e.hash)).toEqual(['b']);
  });

  it('filters by inclusive date range', () => {
    expect(filterEntries(entries, '', '2026-07-20', '').map((e) => e.hash)).toEqual(['a']);
    expect(filterEntries(entries, '', '', '2026-07-20').map((e) => e.hash)).toEqual(['b']);
  });

  it('preserves input order (grouping sorts separately)', () => {
    expect(filterEntries(entries, '', '', '').map((e) => e.hash)).toEqual(['a', 'b']);
  });
});
