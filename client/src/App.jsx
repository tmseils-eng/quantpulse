import { api } from './api.js';
import { usePolling } from './usePolling.js';
import { useHashRoute } from './useHashRoute.js';
import { Navbar } from './components/Navbar.jsx';
import { Dashboard } from './pages/Dashboard.jsx';
import { StockDetail } from './pages/StockDetail.jsx';
import { PortfolioPage } from './pages/PortfolioPage.jsx';

export function App() {
  const nav = useHashRoute();
  const { data: portfolio, refresh: refreshPortfolio } = usePolling(
    () => api.getPortfolio(),
    15_000
  );

  return (
    <div className="app-shell">
      <Navbar route={nav.route} portfolio={portfolio} />

      {nav.route === 'dashboard' && <Dashboard portfolio={portfolio} />}

      {nav.route === 'stock' && (
        <StockDetail
          symbol={nav.symbol}
          portfolio={portfolio}
          onTrade={api.trade}
          onRefreshPortfolio={refreshPortfolio}
        />
      )}

      {nav.route === 'portfolio' && (
        <PortfolioPage portfolio={portfolio} onRefreshPortfolio={refreshPortfolio} />
      )}

      <div className="footer-note">
        QuantPulse — simulated market data unless ALPHA_VANTAGE_KEY is set. Paper trading only.
      </div>
    </div>
  );
}
