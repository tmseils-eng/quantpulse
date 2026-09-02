import { formatCurrency, formatShares, formatSigned, formatSignedCurrency } from '../format.js';

export function HoldingsTable({ holdings }) {
  if (!holdings || holdings.length === 0) {
    return <div className="empty-state">No open positions. Buy something from a stock page to get started.</div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Shares</th>
            <th>Avg cost</th>
            <th>Price</th>
            <th>Market value</th>
            <th>Gain/loss</th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => (
            <tr key={h.symbol}>
              <td className="symbol-cell">
                <a href={`#/stock/${h.symbol}`}>{h.symbol}</a>
              </td>
              <td>{formatShares(h.shares)}</td>
              <td>{formatCurrency(h.avgCost)}</td>
              <td>{formatCurrency(h.currentPrice)}</td>
              <td>{formatCurrency(h.marketValue)}</td>
              <td className={h.gain >= 0 ? 'up' : 'down'}>
                {formatSignedCurrency(h.gain)} ({formatSigned(h.gainPercent, { percent: true })})
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
