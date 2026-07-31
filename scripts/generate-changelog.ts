// Build-time changelog generator.
//
// Reads the current branch's git history and writes a structured
// src/data/changelog.json — the source of truth is git itself, so the
// changelog never goes stale. Runs automatically before `npm run build`
// (via the "prebuild" script) and on demand with `npm run changelog`.
//
// Run with: node --experimental-strip-types scripts/generate-changelog.ts

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type ChangeType = 'added' | 'modified' | 'deleted' | 'renamed';

interface ChangelogFileChange {
  path: string;
  changeType: ChangeType;
}

interface ChangelogEntry {
  hash: string;
  date: string;
  author: string;
  subject: string;
  body?: string;
  files: ChangelogFileChange[];
}

// Record + field separators that never appear in commit content, so a commit
// body containing pipes/newlines can't confuse the parser.
const RS = '\x1e';
const FS = '\x1f';

// Trailing FS after %b delimits the body from the --name-status block that git
// prints on the following lines.
const FORMAT = `${RS}%h${FS}%ad${FS}%an${FS}%s${FS}%b${FS}`;

const classify = (letter: string): ChangeType => {
  const c = letter[0];
  if (c === 'A') return 'added';
  if (c === 'D') return 'deleted';
  if (c === 'R') return 'renamed';
  return 'modified';
};

function readGitLog(): string {
  try {
    return execSync(
      `git log --pretty=format:'${FORMAT}' --date=iso-strict --name-status`,
      { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 },
    );
  } catch {
    return '';
  }
}

function parse(raw: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  for (const chunk of raw.split(RS)) {
    if (!chunk.trim()) continue;
    const parts = chunk.split(FS);
    const [hash, date, author, subject, body] = parts;
    const nameStatus = parts[5] ?? '';

    const files: ChangelogFileChange[] = nameStatus
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const cols = line.split('\t');
        const letter = cols[0];
        // Renames appear as "R096\told\tnew" — record the new path.
        const path =
          letter[0] === 'R' && cols[2] ? cols[2] : cols[cols.length - 1];
        return { path, changeType: classify(letter) };
      });

    const entry: ChangelogEntry = {
      hash: (hash ?? '').trim(),
      date: (date ?? '').trim(),
      author: (author ?? '').trim(),
      subject: (subject ?? '').trim(),
      files,
    };
    if (body && body.trim()) entry.body = body.trim();
    entries.push(entry);
  }
  return entries;
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data');
const outFile = resolve(outDir, 'changelog.json');
const entries = parse(readGitLog());

// `git log`'s default order follows the commit graph (each commit before its
// parents), not a strict date sort — once several claude/... branches merge
// into main, that graph walk can genuinely surface commits out of date order
// (a branch merged later can carry earlier commit dates), which split a
// single calendar day into two separate groups downstream in
// changelogModel.ts's groupByDay. Sorting here, once, at the source, means
// every consumer gets correctly newest-first data without having to re-sort
// (or assume) anything of its own.
entries.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify(entries, null, 2)}\n`);
console.log(`changelog: wrote ${entries.length} entries to ${outFile}`);
