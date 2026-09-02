# QuantPulse

A paper-trading stock market dashboard. Track a watchlist, chart price history with
technical indicators, and trade against a $100,000 virtual portfolio with realistic
cost-basis and P&L accounting — all built on a small, dependency-light JavaScript stack.

- **Backend:** Node.js + Express, persisted with `node:sqlite` (Node's built-in SQLite —
  no native module install, no build step)
- **Frontend:** React 19, bundled with esbuild directly (no framework CLI), hand-rolled
  SVG charts (no charting library), custom hash-based routing (no router library)
- **Tests:** Node's built-in test runner, run against a real in-memory SQLite database —
  not mocks

## Why it's built this way

Most portfolio projects reach for Vite + Tailwind + a charting library + a router by
default. QuantPulse intentionally uses fewer, more fundamental tools instead: `node:sqlite`
over `better-sqlite3` (zero native compilation), esbuild directly over a bundler CLI,
hand-written SVG over Recharts/Chart.js, and a ~30-line hash router over React Router.
The result installs faster, has a smaller dependency surface, and — more importantly —
meant writing the parts that usually come from a library, which is where the interesting
engineering actually is (chart geometry and scaling, cost-basis-weighted average pricing,
Wilder's RSI smoothing, atomic trade transactions).

## Features

- **Watchlist** — add/remove symbols, quotes auto-refresh every 20s
- **Stock detail** — price chart with SMA(20)/SMA(50) overlays and a volume histogram,
  an RSI(14) panel with overbought/oversold bands, annualized volatility, and a hover
  crosshair with tooltip
- **Paper trading** — buy/sell at the current simulated price, with cost-basis-weighted
  average pricing on repeated buys, realized/unrealized gain tracking, and a full
  transaction history
- **Portfolio** — total value, cash, holdings table, gain/loss, and a value-over-time
  chart that updates with every trade
- **Simulated market data by default** — deterministic per-symbol random walks (seeded,
  not truly random) so quotes are stable across requests and don't require an API key to
  run. Drop in a free [Alpha Vantage](https://www.alphavantage.co/support/#api-key) key
  to pull real daily price history instead — the app doesn't need any code changes.

## Getting started

Requires **Node 22.5+** (for the built-in `node:sqlite` module).

```bash
git clone https://github.com/<your-username>/quantpulse.git
cd quantpulse
npm install          # installs both workspaces (server + client)

npm run dev:server   # terminal 1 — API on http://localhost:4000
npm run dev:client   # terminal 2 — app on http://localhost:5173
```

Open `http://localhost:5173`. The default watchlist (AAPL, MSFT, NVDA, TSLA, AMZN) and a
$100,000 cash balance are seeded automatically on first run.

To use real market data instead of the simulator, set an API key before starting the
server:

```bash
ALPHA_VANTAGE_KEY=your_key_here npm run dev:server
```

### Running the tests

```bash
npm test
```

26 tests cover the technical indicator math (SMA/EMA/RSI/volatility against
hand-computed values), the market data provider (bar integrity, quote/history
consistency), and the trading engine (cost-basis averaging, insufficient-cash and
overselling rejections, atomic rollback on failed trades) — the last group runs against
a real in-memory SQLite database rather than a mock, so it's exercising the actual SQL.

### Production build

```bash
npm run build              # bundles the client into client/dist
npm start --workspace server   # serves the API and the built client from one process
```

## Project structure

```
quantpulse/
├── server/
│   ├── src/
│   │   ├── db.js           # SQLite schema + seed data (node:sqlite)
│   │   ├── marketData.js   # simulated & real (Alpha Vantage) quote/history providers
│   │   ├── indicators.js   # SMA, EMA, RSI, daily returns, volatility
│   │   ├── portfolio.js    # buy/sell engine, P&L, atomic transactions
│   │   └── routes/         # Express route handlers
│   └── tests/               # node:test suites
└── client/
    ├── build.js             # esbuild dev server + production build script
    └── src/
        ├── components/      # PriceChart, RsiChart, LineChart (all hand-rolled SVG), etc.
        ├── pages/           # Dashboard, StockDetail, PortfolioPage
        ├── api.js           # fetch wrapper for the backend
        └── useHashRoute.js  # minimal client-side router
```

## Notes on the trading engine

Every trade is recorded as `shares × price` against the position's cost basis. A second
buy of the same symbol at a different price re-weights the average cost
(`(existingShares × existingAvgCost + newShares × newPrice) / totalShares`), matching how
brokerages report average cost for a position. Buys and sells run inside a SQL
transaction, so a trade either fully applies (cash, holdings, and the transaction log all
update together) or fully rolls back — verified in `tests/portfolio.test.js` by asserting
that a rejected order leaves cash and the transaction log untouched.

## License

MIT
