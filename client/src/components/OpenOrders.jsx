import { formatCurrency, formatDateTime, formatShares } from '../format.js';

const STATUS_LABEL = { PENDING: 'Open', FILLED: 'Filled', CANCELLED: 'Cancelled' };

/** Order book table: every limit order placed, with a cancel action while it's still open. */
export function OpenOrders({ orders, onCancel }) {
  if (!orders || orders.length === 0) {
    return <div className="empty-state">No orders yet — limit orders you place will show up here.</div>;
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>
            <th>Placed</th>
            <th>Symbol</th>
            <th>Side</th>
            <th>Shares</th>
            <th>Limit</th>
            <th>Status</th>
            <th>Filled at</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{formatDateTime(o.created_at)}</td>
              <td className="symbol-cell">{o.symbol}</td>
              <td>
                <span className={`badge ${o.side === 'BUY' ? 'badge-buy' : 'badge-sell'}`}>{o.side}</span>
              </td>
              <td>{formatShares(o.shares)}</td>
              <td>{formatCurrency(o.limit_price)}</td>
              <td>{STATUS_LABEL[o.status] || o.status}</td>
              <td>{o.filled_price != null ? formatCurrency(o.filled_price) : '—'}</td>
              <td>
                {o.status === 'PENDING' && (
                  <button className="btn btn-ghost" onClick={() => onCancel(o.id)}>
                    Cancel
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
