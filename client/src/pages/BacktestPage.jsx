import { useState } from 'react';
import { api } from '../api.js';
import { LineChart } from '../components/LineChart.jsx';
import { RiskStats } from '../components/RiskStats.jsx';
import { formatCurrency, formatSigned, formatDate } from '../format.js';

const SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN', 'GOOGL', 'META', 'JPM', 'V', 'DIS'];
const DAY_OPTIONS = [
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
  { label: '2Y', days: 730 },
];

/**
 * Backtest a simple long/flat strategy (SMA crossover or RSI mean-reversion)
 * against a symbol's simulated price history. This runs against QuantPulse's
 * own market simulator, not real historical prices, so it's a demonstration
 * of the backtesting mechanics rather than a real trading research tool.
 */
export function BacktestPage() {
  const [symbol, setSymbol] = useState('AAPL');
  const [days, setDays] = useState(365);
  const [strategy, setStrategy] = useState('sma_crossover');
  const [fastPeriod, setFastPeriod] = useState(20);
  const [slowPeriod, setSlowPeriod] = useState(50);
  const [rsiPeriod, setRsiPeriod] = useState(14);
  const [oversold, setOversold] = useState(30);
  const [overbought, setOverbought] = useState(70);
  const [startingCash, setStartingCash] = useState(100_000);

  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleRun(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const params =
        strategy === 'sma_crossover'
          ? { fastPeriod: Number(fastPeriod), slowPeriod: Number(slowPeriod) }
          : { rsiPeriod: Number(rsiPeriod), oversold: Number(oversold), overbought: Number(overbought) };
      const res = await api.runBacktest({
        symbol,
        days,
        strategy,
        startingCash: Number(startingCash),
        ...params,
      });
      setResult(res);
    } catch (err) {
      setError(err.message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const isUp = result && result.totalReturnPercent >= 0;
  const beatBuyAndHold = result && result.totalReturnPercent >= result.buyAndHoldReturnPercent;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Backtest</h1>
          <div className="subtitle">
            Run a simple strategy against a symbol's simulated price history and compare it to buy-and-hold.
          </div>
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="section-title">Setup</div>
          <form onSubmit={handleRun}>
            <div className="field-row">
              <label htmlFor="bt-symbol">Symbol</label>
              <select id="bt-symbol" className="text-input" value={symbol} onChange={(e) => setSymbol(e.target.value)}>
                {SYMBOLS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-row">
              <label htmlFor="bt-days">History</label>
              <select id="bt-days" className="text-input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                {DAY_OPTIONS.map((d) => (
                  <option key={d.days} value={d.days}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-row">
              <label htmlFor="bt-strategy">Strategy</label>
              <select
                id="bt-strategy"
                className="text-input"
                value={strategy}
                onChange={(e) => setStrategy(e.target.value)}
              >
                <option value="sma_crossover">SMA crossover</option>
                <option value="rsi">RSI mean-reversion</option>
              </select>
            </div>

            {strategy === 'sma_crossover' ? (
              <>
                <div className="field-row">
                  <label htmlFor="bt-fast">Fast SMA period</label>
                  <input
                    id="bt-fast"
                    className="text-input"
                    type="number"
                    min="2"
                    value={fastPeriod}
                    onChange={(e) => setFastPeriod(e.target.value)}
                  />
                </div>
                <div className="field-row">
                  <label htmlFor="bt-slow">Slow SMA period</label>
                  <input
                    id="bt-slow"
                    className="text-input"
                    type="number"
                    min="3"
                    value={slowPeriod}
                    onChange={(e) => setSlowPeriod(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="field-row">
                  <label htmlFor="bt-rsi-period">RSI period</label>
                  <input
                    id="bt-rsi-period"
                    className="text-input"
                    type="number"
                    min="2"
                    value={rsiPeriod}
                    onChange={(e) => setRsiPeriod(e.target.value)}
                  />
                </div>
                <div className="field-row">
                  <label htmlFor="bt-oversold">Buy below RSI</label>
                  <input
                    id="bt-oversold"
                    className="text-input"
                    type="number"
                    min="1"
                    max="99"
                    value={oversold}
                    onChange={(e) => setOversold(e.target.value)}
                  />
                </div>
                <div className="field-row">
                  <label htmlFor="bt-overbought">Sell above RSI</label>
                  <input
                    id="bt-overbought"
                    className="text-input"
                    type="number"
                    min="1"
                    max="99"
                    value={overbought}
                    onChange={(e) => setOverbought(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="field-row">
              <label htmlFor="bt-cash">Starting cash</label>
              <input
                id="bt-cash"
                className="text-input"
                type="number"
                min="1"
                value={startingCash}
                onChange={(e) => setStartingCash(e.target.value)}
              />
            </div>

            {error && <div className="trade-error">{error}</div>}

            <button className="btn btn-buy" type="submit" disabled={busy} style={{ width: '100%', marginTop: 8 }}>
              {busy ? 'Running…' : 'Run backtest'}
            </button>
          </form>
        </div>

        <div>
          {!result && !busy && (
            <div className="card">
              <div className="loading">Configure a strategy and run it to see results here.</div>
            </div>
          )}

          {result && (
            <>
              <div className="card grid grid-summary" style={{ marginBottom: 16 }}>
                <div className="stat">
                  <span className="label">Strategy return</span>
                  <span className={`delta ${isUp ? 'up' : 'down'}`}>
                    {formatSigned(result.totalReturnPercent, { percent: true })}
                  </span>
                </div>
                <div className="stat">
                  <span className="label">Buy &amp; hold return</span>
                  <span className="delta">{formatSigned(result.buyAndHoldReturnPercent, { percent: true })}</span>
                </div>
                <div className="stat">
                  <span className="label">Trades</span>
                  <span className="value">{result.tradeCount}</span>
                </div>
                <div className="stat">
                  <span className="label">Win rate</span>
                  <span className="value">{result.winRate != null ? `${result.winRate}%` : '—'}</span>
                </div>
              </div>

              <div className="subtitle" style={{ marginBottom: 12 }}>
                {beatBuyAndHold ? 'Beat' : 'Underperformed'} buy-and-hold on this run over {result.barsUsed} trading
                days · final value {formatCurrency(result.finalValue)}
              </div>

              <RiskStats risk={result.risk} />

              <div className="card">
                <div className="section-title">Equity curve</div>
                <LineChart points={result.equityCurve} />
              </div>

              <div className="card">
                <div className="section-title">Trade log</div>
                {result.trades.length === 0 ? (
                  <div className="empty-state">No trades triggered over this window.</div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Side</th>
                          <th>Price</th>
                          <th>Shares</th>
                          <th>P&amp;L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.trades.map((t, i) => (
                          <tr key={i}>
                            <td>{formatDate(t.date)}</td>
                            <td>
                              <span className={`badge ${t.side.startsWith('BUY') ? 'badge-buy' : 'badge-sell'}`}>
                                {t.side}
                              </span>
                            </td>
                            <td>{formatCurrency(t.price)}</td>
                            <td>{t.shares}</td>
                            <td>{t.pnlPercent != null ? formatSigned(t.pnlPercent, { percent: true }) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
