import { useMemo, useRef, useState } from 'react';
import { formatCurrency, formatDate } from '../format.js';

const WIDTH = 760;
const HEIGHT = 280;
const PAD = { top: 16, right: 12, bottom: 24, left: 12 };

/**
 * Hand-rolled SVG price chart: close-price line with an area fill, optional
 * SMA20/SMA50 overlays, a light volume histogram along the bottom, and a
 * hover crosshair with a tooltip. No charting library — just a viewBox,
 * some scale math, and pointer events.
 */
export function PriceChart({ bars, sma20, sma50, showSma = true, bollinger, showBollinger, vwap, showVwap }) {
  const [hoverIndex, setHoverIndex] = useState(null);
  const svgRef = useRef(null);

  const {
    linePath,
    areaPath,
    sma20Path,
    sma50Path,
    bollingerUpperPath,
    bollingerLowerPath,
    vwapPath,
    volumeBars,
    scaleX,
    scaleY,
  } = useMemo(
    () => buildGeometry(bars, sma20, sma50, showBollinger ? bollinger : null, showVwap ? vwap : null),
    [bars, sma20, sma50, bollinger, showBollinger, vwap, showVwap]
  );

  if (!bars || bars.length < 2) {
    return <div className="chart-empty">Not enough history to chart yet.</div>;
  }

  const innerWidth = WIDTH - PAD.left - PAD.right;

  function handleMove(evt) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((evt.clientX - rect.left) / rect.width) * WIDTH;
    const relative = (px - PAD.left) / innerWidth;
    const idx = Math.round(relative * (bars.length - 1));
    setHoverIndex(Math.min(Math.max(idx, 0), bars.length - 1));
  }

  const hovered = hoverIndex !== null ? bars[hoverIndex] : bars[bars.length - 1];
  const hoverX = scaleX(hoverIndex !== null ? hoverIndex : bars.length - 1);

  return (
    <div className="chart-wrap">
      <div className="legend">
        <div className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--accent)' }} />
          Close
        </div>
        {showSma && (
          <>
            <div className="legend-item">
              <span className="legend-swatch" style={{ background: '#e2b93b' }} />
              SMA 20
            </div>
            <div className="legend-item">
              <span className="legend-swatch" style={{ background: '#9d6bff' }} />
              SMA 50
            </div>
          </>
        )}
        {showBollinger && bollingerUpperPath && (
          <div className="legend-item">
            <span className="legend-swatch" style={{ background: '#5ecbb0' }} />
            Bollinger (20, 2σ)
          </div>
        )}
        {showVwap && vwapPath && (
          <div className="legend-item">
            <span className="legend-swatch" style={{ background: '#f2789f' }} />
            VWAP
          </div>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* volume histogram */}
        {volumeBars.map((v, i) => (
          <rect
            key={i}
            x={v.x}
            y={v.y}
            width={v.width}
            height={v.height}
            fill="var(--border)"
          />
        ))}

        <path d={areaPath} fill="url(#priceFill)" stroke="none" />
        <path d={linePath} fill="none" stroke="var(--accent)" strokeWidth="1.75" />
        {showSma && sma20Path && (
          <path d={sma20Path} fill="none" stroke="#e2b93b" strokeWidth="1.25" opacity="0.85" />
        )}
        {showSma && sma50Path && (
          <path d={sma50Path} fill="none" stroke="#9d6bff" strokeWidth="1.25" opacity="0.85" />
        )}
        {showBollinger && bollingerUpperPath && (
          <path d={bollingerUpperPath} fill="none" stroke="#5ecbb0" strokeWidth="1" strokeDasharray="3,2" opacity="0.8" />
        )}
        {showBollinger && bollingerLowerPath && (
          <path d={bollingerLowerPath} fill="none" stroke="#5ecbb0" strokeWidth="1" strokeDasharray="3,2" opacity="0.8" />
        )}
        {showVwap && vwapPath && (
          <path d={vwapPath} fill="none" stroke="#f2789f" strokeWidth="1.25" opacity="0.85" />
        )}

        {/* hover crosshair */}
        <line
          x1={hoverX}
          x2={hoverX}
          y1={PAD.top}
          y2={HEIGHT - PAD.bottom}
          stroke="var(--text-faint)"
          strokeWidth="1"
          strokeDasharray="3,3"
        />
        <circle cx={hoverX} cy={scaleY(hovered.close)} r="3.5" fill="var(--accent)" />

        <text x={PAD.left} y={HEIGHT - 6} fontSize="10" fill="var(--text-faint)">
          {formatDate(bars[0].date)}
        </text>
        <text
          x={WIDTH - PAD.right}
          y={HEIGHT - 6}
          fontSize="10"
          fill="var(--text-faint)"
          textAnchor="end"
        >
          {formatDate(bars[bars.length - 1].date)}
        </text>
      </svg>

      <div className="chart-tooltip mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        {formatDate(hovered.date)} · {formatCurrency(hovered.close)}
        {showSma && sma20?.[hoverIndex ?? bars.length - 1] != null && (
          <span style={{ color: '#e2b93b' }}> · SMA20 {formatCurrency(sma20[hoverIndex ?? bars.length - 1])}</span>
        )}
        {showSma && sma50?.[hoverIndex ?? bars.length - 1] != null && (
          <span style={{ color: '#9d6bff' }}> · SMA50 {formatCurrency(sma50[hoverIndex ?? bars.length - 1])}</span>
        )}
      </div>
    </div>
  );
}

