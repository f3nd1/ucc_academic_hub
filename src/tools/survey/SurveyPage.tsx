import { useMemo, useState, type ChangeEvent } from 'react';
import { Hint } from '../../shared/help/Hint';
import { useSettings } from '../../shared/settingsStore';
import { DEFAULT_ANTHROPIC_MODEL } from '../../shared/settings';
import {
  analyse,
  buildReport,
  detectSurveyColumns,
  exactMatches,
  mergeMaps,
  type ComparisonMap,
  type ParsedDataset,
} from './surveyModel';
import { isSupportedFile, parseSpreadsheetFile } from './surveyParse';
import { exportReportToWord, exportReportToPdf } from './surveyExports';
import { buildSurveyDataBlock, generateAiReport, AiReportError } from './surveyAi';
import {
  DEFAULT_SURVEY_PROMPT,
  loadSurveyPrompt,
  saveSurveyPrompt,
} from './surveyPromptStore';

type Status = { ok: boolean; text: string } | null;

/** A labelled file drop with the current file name shown once uploaded. */
function UploadCard({
  title,
  description,
  fileName,
  onChange,
}: {
  title: string;
  description: string;
  fileName?: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="sv-card">
      <label className="sv-card__title">{title}</label>
      <input type="file" accept=".xlsx,.xls,.csv" onChange={onChange} />
      <p className="sv-card__desc">{description}</p>
      {fileName && <p className="sv-card__file">Uploaded: {fileName}</p>}
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="sv-metric">
      <p className="sv-metric__label">{title}</p>
      <p className="sv-metric__value">{value}</p>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="sv-inforow">
      <p className="sv-inforow__label">{label}</p>
      <p className="sv-inforow__value">{value}</p>
    </div>
  );
}

