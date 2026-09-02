import { useState } from 'react';
import { api } from '../api.js';
import { usePolling } from '../usePolling.js';
import { HoldingsTable } from '../components/HoldingsTable.jsx';
import { TransactionHistory } from '../components/TransactionHistory.jsx';
import { OpenOrders } from '../components/OpenOrders.jsx';
import { LineChart } from '../components/LineChart.jsx';
import { RiskStats } from '../components/RiskStats.jsx';
import { formatCurrency, formatSigned } from '../format.js';

export function PortfolioPage({ portfolio, onRefreshPortfolio }) {
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const { data: transactions } = usePolling(() => api.getTransactions(), 15_000);
  const { data: history } = usePolling(() => api.getPortfolioHistory(), 15_000);
  const { data: orders, refresh: refreshOrders } = usePolling(() => api.getOrders(), 15_000);

  async function handleCancelOrder(id) {
    await api.cancelOrder(id);
    await refreshOrders();
    await onRefreshPortfolio();
  }

  async function handleReset() {
    setResetting(true);
    try {
      await api.resetPortfolio();
      await onRefreshPortfolio();
      setConfirmingReset(false);
    } finally {
      setResetting(false);
    }
  }

  if (!portfolio) {
    return (
      <div className="page">
        <div className="loading">Loading portfolio…</div>
      </div>
    );
  }

  const isUp = portfolio.totalGain >= 0;
  const points = history?.map((h) => h.total_value) || [];
  const startingCash = round2(portfolio.totalValue - portfolio.totalGain);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Portfolio</h1>
          <div className="subtitle">Paper trading · started at {formatCurrency(startingCash)}</div>
        </div>
        {!confirmingReset ? (
          <button className="btn btn-ghost" onClick={() => setConfirmingReset(true)}>
            Reset portfolio
          </button>
        ) : (
          <div className="inline-form">
            <span className="subtitle" style={{ alignSelf: 'center' }}>
              Erase all trades and restore cash?
            </span>
            <button className="btn btn-sell" onClick={handleReset} disabled={resetting}>
              {resetting ? 'Resetting…' : 'Confirm reset'}
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirmingReset(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>

      <div className="card grid grid-summary" style={{ marginBottom: 16 }}>
        <div className="stat">
          <span className="label">Total value</span>
          <span className="value">{formatCurrency(portfolio.totalValue)}</span>
        </div>
        <div className="stat">
          <span className="label">Cash</span>
          <span className="value">{formatCurrency(portfolio.cash)}</span>
        </div>
        <div className="stat">
          <span className="label">Holdings value</span>
          <span className="value">{formatCurrency(portfolio.holdingsValue)}</span>
        </div>
        <div className="stat">
          <span className="label">All-time gain/loss</span>
          <span className={`delta ${isUp ? 'up' : 'down'}`}>
            {formatSigned(portfolio.totalGain, { decimals: 2 })} (
            {formatSigned(portfolio.totalGainPercent, { percent: true })})
          </span>
        </div>
      </div>

      <RiskStats risk={portfolio.risk} />

      <div className="card">
        <div className="section-title">Value over time</div>
        <LineChart points={points} />
      </div>

      <div className="card">
        <div className="section-title">Holdings</div>
        <HoldingsTable holdings={portfolio.holdings} />
      </div>

      <div className="card">
        <div className="section-title">Orders</div>
        <OpenOrders orders={orders} onCancel={handleCancelOrder} />
      </div>

      <div className="card">
        <div className="section-title">Recent trades</div>
        <TransactionHistory transactions={transactions} />
      </div>
    </div>
  );
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
