import { useMemo, useState } from 'react';
import {
  loadAiLog,
  clearAiLog,
  summariseAiLog,
  type AiLogEntry,
} from '../shared/aiLog';
import { formatUsd, isPriceEstimated } from '../shared/aiPricing';
import { Hint } from '../shared/help/Hint';

const numberFmt = new Intl.NumberFormat('en-SG');

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-SG', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** One expandable row: summary line, then Prompt sent / Output panels. */
function LogRow({ entry }: { entry: AiLogEntry }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'output' | 'prompt'>('output');
  const tokens = entry.inputTokens + entry.outputTokens;

  return (
    <>
      <tr
        className={`ailog__row ${entry.status === 'error' ? 'ailog__row--error' : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <td>
          <button type="button" className="ailog__toggle" aria-expanded={open}>
            {open ? '▾' : '▸'}
          </button>
        </td>
        <td>{formatWhen(entry.timestamp)}</td>
        <td>{entry.tool}</td>
        <td className="ailog__subject">{entry.subject || '—'}</td>
        <td>{entry.model}</td>
        <td className="ailog__num">
          {entry.status === 'error' ? '—' : numberFmt.format(tokens)}
        </td>
        <td className="ailog__num">
          {entry.status === 'error' ? '—' : formatUsd(entry.costUsd)}
          {entry.status !== 'error' && isPriceEstimated(entry.model) && (
            <span title="Model not in the price table; using Opus-tier rates."> *</span>
          )}
        </td>
        <td>
          <span className={`chip chip--${entry.status === 'ok' ? 'active' : 'error'}`}>
            {entry.status === 'ok' ? 'ok' : 'error'}
          </span>
        </td>
      </tr>
      {open && (
        <tr className="ailog__detailrow">
          <td colSpan={8}>
            {entry.status === 'error' && (
              <div className="banner banner--error" role="status">
                {entry.error}
              </div>
            )}
            <div className="ailog__tabs">
              <button
                type="button"
                className={`btn ${tab === 'output' ? 'btn--primary' : ''}`}
                onClick={() => setTab('output')}
              >
                Output
              </button>
              <button
                type="button"
                className={`btn ${tab === 'prompt' ? 'btn--primary' : ''}`}
                onClick={() => setTab('prompt')}
              >
                Prompt sent
              </button>
            </div>
            <pre className="ailog__pre">
              {tab === 'output'
                ? entry.output || '(no output — see the error above)'
                : entry.promptSent}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * Workspace-wide AI activity log. Every AI call (currently the Student Survey
 * Analysis report writer) records the prompt sent, the output, token usage, and
 * an estimated cost here so usage can be monitored. Local to this browser (and
 * synced with the Supabase snapshot); not a billing source of truth.
 */
export function AiLogPage() {
  const [entries, setEntries] = useState<AiLogEntry[]>(() => loadAiLog());
  const totals = useMemo(() => summariseAiLog(entries), [entries]);

  const handleClear = () => {
    if (entries.length === 0) return;
    if (!window.confirm('Clear the entire AI log? This cannot be undone.')) return;
    setEntries(clearAiLog());
  };

  return (
    <div className="panel ailog">
      <div className="survey__head">
        <h1>AI Log</h1>
        <p className="chg-sub">
          A record of every AI call the workspace makes — the prompt sent, the
          response, token usage, and an estimated cost — so you can monitor what
          is being generated and roughly what it costs.
        </p>
      </div>

      <Hint text="Cost is an estimate from a built-in price table (the API does not return prices). A * marks a model priced at the Opus-tier fallback. Refresh the page to pull in calls made in another tab." />

      <div className="grid-2 survey__metrics">
        <div className="sv-metric">
          <p className="sv-metric__label">Calls logged</p>
          <p className="sv-metric__value">{numberFmt.format(totals.count)}</p>
        </div>
        <div className="sv-metric">
          <p className="sv-metric__label">Input tokens</p>
          <p className="sv-metric__value">{numberFmt.format(totals.inputTokens)}</p>
        </div>
        <div className="sv-metric">
          <p className="sv-metric__label">Output tokens</p>
          <p className="sv-metric__value">{numberFmt.format(totals.outputTokens)}</p>
        </div>
        <div className="sv-metric">
          <p className="sv-metric__label">Estimated cost</p>
          <p className="sv-metric__value">{formatUsd(totals.costUsd)}</p>
        </div>
      </div>

      <div className="actions">
        <button type="button" className="btn" onClick={() => setEntries(loadAiLog())}>
          Refresh
        </button>
        <button
          type="button"
          className="btn si-danger"
          onClick={handleClear}
          disabled={entries.length === 0}
        >
          Clear log
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="empty">
          No AI calls yet. Generate a report with AI in Student Survey Analysis
          and it will appear here.
        </p>
      ) : (
        <div className="table-wrap">
          <table className="ailog__table">
            <thead>
              <tr>
                <th aria-label="Expand" />
                <th>When</th>
                <th>Tool</th>
                <th>Subject</th>
                <th>Model</th>
                <th className="ailog__num">Tokens</th>
                <th className="ailog__num">Est. cost</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <LogRow key={e.id} entry={e} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default AiLogPage;
