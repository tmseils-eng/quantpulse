import { useState } from 'react';
import { api } from '../api.js';
import { usePolling } from '../usePolling.js';
import { PriceChart } from '../components/PriceChart.jsx';
import { RsiChart } from '../components/RsiChart.jsx';
import { MacdChart } from '../components/MacdChart.jsx';
import { TradeForm } from '../components/TradeForm.jsx';
import { formatCurrency, formatSigned, formatNumber } from '../format.js';

const RANGES = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
];

export function StockDetail({ symbol, portfolio, onTrade, onRefreshPortfolio }) {
  const [rangeDays, setRangeDays] = useState(180);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showVwap, setShowVwap] = useState(false);

  const { data: quote, loading: quoteLoading, error: quoteError } = usePolling(
    () => api.getQuote(symbol),
    15_000,
    [symbol]
  );

  const { data: historyData, loading: historyLoading } = usePolling(
    () => api.getHistory(symbol, rangeDays),
    60_000,
    [symbol, rangeDays]
  );

  async function handleAddToWatchlist() {
    await api.addToWatchlist(symbol);
  }

  async function handleTrade(order) {
    await onTrade(order);
    await onRefreshPortfolio();
  }

  const holding = portfolio?.holdings.find((h) => h.symbol === symbol);
  const isUp = quote && quote.change >= 0;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>
            {symbol}
            {quote?.name && <span className="subtitle"> · {quote.name}</span>}
          </h1>
          <div className="subtitle">{quote?.sector || '—'}</div>
        </div>
        <button className="btn btn-ghost" onClick={handleAddToWatchlist}>
          + Watchlist
        </button>
      </div>

      {quoteLoading && !quote && <div className="loading">Loading {symbol}…</div>}
      {quoteError && <div className="trade-error">Couldn't load {symbol}: {quoteError.message}</div>}

      {quote && (
        <div className="card grid grid-summary" style={{ marginBottom: 16 }}>
          <div className="stat">
            <span className="label">Price</span>
            <span className="value">{formatCurrency(quote.price)}</span>
          </div>
          <div className="stat">
            <span className="label">Change</span>
            <span className={`delta ${isUp ? 'up' : 'down'}`}>
              {formatSigned(quote.change)} ({formatSigned(quote.changePercent, { percent: true })})
            </span>
          </div>
          <div className="stat">
            <span className="label">Day range</span>
            <span className="delta">
              {formatCurrency(quote.low)} – {formatCurrency(quote.high)}
            </span>
          </div>
          <div className="stat">
            <span className="label">Volatility (ann.)</span>
            <span className="delta">
              {historyData?.volatility != null ? `${formatNumber(historyData.volatility, 1)}%` : '—'}
            </span>
          </div>
        </div>
      )}

      <div className="two-col">
        <div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span className="section-title" style={{ margin: 0 }}>
                Price
              </span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={showBollinger} onChange={(e) => setShowBollinger(e.target.checked)} />
                  Bollinger
                </label>
                <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <input type="checkbox" checked={showVwap} onChange={(e) => setShowVwap(e.target.checked)} />
                  VWAP
                </label>
                <div className="segmented">
                  {RANGES.map((r) => (
                    <button
                      key={r.days}
                      className={rangeDays === r.days ? 'active' : ''}
                      onClick={() => setRangeDays(r.days)}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {historyLoading && !historyData && <div className="loading">Loading chart…</div>}
            {historyData && (
              <PriceChart
                bars={historyData.bars}
                sma20={historyData.indicators.sma20}
                sma50={historyData.indicators.sma50}
                bollinger={historyData.indicators.bollinger}
                showBollinger={showBollinger}
                vwap={historyData.indicators.vwap}
                showVwap={showVwap}
              />
            )}
          </div>

          {historyData && (
            <div className="card">
              <RsiChart rsi={historyData.indicators.rsi14} />
            </div>
          )}

          {historyData && (
            <div className="card">
              <MacdChart macd={historyData.indicators.macd} />
            </div>
          )}
        </div>

        <div className="card">
          <div className="section-title">Trade</div>
          {quote && portfolio ? (
            <TradeForm
              symbol={symbol}
              price={quote.price}
              cash={portfolio.cash}
              ownedShares={holding?.shares || 0}
              onTrade={handleTrade}
            />
          ) : (
            <div className="loading">Loading…</div>
          )}
        </div>
      </div>
    </div>
  );
}
