import { useMemo } from 'react';

const WIDTH = 760;
const HEIGHT = 90;
const PAD = { top: 8, right: 12, bottom: 8, left: 12 };

/** Small RSI(14) panel with shaded overbought/oversold reference bands. */
export function RsiChart({ rsi }) {
  const path = useMemo(() => buildPath(rsi), [rsi]);
  const latest = [...(rsi || [])].reverse().find((v) => v != null);

  if (!rsi || rsi.every((v) => v == null)) {
    return null;
  }

  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const y = (v) => PAD.top + innerHeight - (v / 100) * innerHeight;

  return (
    <div className="chart-wrap">
      <div className="legend">
        <div className="legend-item">
          <span className="legend-swatch" style={{ background: '#4f8dfd' }} />
          RSI (14){latest != null ? ` · ${latest.toFixed(1)}` : ''}
        </div>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <rect
          x={PAD.left}
          y={y(70)}
          width={WIDTH - PAD.left - PAD.right}
          height={y(30) - y(70)}
          fill="var(--border)"
          opacity="0.4"
        />
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(70)} y2={y(70)} stroke="var(--text-faint)" strokeDasharray="2,3" />
        <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(30)} y2={y(30)} stroke="var(--text-faint)" strokeDasharray="2,3" />
        <text x={WIDTH - PAD.right} y={y(70) - 3} fontSize="9" fill="var(--text-faint)" textAnchor="end">
          70
        </text>
        <text x={WIDTH - PAD.right} y={y(30) + 10} fontSize="9" fill="var(--text-faint)" textAnchor="end">
          30
        </text>
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
      </svg>
    </div>
  );
}

function buildPath(rsi) {
  if (!rsi) return '';
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;
  const scaleX = (i) => PAD.left + (i / (rsi.length - 1)) * innerWidth;
  const scaleY = (v) => PAD.top + innerHeight - (v / 100) * innerHeight;

  let path = '';
  let started = false;
  rsi.forEach((v, i) => {
    if (v == null) return;
    path += `${started ? 'L' : 'M'} ${scaleX(i)} ${scaleY(v)} `;
    started = true;
  });
  return path.trim();
}
