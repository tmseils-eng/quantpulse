import { formatCurrency, formatDateTime, formatShares } from '../format.js';

export function TransactionHistory({ transactions }) {
  if (!transactions || transactions.length === 0) {
    return <div className="empty-state">No trades yet.</div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Side</th>
            <th>Symbol</th>
            <th>Shares</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((t) => (
            <tr key={t.id}>
              <td>{formatDateTime(t.created_at)}</td>
              <td>
                <span className={`badge ${t.side === 'BUY' ? 'badge-buy' : 'badge-sell'}`}>{t.side}</span>
              </td>
              <td className="symbol-cell">{t.symbol}</td>
              <td>{formatShares(t.shares)}</td>
              <td>{formatCurrency(t.price)}</td>
              <td>{formatCurrency(t.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