function buildGeometry(bars, sma20, sma50, bollinger, vwap) {
  const innerWidth = WIDTH - PAD.left - PAD.right;
  const innerHeight = HEIGHT - PAD.top - PAD.bottom;

  if (!bars || bars.length < 2) {
    return { linePath: '', areaPath: '', volumeBars: [], scaleX: () => 0, scaleY: () => 0 };
  }

  const closes = bars.map((b) => b.close);
  const overlayValues = [
    ...(sma20 || []),
    ...(sma50 || []),
    ...(bollinger?.upper || []),
    ...(bollinger?.lower || []),
    ...(vwap || []),
  ].filter((v) => v != null);
  const allValues = [...closes, ...overlayValues];
  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const yPad = (yMax - yMin) * 0.08 || 1;

  const scaleX = (i) => PAD.left + (i / (bars.length - 1)) * innerWidth;
  const scaleY = (v) =>
    PAD.top + innerHeight - ((v - (yMin - yPad)) / (yMax + yPad - (yMin - yPad))) * innerHeight;

  const linePath = closes.map((c, i) => `${i === 0 ? 'M' : 'L'} ${scaleX(i)} ${scaleY(c)}`).join(' ');
  const areaPath =
    `${linePath} L ${scaleX(bars.length - 1)} ${HEIGHT - PAD.bottom} ` +
    `L ${scaleX(0)} ${HEIGHT - PAD.bottom} Z`;

  const pathFromSeries = (series) => {
    if (!series) return '';
    let path = '';
    let started = false;
    series.forEach((v, i) => {
      if (v == null) return;
      path += `${started ? 'L' : 'M'} ${scaleX(i)} ${scaleY(v)} `;
      started = true;
    });
    return path.trim();
  };

  const maxVolume = Math.max(...bars.map((b) => b.volume || 0), 1);
  const volumeBandHeight = 28;
  const volumeBars = bars.map((b, i) => {
    const h = ((b.volume || 0) / maxVolume) * volumeBandHeight;
    return {
      x: scaleX(i) - innerWidth / bars.length / 2,
      y: HEIGHT - PAD.bottom - h,
      width: Math.max(innerWidth / bars.length - 1, 1),
      height: h,
    };
  });

  return {
    linePath,
    areaPath,
    sma20Path: pathFromSeries(sma20),
    sma50Path: pathFromSeries(sma50),
    bollingerUpperPath: pathFromSeries(bollinger?.upper),
    bollingerLowerPath: pathFromSeries(bollinger?.lower),
    vwapPath: pathFromSeries(vwap),
    volumeBars,
    scaleX,
    scaleY,
    yMin,
    yMax,
  };
}
