import { formatCurrency, formatSigned } from '../format.js';

export function Navbar({ route, portfolio }) {
  return (
    <div className="navbar">
      <a className="brand" href="#/">
        <span className="dot" />
        QuantPulse
      </a>
      <div className="nav-links">
        <a className={`nav-link ${route === 'dashboard' ? 'active' : ''}`} href="#/">
          Dashboard
        </a>
        <a className={`nav-link ${route === 'portfolio' ? 'active' : ''}`} href="#/portfolio">
          Portfolio
        </a>
      </div>
      <div className="nav-cash">
        {portfolio ? (
          <>
            <span className="nav-cash-label">Total</span>
            <strong>{formatCurrency(portfolio.totalValue)}</strong>
            <span className={portfolio.totalGain >= 0 ? 'up' : 'down'}>
              {formatSigned(portfolio.totalGainPercent, { percent: true })}
            </span>
          </>
        ) : (
          <span>Loading…</span>
        )}
      </div>
    </div>
  );
}
