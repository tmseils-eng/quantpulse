/** Sharpe ratio, max drawdown, and annualized volatility for the portfolio's value history. */
export function RiskStats({ risk }) {
  if (!risk) return null;

  const { sharpeRatio, maxDrawdownPercent, volatilityPercent } = risk;
  const hasEnoughHistory = sharpeRatio != null;

  return (
    <div className="card grid grid-summary" style={{ marginBottom: 16 }}>
      <div className="stat">
        <span className="label">Sharpe ratio (ann.)</span>
        <span className="value">{hasEnoughHistory ? sharpeRatio.toFixed(2) : '—'}</span>
      </div>
      <div className="stat">
        <span className="label">Max drawdown</span>
        <span className="value">{maxDrawdownPercent != null ? `${maxDrawdownPercent.toFixed(2)}%` : '—'}</span>
      </div>
      <div className="stat">
        <span className="label">Volatility (ann.)</span>
        <span className="value">{volatilityPercent != null ? `${volatilityPercent.toFixed(2)}%` : '—'}</span>
      </div>
      {!hasEnoughHistory && (
        <div className="subtitle" style={{ gridColumn: '1 / -1' }}>
          Trade a bit more to build up enough history for Sharpe/volatility to be meaningful.
        </div>
      )}
    </div>
  );
}
