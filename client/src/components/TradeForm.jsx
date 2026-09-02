import { useMemo, useState } from 'react';
import { formatCurrency } from '../format.js';

export function TradeForm({ symbol, price, cash, ownedShares, onTrade }) {
  const [side, setSide] = useState('BUY');
  const [shares, setShares] = useState('');
  const [status, setStatus] = useState(null); // { type: 'error' | 'success', message }
  const [busy, setBusy] = useState(false);

  const numShares = Number(shares) || 0;
  const estTotal = numShares * (price || 0);
  const maxAffordableShares = price ? Math.floor((cash / price) * 100) / 100 : 0;

  const invalid =
    numShares <= 0 ||
    !price ||
    (side === 'BUY' && estTotal > cash + 0.01) ||
    (side === 'SELL' && numShares > (ownedShares || 0) + 1e-9);

  async function handleSubmit(e) {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    setStatus(null);
    try {
      await onTrade({ symbol, side, shares: numShares, price });
      setStatus({ type: 'success', message: `${side === 'BUY' ? 'Bought' : 'Sold'} ${numShares} share${numShares === 1 ? '' : 's'} of ${symbol}.` });
      setShares('');
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="trade-form" onSubmit={handleSubmit}>
      <div className="trade-side-toggle">
        <button
          type="button"
          className={side === 'BUY' ? 'active-buy' : ''}
          onClick={() => setSide('BUY')}
        >
          Buy
        </button>
        <button
          type="button"
          className={side === 'SELL' ? 'active-sell' : ''}
          onClick={() => setSide('SELL')}
        >
          Sell
        </button>
      </div>

      <div className="field-row">
        <label htmlFor="shares">Shares</label>
        <input
          id="shares"
          className="text-input"
          type="number"
          min="0"
          step="0.01"
          placeholder="0"
          value={shares}
          onChange={(e) => setShares(e.target.value)}
        />
      </div>

      <div className="trade-summary">
        <span>Est. {side === 'BUY' ? 'cost' : 'proceeds'}</span>
        <span className="mono">{formatCurrency(estTotal)}</span>
      </div>
      {side === 'BUY' && (
        <div className="trade-summary">
          <span>Buying power</span>
          <span className="mono">{formatCurrency(cash)} ({maxAffordableShares} sh max)</span>
        </div>
      )}
      {side === 'SELL' && (
        <div className="trade-summary">
          <span>Shares held</span>
          <span className="mono">{ownedShares || 0}</span>
        </div>
      )}

      {status?.type === 'error' && <div className="trade-error">{status.message}</div>}
      {status?.type === 'success' && <div className="trade-success">{status.message}</div>}

      <button
        className={`btn ${side === 'BUY' ? 'btn-buy' : 'btn-sell'}`}
        type="submit"
        disabled={invalid || busy}
      >
        {busy ? 'Placing order…' : `${side === 'BUY' ? 'Buy' : 'Sell'} ${symbol}`}
      </button>
    </form>
  );
}
