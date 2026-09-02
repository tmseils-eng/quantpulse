import { useMemo } from 'react';

const WIDTH = 760;
const HEIGHT = 90;
const PAD = { top: 8, right: 12, bottom: 8, left: 12 };

/**
 * MACD panel: histogram bars (macd - signal) plus the MACD and signal lines
 * themselves, hand-rolled SVG in the same style as RsiChart/PriceChart.
 */
export function MacdChart({ macd }) {
  const geometry = useMemo(() => buildGeometry(macd), [macd]);

  if (!macd || !macd.macd || macd.macd.every((v) => v == null)) {
    return null;
  }

  const latestMacd = [...macd.macd].reverse().find((v) => v != null);
  const latestSignal = [...macd.signal].reverse().find((v) => v != null);

  return (
    <div className="chart-wrap">
      <div className="legend">
        <div className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--accent)' }} />
          MACD{latestMacd != null ? ` · ${latestMacd.toFixed(2)}` : ''}
        </div>
        <div className="legend-item">
          <span className="legend-swatch" style={{ background: '#e2b93b' }} />
          Signal{latestSignal != null ? ` · ${latestSignal.toFixed(2)}` : ''}
        </div>
        <div className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--text-faint)' }} />
          Histogram
        </div>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
        <line
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={geometry.zeroY}
          y2={geometry.zeroY}
          stroke="var(--text-faint)"
          strokeDasharray="2,3"
        />
        {geometry.histBars.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.width}
            height={b.height}
            fill={b.positive ? 'var(--accent)' : 'var(--text-faint)'}
            opacity="0.5"
          />
        ))}
        <path d={geometry.macdPath} fill="none" stroke="var(--accent)" strokeWidth="1.5" />
        <path d={geometry.signalPath} fill="none" stroke="#e2b93b" strokeWidth="1.25" opacity="0.9" />
      </svg>
    </div>
  );
}

function buildGeometry(macd) {
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;

  if (!macd || !macd.macd) {
    return { macdPath: '', signalPath: '', histBars: [], zeroY: HEIGHT / 2 };
  }

  const { macd: macdLine, signal, histogram } = macd;
  const allValues = [...macdLine, ...signal, ...histogram].filter((v) => v != null);
  if (allValues.length === 0) {
    return { macdPath: '', signalPath: '', histBars: [], zeroY: HEIGHT / 2 };
  }

  const maxAbs = Math.max(...allValues.map(Math.abs), 0.01);
  const scaleX = (i) => PAD.left + (i / (macdLine.length - 1)) * innerWidth;
  const scaleY = (v) => PAD.top + innerHeight / 2 - (v / maxAbs) * (innerHeight / 2);

  const pathFromSeries = (series) => {
    let path = '';
    let started = false;
    series.forEach((v, i) => {
      if (v == null) return;
      path += `${started ? 'L' : 'M'} ${scaleX(i)} ${scaleY(v)} `;
      started = true;
    });
    return path.trim();
  };

  const barWidth = Math.max(innerWidth / macdLine.length - 1, 1);
  const zeroY = scaleY(0);
  const histBars = histogram
    .map((v, i) => {
      if (v == null) return null;
      const y = scaleY(v);
      return {
        x: scaleX(i) - barWidth / 2,
        y: v >= 0 ? y : zeroY,
        width: barWidth,
        height: Math.abs(y - zeroY),
        positive: v >= 0,
      };
    })
    .filter(Boolean);

  return {
    macdPath: pathFromSeries(macdLine),
    signalPath: pathFromSeries(signal),
    histBars,
    zeroY,
  };
}
