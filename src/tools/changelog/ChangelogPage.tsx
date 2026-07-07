import { useMemo, useState } from 'react';
import rawChangelog from '../../data/changelog.json';
import { useSettings } from '../../shared/settingsStore';
import { Icon } from '../../shared/Icon';
import {
  changeTypeRole,
  entryDisplayDate,
  entryTime,
  filterEntries,
  groupByDay,
  type ChangelogEntry,
} from './changelogModel';

const CHANGELOG = rawChangelog as ChangelogEntry[];

const ROLE_CLASS = { ok: 'chg-file--added', error: 'chg-file--deleted', neutral: 'chg-file--modified' } as const;
const CHANGE_LABEL = { added: 'added', modified: 'modified', deleted: 'deleted', renamed: 'renamed' } as const;

/** A single commit entry. */
function Entry({ entry, commitUrl }: { entry: ChangelogEntry; commitUrl: string | null }) {
  const time = entryTime(entry);
  return (
    <article className="chg-entry">
      <div className="chg-entry__head">
        <h3 className="chg-entry__subject">{entry.subject}</h3>
        {commitUrl ? (
          <a className="chg-entry__hash" href={commitUrl} target="_blank" rel="noreferrer">
            {entry.hash}
          </a>
        ) : (
          <span className="chg-entry__hash">{entry.hash}</span>
        )}
      </div>
      <p className="chg-entry__meta">
        {entryDisplayDate(entry)}
        {time && <> · {time}</>}
        {' · '}
        {entry.author}
      </p>

      <div className="chg-entry__panels">
        {entry.body && (
          <details className="chg-details">
            <summary>Description</summary>
            <pre className="chg-body">{entry.body}</pre>
          </details>
        )}

        <details className="chg-details">
          <summary>
            {entry.files.length} file{entry.files.length === 1 ? '' : 's'} changed
          </summary>
          <ul className="chg-files">
            {entry.files.map((f) => (
              <li key={f.path} className={`chg-file ${ROLE_CLASS[changeTypeRole(f.changeType)]}`}>
                <span className="chg-file__type">{CHANGE_LABEL[f.changeType]}</span>
                <code className="chg-file__path">{f.path}</code>
              </li>
            ))}
            {entry.files.length === 0 && (
              <li className="chg-file chg-file--modified">
                <span className="chg-file__path chg-file__path--muted">
                  No file changes recorded (e.g. a merge commit).
                </span>
              </li>
            )}
          </ul>
        </details>
      </div>
    </article>
  );
}

export function ChangelogPage() {
  const [settings] = useSettings();
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const groups = useMemo(
    () => groupByDay(filterEntries(CHANGELOG, query, from, to)),
    [query, from, to],
  );

  const repoUrl = settings.repoUrl.trim().replace(/\/+$/, '');
  const commitUrl = (hash: string): string | null =>
    repoUrl ? `${repoUrl}/commit/${hash}` : null;

  const total = groups.reduce((n, g) => n + g.entries.length, 0);

  return (
    <div className="changelog">
      <header className="chg-head">
        <div>
          <h1>Changelog</h1>
          <p className="chg-sub">
            Every change, straight from git history. Dates show as DD MMMM YYYY.
          </p>
        </div>
      </header>

      {CHANGELOG.length === 0 ? (
        <div className="banner banner--warn" role="note">
          No changelog data yet. Generate it from git history by running{' '}
          <code>npm run changelog</code> (it also runs automatically before{' '}
          <code>npm run build</code>).
        </div>
      ) : (
        <>
          <div className="chg-filters">
            <div className="field chg-filters__search">
              <label htmlFor="chgSearch">Search</label>
              <input
                id="chgSearch"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by commit subject or description…"
              />
            </div>
            <div className="field">
              <label htmlFor="chgFrom">From</label>
              <input id="chgFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="chgTo">To</label>
              <input id="chgTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>

          <p className="chg-count">
            {total} change{total === 1 ? '' : 's'}
            {(query || from || to) && ` (filtered from ${CHANGELOG.length})`}
          </p>

          {total === 0 ? (
            <p className="empty">No changes match your filters.</p>
          ) : (
            groups.map((g) => (
              <section key={g.day} className="chg-group">
                <div className="chg-group__header">
                  <Icon name="git-commit" size={16} />
                  <span>{g.display}</span>
                  <span className="chg-group__count">{g.entries.length}</span>
                </div>
                {g.entries.map((e) => (
                  <Entry key={e.hash} entry={e} commitUrl={commitUrl(e.hash)} />
                ))}
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}

export default ChangelogPage;
