import { useMemo } from 'react';
import { formatCurrency } from '../format.js';

const WIDTH = 760;
const HEIGHT = 200;
const PAD = { top: 16, right: 12, bottom: 12, left: 12 };

/** Simple single-series area/line chart, used for portfolio value over time. */
export function LineChart({ points, color = 'var(--up)' }) {
  const { linePath, areaPath, first, last, changeUp } = useMemo(() => build(points, color), [points]);

  if (!points || points.length < 2) {
    return <div className="chart-empty">Make a trade to start tracking portfolio value.</div>;
  }

  const lineColor = changeUp ? 'var(--up)' : 'var(--down)';

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <defs>
          <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#portfolioFill)" stroke="none" />
        <path d={linePath} fill="none" stroke={lineColor} strokeWidth="1.75" />
      </svg>
      <div className="legend" style={{ justifyContent: 'space-between' }}>
        <span>{formatCurrency(first)}</span>
        <span>{formatCurrency(last)}</span>
      </div>
    </div>
  );
}

function build(points) {
  if (!points || points.length < 2) return { linePath: '', areaPath: '' };
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;

  const min = Math.min(...points);
  const max = Math.max(...points);
  const pad = (max - min) * 0.1 || 1;

  const scaleX = (i) => PAD.left + (i / (points.length - 1)) * innerWidth;
  const scaleY = (v) =>
    PAD.top + innerHeight - ((v - (min - pad)) / (max + pad - (min - pad))) * innerHeight;

  const linePath = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(v)}`).join(' ');
  const areaPath =
    `${linePath} L ${scaleX(points.length - 1)} ${HEIGHT - PAD.bottom} L ${scaleX(0)} ${HEIGHT - PAD.bottom} Z`;

  return {
    linePath,
    areaPath,
    first: points[0],
    last: points[points.length - 1],
    changeUp: points[points.length - 1] >= points[0],
  };
}