export function SurveyPage() {
  const [settings] = useSettings();
  const [currentDataset, setCurrentDataset] = useState<ParsedDataset | null>(null);
  const [comparisonDataset, setComparisonDataset] = useState<ParsedDataset | null>(null);
  const [threshold, setThreshold] = useState(3);
  const [status, setStatus] = useState<Status>(null);
  const [reportGenerated, setReportGenerated] = useState(false);
  const [manualMaps, setManualMaps] = useState<ComparisonMap[]>([]);
  const [selCurrent, setSelCurrent] = useState('');
  const [selComparison, setSelComparison] = useState('');

  // AI report: the editable instruction and the one-shot narrative it produces.
  // When aiReport is set it is shown/exported in place of the built-in writer.
  const [prompt, setPrompt] = useState(() => loadSurveyPrompt());
  const [showPrompt, setShowPrompt] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const apiKey = settings.anthropicApiKey.trim();
  const model = settings.anthropicModel.trim() || DEFAULT_ANTHROPIC_MODEL;

  const currentSurveyColumns = useMemo(
    () => (currentDataset ? detectSurveyColumns(currentDataset.rows, currentDataset.columns) : []),
    [currentDataset],
  );
  const comparisonSurveyColumns = useMemo(
    () =>
      comparisonDataset
        ? detectSurveyColumns(comparisonDataset.rows, comparisonDataset.columns)
        : [],
    [comparisonDataset],
  );

  const automaticMaps = useMemo(
    () => exactMatches(currentSurveyColumns, comparisonSurveyColumns),
    [currentSurveyColumns, comparisonSurveyColumns],
  );
  const allMaps = useMemo(
    () => mergeMaps(automaticMaps, manualMaps),
    [automaticMaps, manualMaps],
  );

  // One analysis feeds both the on-screen tables and the generated report.
  const analysis = useMemo(() => {
    if (!currentDataset) return null;
    const comparison = comparisonDataset
      ? { rows: comparisonDataset.rows, maps: allMaps }
      : null;
    return analyse(currentDataset.rows, currentDataset.columns, threshold, comparison);
  }, [currentDataset, comparisonDataset, allMaps, threshold]);

  // The built-in (deterministic) report stays live with the current analysis;
  // an AI report, once generated, is a snapshot that takes precedence until the
  // data changes or the user regenerates.
  const builtInReport = useMemo(
    () => (reportGenerated && analysis ? buildReport(analysis) : ''),
    [reportGenerated, analysis],
  );
  const reportText = aiReport ?? builtInReport;
  const reportSource: 'ai' | 'builtin' | null = aiReport
    ? 'ai'
    : reportGenerated
      ? 'builtin'
      : null;

  const handleUpload = async (
    e: ChangeEvent<HTMLInputElement>,
    kind: 'current' | 'comparison',
  ) => {
    setStatus(null);
    setReportGenerated(false);
    setAiReport(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (!isSupportedFile(file.name)) {
      setStatus({ ok: false, text: 'Please upload an Excel or CSV file (.xlsx, .xls, or .csv).' });
      return;
    }
    try {
      const parsed = await parseSpreadsheetFile(file);
      if (kind === 'current') setCurrentDataset(parsed);
      else setComparisonDataset(parsed);
      setManualMaps([]);
      setStatus({ ok: true, text: `Uploaded "${file.name}" (${parsed.rows.length} response(s)).` });
    } catch {
      setStatus({ ok: false, text: 'The uploaded file could not be read. Check the format and try again.' });
    }
  };

  const addManualMap = () => {
    if (!selCurrent || !selComparison) {
      setStatus({ ok: false, text: 'Select both a current question and a comparison question.' });
      return;
    }
    const exists = manualMaps.some(
      (m) => m.currentQuestion === selCurrent && m.comparisonQuestion === selComparison,
    );
    if (exists) {
      setStatus({ ok: false, text: 'This manual mapping has already been added.' });
      return;
    }
    setManualMaps((prev) => [
      ...prev,
      { currentQuestion: selCurrent, comparisonQuestion: selComparison, matchType: 'Manual' },
    ]);
    setSelCurrent('');
    setSelComparison('');
    setStatus({ ok: true, text: 'Manual mapping added.' });
  };

  const removeManualMap = (index: number) =>
    setManualMaps((prev) => prev.filter((_, i) => i !== index));

  /** Shared pre-flight for both report paths. Returns false (and sets a status)
   *  when the inputs aren't ready. */
  const reportInputsReady = () => {
    if (!currentDataset) {
      setStatus({ ok: false, text: 'Upload the current survey dataset before generating the report.' });
      return false;
    }
    if (currentSurveyColumns.length === 0) {
      setStatus({ ok: false, text: 'No numeric or convertible Likert-scale question columns were detected.' });
      return false;
    }
    if (Number.isNaN(threshold)) {
      setStatus({ ok: false, text: 'Enter a valid numeric threshold.' });
      return false;
    }
    return true;
  };

  const generateReport = () => {
    if (!reportInputsReady()) return;
    setAiReport(null); // fall back to the built-in writer
    setReportGenerated(true);
    setStatus({ ok: true, text: 'Built-in report generated successfully.' });
  };

  const generateWithAi = async () => {
    if (!reportInputsReady() || !analysis) return;
    if (!apiKey) {
      setStatus({
        ok: false,
        text: 'Add an Anthropic API key in Settings to generate with AI, or use the built-in report.',
      });
      return;
    }
    setAiBusy(true);
    setStatus({ ok: true, text: 'Writing the report with Claude, this can take a moment…' });
    try {
      const text = await generateAiReport({
        apiKey,
        model,
        prompt,
        dataBlock: buildSurveyDataBlock(analysis),
      });
      setAiReport(text);
      setReportGenerated(true);
      setStatus({ ok: true, text: `AI report generated with ${model}.` });
    } catch (err) {
      const text =
        err instanceof AiReportError ? err.message : 'The AI report could not be generated.';
      setStatus({ ok: false, text });
    } finally {
      setAiBusy(false);
    }
  };

  const updatePrompt = (value: string) => {
    setPrompt(value);
    saveSurveyPrompt(value);
  };

  const resetPrompt = () => {
    setPrompt(DEFAULT_SURVEY_PROMPT);
    saveSurveyPrompt(DEFAULT_SURVEY_PROMPT);
    setStatus({ ok: true, text: 'Report prompt reset to the default.' });
  };

  const doExport = async (fn: () => void | Promise<void>) => {
    if (!reportText) {
      setStatus({ ok: false, text: 'Generate the report before exporting.' });
      return;
    }
    await fn();
    setStatus({ ok: true, text: 'Report export completed.' });
  };

  const reset = () => {
    setCurrentDataset(null);
    setComparisonDataset(null);
    setManualMaps([]);
    setReportGenerated(false);
    setAiReport(null);
    setStatus(null);
    setSelCurrent('');
    setSelComparison('');
  };

  const metadata = analysis?.metadata;
  const currentSummaries = analysis?.currentSummaries ?? [];
  const comparisonSummaries = analysis?.comparisonSummaries ?? [];
  const actionAreas = analysis?.actionAreas ?? [];

  return (
    <div className="panel survey">
      <div className="survey__head">
        <h1>Student Survey Analysis</h1>
        <p className="chg-sub">
          Upload student survey results, set an action threshold, optionally add
          comparison data, map similar questions, and generate a structured
          academic report with Word and PDF export.
        </p>
      </div>

      {/* -------- Uploads + threshold -------- */}
      <div className="grid-3 survey__uploads">
        <UploadCard
          title="Current survey dataset"
          description="Required. The latest survey data (.xlsx, .xls, or .csv)."
          fileName={currentDataset?.fileName}
          onChange={(e) => handleUpload(e, 'current')}
        />
        <div className="sv-card">
          <label className="sv-card__title" htmlFor="sv-threshold">
            Action threshold
          </label>
          <input
            id="sv-threshold"
            type="number"
            step="0.1"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
          <p className="sv-card__desc">Scores below this value are flagged for action.</p>
        </div>
        <UploadCard
          title="Comparison dataset"
          description="Optional. Previous, benchmark, cohort, or module comparison data."
          fileName={comparisonDataset?.fileName}
          onChange={(e) => handleUpload(e, 'comparison')}
        />
      </div>

      {status && (
        <div className={`banner ${status.ok ? 'banner--ok' : 'banner--error'}`} role="status">
          {status.text}
        </div>
      )}

      {/* -------- Report prompt (AI) -------- */}
      <div className="sv-prompt">
        <div className="sv-prompt__head">
          <div>
            <h2 className="survey__h2">Report prompt</h2>
            <p className="hint">
              Plain-English instructions for how Claude should write the report.
              Edit them anytime; your version is remembered on this device. The
              app always supplies the computed figures separately, so the prompt
              only sets the audience, structure, and style.
            </p>
          </div>
          <button
            type="button"
            className="linkbtn"
            onClick={() => setShowPrompt((v) => !v)}
            aria-expanded={showPrompt}
          >
            {showPrompt ? 'Hide prompt' : 'Edit prompt'}
          </button>
        </div>
        {showPrompt && (
          <>
            <textarea
              className="sv-prompt__text"
              value={prompt}
              onChange={(e) => updatePrompt(e.target.value)}
              rows={12}
              spellCheck={false}
              aria-label="Report prompt"
            />
            <div className="actions">
              <button
                type="button"
                className="linkbtn"
                onClick={resetPrompt}
                disabled={prompt === DEFAULT_SURVEY_PROMPT}
              >
                Reset to default prompt
              </button>
            </div>
          </>
        )}
        <p className="hint">
          {apiKey
            ? `AI report uses ${model}. `
            : 'No Anthropic API key set, so “Generate with AI” is unavailable. '}
          {!apiKey && (
            <>
              Add one under <strong>Settings → Anthropic</strong> to have Claude
              write the narrative, or use the built-in writer below (no key, no
              cost).
            </>
          )}
        </p>
      </div>

      <div className="actions survey__actions">
        <button
          className="btn btn--primary"
          onClick={generateWithAi}
          disabled={aiBusy || !apiKey}
          title={apiKey ? undefined : 'Set an Anthropic API key in Settings first.'}
        >
          {aiBusy ? 'Generating…' : 'Generate with AI'}
        </button>
        <button className="btn" onClick={generateReport} disabled={aiBusy}>
          Generate built-in report
        </button>
        <button className="btn" onClick={() => doExport(() => exportReportToWord(reportText))}>
          Export to Word
        </button>
        <button className="btn" onClick={() => doExport(() => exportReportToPdf(reportText))}>
          Export to PDF
        </button>
        <button className="btn" onClick={reset}>
          Reset
        </button>
      </div>

      {/* -------- Metrics + overview -------- */}
      {currentDataset && metadata && (
        <>
          <div className="grid-2 survey__metrics">
            <MetricCard title="Responses" value={String(metadata.responseCount)} />
            <MetricCard title="Detected questions" value={String(currentSurveyColumns.length)} />
            <MetricCard title="Threshold" value={threshold.toFixed(2)} />
            <MetricCard title="Comparison" value={comparisonDataset ? 'Provided' : 'Not provided'} />
          </div>

          <h2 className="survey__h2">Detected survey overview</h2>
          <div className="grid-2">
            <InfoRow label="Course name" value={metadata.courseName} />
            <InfoRow label="Module name(s)" value={metadata.moduleNames.join(', ')} />
            <InfoRow label="Reporting period" value={metadata.reportingPeriod} />
            <InfoRow label="Current file" value={currentDataset.fileName} />
          </div>
        </>
      )}

      {/* -------- Question matching (comparison only) -------- */}
      {comparisonDataset && (
        <>
          <h2 className="survey__h2">Question matching</h2>
          <Hint text="Exact matches are detected automatically. Use manual mapping when wording differs but the meaning is comparable." />

          <h3 className="survey__h3">Automatic exact matches</h3>
          {automaticMaps.length === 0 ? (
            <p className="hint">No exact question matches were detected.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Current question</th>
                    <th>Comparison question</th>
                    <th>Match type</th>
                  </tr>
                </thead>
                <tbody>
                  {automaticMaps.map((m) => (
                    <tr key={m.currentQuestion}>
                      <td>{m.currentQuestion}</td>
                      <td>{m.comparisonQuestion}</td>
                      <td>{m.matchType}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3 className="survey__h3">Manual mapping</h3>
          <div className="grid-3 survey__map">
            <select value={selCurrent} onChange={(e) => setSelCurrent(e.target.value)}>
              <option value="">Select current question</option>
              {currentSurveyColumns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select value={selComparison} onChange={(e) => setSelComparison(e.target.value)}>
              <option value="">Select comparison question</option>
              {comparisonSurveyColumns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button className="btn" onClick={addManualMap}>
              Add manual mapping
            </button>
          </div>

          {manualMaps.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Current question</th>
                    <th>Comparison question</th>
                    <th>Match type</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {manualMaps.map((m, i) => (
                    <tr key={`${m.currentQuestion}-${m.comparisonQuestion}`}>
                      <td>{m.currentQuestion}</td>
                      <td>{m.comparisonQuestion}</td>
                      <td>{m.matchType}</td>
                      <td>
                        <button type="button" className="linkbtn si-danger" onClick={() => removeManualMap(i)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* -------- Summary table -------- */}
      {currentSummaries.length > 0 && (
        <>
          <h2 className="survey__h2">Summary table of current results</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Survey dimension / question</th>
                  <th>Mean score</th>
                  <th>Response count</th>
                  <th>Interpretation</th>
                </tr>
              </thead>
              <tbody>
                {currentSummaries.map((s) => (
                  <tr key={s.question} className={s.belowThreshold ? 'row--conflict' : ''}>
                    <td>{s.question}</td>
                    <td>{s.mean.toFixed(2)}</td>
                    <td>{s.count}</td>
                    <td>{s.interpretation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* -------- Action areas -------- */}
      {actionAreas.length > 0 && (
        <div className="survey__action">
          <h2 className="survey__h2">Areas requiring attention</h2>
          <p className="hint">
            The following areas fall below the selected threshold of {threshold.toFixed(2)}.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Mean score</th>
                  <th>Threshold</th>
                  <th>Gap</th>
                </tr>
              </thead>
              <tbody>
                {actionAreas.map((s) => (
                  <tr key={s.question}>
                    <td>{s.question}</td>
                    <td>{s.mean.toFixed(2)}</td>
                    <td>{threshold.toFixed(2)}</td>
                    <td>{(s.mean - threshold).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* -------- Comparative summary -------- */}
      {comparisonSummaries.length > 0 && (
        <>
          <h2 className="survey__h2">Comparative summary</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Current question</th>
                  <th>Comparison question</th>
                  <th>Match type</th>
                  <th>Current</th>
                  <th>Comparison</th>
                  <th>Change</th>
                  <th>Direction</th>
                  <th>Analytical comment</th>
                </tr>
              </thead>
              <tbody>
                {comparisonSummaries.map((s) => (
                  <tr key={`${s.currentQuestion}-${s.comparisonQuestion}`}>
                    <td>{s.currentQuestion}</td>
                    <td>{s.comparisonQuestion}</td>
                    <td>{s.matchType}</td>
                    <td>{s.currentMean.toFixed(2)}</td>
                    <td>{s.comparisonMean.toFixed(2)}</td>
                    <td>{s.change.toFixed(2)}</td>
                    <td>{s.direction}</td>
                    <td>{s.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* -------- Generated report -------- */}
      {reportGenerated && reportText && (
        <>
          <h2 className="survey__h2">Generated analytical report</h2>
          <p className="hint">
            {reportSource === 'ai'
              ? `Written by Claude (${model}) from your figures using the report prompt above.`
              : 'Written by the built-in report writer (no AI).'}
          </p>
          <article className="sv-report">{reportText}</article>
        </>
      )}
    </div>
  );
}

export default SurveyPage;
