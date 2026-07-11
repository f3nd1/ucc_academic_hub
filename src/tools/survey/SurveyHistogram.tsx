import { useRef, useState, type MouseEvent } from 'react';
import * as d3 from 'd3';
import type { HistogramBin } from './surveyModel';

// A reusable D3 bar chart for the survey report's two histograms (score-band
// distribution and comparative-change distribution — same component, different
// data shape). d3 supplies the scales and tick generation; the SVG marks are
// rendered with JSX so React owns the DOM. Bars are filled from the theme's
// --accent CSS variable, so the chart automatically matches whichever skin is
// active (Classic / Retro LCD / Y2K Pop / Cult of the Lamb) instead of a
// hardcoded colour.

const VIEW_W = 640;
const VIEW_H = 300;
const MARGIN = { top: 16, right: 20, bottom: 96, left: 44 };

interface Tip {
  x: number;
  y: number;
  label: string;
  count: number;
}

export function SurveyHistogram({
  bins,
  yLabel = 'Count',
}: {
  bins: HistogramBin[];
  yLabel?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);

  if (bins.length === 0) return null;

  const innerW = VIEW_W - MARGIN.left - MARGIN.right;
  const innerH = VIEW_H - MARGIN.top - MARGIN.bottom;

  const x = d3
    .scaleBand<string>()
    .domain(bins.map((b) => b.label))
    .range([0, innerW])
    .padding(0.25);

  const yMax = d3.max(bins, (b) => b.count) ?? 0;
  const y = d3.scaleLinear().domain([0, Math.max(yMax, 1)]).range([innerH, 0]).nice();
  // Integer ticks only — counts are whole numbers.
  const yTicks = y.ticks(Math.min(5, Math.max(1, Math.ceil(y.domain()[1])))).filter(Number.isInteger);

  const onMove = (e: MouseEvent, b: HistogramBin) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    // clientX/Y relative to the wrapper works regardless of SVG viewBox scaling.
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, label: b.label, count: b.count });
  };

  return (
    <div className="sv-d3" ref={wrapRef}>
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="sv-d3__svg" role="img" aria-label="Bar chart">
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {yTicks.map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x1={0} x2={innerW} className="sv-d3__grid" />
              <text x={-8} dy="0.32em" textAnchor="end" className="sv-d3__tick">
                {t}
              </text>
            </g>
          ))}

          <text
            transform={`translate(${-MARGIN.left + 12},${innerH / 2}) rotate(-90)`}
            textAnchor="middle"
            className="sv-d3__axislabel"
          >
            {yLabel}
          </text>

          {bins.map((b) => {
            const bx = x(b.label) ?? 0;
            const by = y(b.count);
            return (
              <rect
                key={b.label}
                className="sv-d3__bar"
                x={bx}
                y={by}
                width={x.bandwidth()}
                height={innerH - by}
                onMouseMove={(e) => onMove(e, b)}
                onMouseLeave={() => setTip(null)}
              >
                <title>{`${b.label}: ${b.count}`}</title>
              </rect>
            );
          })}

          <line x1={0} x2={innerW} y1={innerH} y2={innerH} className="sv-d3__axis" />

          {bins.map((b) => {
            const bx = (x(b.label) ?? 0) + x.bandwidth() / 2;
            return (
              <text
                key={b.label}
                transform={`translate(${bx},${innerH + 12}) rotate(-30)`}
                textAnchor="end"
                className="sv-d3__tick"
              >
                {b.label}
              </text>
            );
          })}
        </g>
      </svg>
      {tip && (
        <div className="sv-d3__tip" style={{ left: tip.x, top: tip.y }} role="status">
          <strong>{tip.count}</strong> <span>{tip.label}</span>
        </div>
      )}
    </div>
  );
}

export default SurveyHistogram;
