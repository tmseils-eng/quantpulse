import { api } from '../api.js';
import { usePolling } from '../usePolling.js';
import { QuoteCard } from '../components/QuoteCard.jsx';
import { AddSymbolForm } from '../components/AddSymbolForm.jsx';
import { formatCurrency, formatSigned } from '../format.js';

export function Dashboard({ portfolio }) {
  const { data: watchlist, loading, error, refresh } = usePolling(
    () => api.getWatchlist(),
    20_000
  );

  async function handleAdd(symbol) {
    await api.addToWatchlist(symbol);
    await refresh();
  }

  async function handleRemove(symbol) {
    await api.removeFromWatchlist(symbol);
    await refresh();
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Watchlist</h1>
          <div className="subtitle">Quotes refresh automatically every 20s</div>
        </div>
        <AddSymbolForm onAdd={handleAdd} />
      </div>

      {portfolio && (
        <div className="card grid grid-summary" style={{ marginBottom: 20 }}>
          <div className="stat">
            <span className="label">Portfolio value</span>
            <span className="value">{formatCurrency(portfolio.totalValue)}</span>
          </div>
          <div className="stat">
            <span className="label">Cash</span>
            <span className="value">{formatCurrency(portfolio.cash)}</span>
          </div>
          <div className="stat">
            <span className="label">Total gain/loss</span>
            <span className={`delta ${portfolio.totalGain >= 0 ? 'up' : 'down'}`}>
              {formatSigned(portfolio.totalGain, { decimals: 2 })} (
              {formatSigned(portfolio.totalGainPercent, { percent: true })})
            </span>
          </div>
          <div className="stat">
            <span className="label">Open positions</span>
            <span className="value">{portfolio.holdings.length}</span>
          </div>
        </div>
      )}

      {loading && !watchlist && <div className="loading">Loading quotes…</div>}
      {error && <div className="trade-error">Couldn't load the watchlist: {error.message}</div>}

      {watchlist && watchlist.length === 0 && (
        <div className="empty-state">Your watchlist is empty — add a symbol above.</div>
      )}

      {watchlist && watchlist.length > 0 && (
        <div className="grid grid-watchlist">
          {watchlist.map((q) => (
            <QuoteCard key={q.symbol} quote={q} onRemove={handleRemove} />
          ))}
        </div>
      )}
    </div>
  );
}
