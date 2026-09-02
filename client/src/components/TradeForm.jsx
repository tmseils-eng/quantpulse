import { useMemo, useState } from 'react';
import { formatCurrency } from '../format.js';

export function TradeForm({ symbol, price, cash, ownedShares, onTrade }) {
  const [side, setSide] = useState('BUY');
  const [orderType, setOrderType] = useState('MARKET');
  const [shares, setShares] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [status, setStatus] = useState(null); // { type: 'error' | 'success', message }
  const [busy, setBusy] = useState(false);

  const numShares = Number(shares) || 0;
  const numLimitPrice = Number(limitPrice) || 0;
  const effectivePrice = orderType === 'LIMIT' ? numLimitPrice : price;
  const estTotal = numShares * (effectivePrice || 0);
  const maxAffordableShares = effectivePrice ? Math.floor((cash / effectivePrice) * 100) / 100 : 0;

  const invalid =
    numShares <= 0 ||
    !price ||
    (orderType === 'LIMIT' && numLimitPrice <= 0) ||
    (side === 'BUY' && estTotal > cash + 0.01) ||
    (side === 'SELL' && numShares > (ownedShares || 0) + 1e-9);

  async function handleSubmit(e) {
    e.preventDefault();
    if (invalid) return;
    setBusy(true);
    setStatus(null);
    try {
      await onTrade({
        symbol,
        side,
        shares: numShares,
        orderType,
        ...(orderType === 'LIMIT' ? { limitPrice: numLimitPrice } : {}),
      });
      setStatus({
        type: 'success',
        message:
          orderType === 'LIMIT'
            ? `Limit order placed: ${side.toLowerCase()} ${numShares} share${numShares === 1 ? '' : 's'} of ${symbol} at ${numLimitPrice}.`
            : `${side === 'BUY' ? 'Bought' : 'Sold'} ${numShares} share${numShares === 1 ? '' : 's'} of ${symbol}.`,
      });
      setShares('');
      setLimitPrice('');
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

      <div className="trade-side-toggle" style={{ marginBottom: 10 }}>
        <button
          type="button"
          className={orderType === 'MARKET' ? 'active-buy' : ''}
          onClick={() => setOrderType('MARKET')}
        >
          Market
        </button>
        <button
          type="button"
          className={orderType === 'LIMIT' ? 'active-buy' : ''}
          onClick={() => setOrderType('LIMIT')}
        >
          Limit
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

      {orderType === 'LIMIT' && (
        <div className="field-row">
          <label htmlFor="limitPrice">Limit price</label>
          <input
            id="limitPrice"
            className="text-input"
            type="number"
            min="0"
            step="0.01"
            placeholder={price ? String(price) : '0'}
            value={limitPrice}
            onChange={(e) => setLimitPrice(e.target.value)}
          />
        </div>
      )}

      {orderType === 'MARKET' && (
        <div className="trade-summary" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          <span>Large orders may fill away from the quote (slippage)</span>
        </div>
      )}

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
        {busy
          ? 'Placing order…'
          : orderType === 'LIMIT'
          ? `Place limit ${side.toLowerCase()} for ${symbol}`
          : `${side === 'BUY' ? 'Buy' : 'Sell'} ${symbol}`}
      </button>
    </form>
  );
}
