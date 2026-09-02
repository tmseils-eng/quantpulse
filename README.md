# QuantPulse

A paper-trading stock market dashboard with a real order book, a backtesting engine, and
portfolio risk metrics — built on a small, dependency-light JavaScript stack. Track a
watchlist, chart price history with technical indicators, place market or limit orders
against a $100,000 virtual portfolio with realistic cost-basis, slippage, and P&L
accounting, and backtest a strategy before you trade it.

- **Backend:** Node.js + Express, persisted with `node:sqlite` (Node's built-in SQLite —
  no native module install, no build step)
- **Frontend:** React 19, bundled with esbuild directly (no framework CLI), hand-rolled
  SVG charts (no charting library), custom hash-based routing (no router library)
- **Real-time:** a hand-rolled WebSocket server (RFC 6455 handshake + framing implemented
  directly over Node's `http`/`net`, no `ws` package) pushing live quote ticks to the
  dashboard
- **Tests:** Node's built-in test runner — 85+ tests, run against a real in-memory SQLite
  database and, for the WebSocket layer, a real handshake over a real TCP socket — not mocks

## Why it's built this way

Most portfolio projects reach for Vite + Tailwind + a charting library + a router + a
WebSocket library by default. QuantPulse intentionally uses fewer, more fundamental tools
instead: `node:sqlite` over `better-sqlite3` (zero native compilation), esbuild directly
over a bundler CLI, hand-written SVG over Recharts/Chart.js, a ~30-line hash router over
React Router, and a hand-rolled WebSocket server over the `ws` package. The result installs
faster, has a smaller dependency surface, and — more importantly — meant writing the parts
that usually come from a library, which is where the interesting engineering actually is:
chart geometry and scaling, cost-basis-weighted average pricing, Wilder's RSI smoothing,
atomic trade transactions, a square-root market-impact model, an order-matching sweep, a
backtesting loop, and the WebSocket frame protocol itself (masking, fragmentation, the
Sec-WebSocket-Accept handshake).

## Features

- **Watchlist** — add/remove symbols; quotes refresh every 20s over HTTP and get a live
  push overlay over WebSocket in between polls (shown with a "● live" badge when connected)
- **Stock detail** — price chart with SMA(20)/SMA(50)/Bollinger Bands/VWAP overlays and a
  volume histogram, an RSI(14) panel and a MACD panel, annualized volatility, and a hover
  crosshair with tooltip
- **Orders** — market orders (filled immediately, with a size-dependent slippage model —
  see below) and limit orders (rest on a real order book until price crosses the limit,
  with cash/shares reserved against other pending orders so you can't over-commit)
- **Market impact / slippage** — a square-root impact model (`impact ~ sqrt(order size /
  average volume)`, capped at 8%) means a large order actually moves your fill price, the
  same functional shape used in real transaction-cost-analysis models
- **Backtesting** — run an SMA-crossover or RSI mean-reversion strategy against a symbol's
  price history and see the trade log, equity curve, win rate, and a buy-and-hold
  comparison
- **Risk metrics** — Sharpe ratio, max drawdown, and annualized volatility, computed from
  the portfolio's value-over-time history (and from every backtest's equity curve, using
  the same math)
- **Portfolio** — total value, cash, holdings table, gain/loss, open orders with cancel,
  and a value-over-time chart that updates with every trade
- **Simulated market data by default** — deterministic per-symbol random walks (seeded,
  not truly random) so quotes are stable across requests and don't require an API key to
  run. Drop in a free [Alpha Vantage](https://www.alphavantage.co/support/#api-key) key
  to pull real daily price history instead — the app doesn't need any code changes.

## Getting started

Requires **Node 22.13+** (for the built-in `node:sqlite` module without a flag —
earlier 22.x releases, including 22.12, don't have it).

```bash
git clone https://github.com/<your-username>/quantpulse.git
cd quantpulse
npm install          # installs both workspaces (server + client)

npm run dev:server   # terminal 1 — API + WebSocket on http://localhost:4000
npm run dev:client   # terminal 2 — app on http://localhost:5173
```

Open `http://localhost:5173`. The default watchlist (AAPL, MSFT, NVDA, TSLA, AMZN) and a
$100,000 cash balance are seeded automatically on first run. Change the starting cash with
`QUANTPULSE_STARTING_CASH=50000 npm run dev:server` (only applies to a fresh database).

To use real market data instead of the simulator, set an API key before starting the
server:

```bash
ALPHA_VANTAGE_KEY=your_key_here npm run dev:server
```

### Running the tests

```bash
npm test
```

85+ tests cover the technical indicator math (SMA/EMA/RSI/MACD/Bollinger/VWAP against
hand-computed values), the market data provider, the trading engine (cost-basis averaging,
atomic rollback), the limit order book (reservation accounting, fill-at-the-better-price),
the market-impact/slippage model, portfolio risk metrics (Sharpe/drawdown/volatility), the
backtesting engine, the rate limiter, and the WebSocket frame protocol — including a live
handshake + bidirectional message round-trip over a real socket using Node's built-in
`WebSocket` client, not a mock.

### Production build

```bash
npm run build              # bundles the client into client/dist
npm start --workspace server   # serves the API, WebSocket, and built client from one process
```

### Running with Docker

```bash
docker compose up --build
```

Builds the client, installs only the server's production dependencies, and runs everything
in one container on port 4000, with the SQLite database persisted in a named volume so it
survives container restarts. Set `ALPHA_VANTAGE_KEY` / `QUANTPULSE_STARTING_CASH` in a
`.env` file or your shell environment before running to override the defaults.

### CI

`.github/workflows/ci.yml` runs the full server test suite and a production client build
on every push and pull request to `main`.

## Project structure

```
quantpulse/
├── server/
│   ├── src/
│   │   ├── db.js            # SQLite schema + seed data (node:sqlite)
│   │   ├── marketData.js    # simulated & real (Alpha Vantage) quote/history providers
│   │   ├── indicators.js    # SMA, EMA, RSI, MACD, Bollinger Bands, VWAP, volatility
│   │   ├── portfolio.js     # buy/sell engine, P&L, atomic transactions
│   │   ├── orders.js        # limit order book: reservations, matching, fills
│   │   ├── marketImpact.js  # square-root slippage/market-impact model
│   │   ├── risk.js          # Sharpe ratio, max drawdown, annualized volatility
│   │   ├── backtest.js      # SMA-crossover / RSI backtesting engine
│   │   ├── ws.js            # hand-rolled WebSocket server (RFC 6455)
│   │   ├── middleware/
│   │   │   └── rateLimit.js # hand-rolled fixed-window rate limiter
│   │   └── routes/          # Express route handlers
│   └── tests/                # node:test suites
├── client/
│   ├── build.js              # esbuild dev server + production build script
│   └── src/
│       ├── components/       # PriceChart, RsiChart, MacdChart, OpenOrders, RiskStats, …
│       ├── pages/            # Dashboard, StockDetail, PortfolioPage, BacktestPage
│       ├── useLiveQuotes.js  # WebSocket hook — overlays live ticks on top of polling
│       ├── api.js            # fetch wrapper for the backend
│       └── useHashRoute.js   # minimal client-side router
├── Dockerfile
├── docker-compose.yml
└── .github/workflows/ci.yml
```

## Notes on the trading engine

Every trade is recorded as `shares × price` against the position's cost basis. A second
buy of the same symbol at a different price re-weights the average cost
(`(existingShares × existingAvgCost + newShares × newPrice) / totalShares`), matching how
brokerages report average cost for a position. Buys and sells run inside a SQL
transaction, so a trade either fully applies (cash, holdings, and the transaction log all
update together) or fully rolls back — verified in `tests/portfolio.test.js` by asserting
that a rejected order leaves cash and the transaction log untouched.

**Market orders** fetch a fresh server-side quote (the client's displayed price is never
trusted for execution) and run it through the market-impact model before filling — a small
order fills essentially at quote, a large one fills noticeably worse, same as it would
against a real limit order book with finite depth at each price level.

**Limit orders** sit as `PENDING` rows in `orders` until a quote crosses the limit. Placing
one reserves the cash (buy) or shares (sell) it would need against every *other* pending
order first, so you can't place five buy orders that together cost more than you have —
the same over-commitment bug a real brokerage has to guard against. A background sweep
(`checkAndFillOrders`, run on every portfolio fetch and every 15s server-side) fills orders
at the better of the quote or the limit price, the standard "limit price or better"
convention.

## Notes on the WebSocket server

`ws.js` implements just enough of RFC 6455 for this app: the `Sec-WebSocket-Accept`
handshake (SHA-1 of the client's key + the spec's magic GUID, base64-encoded), text-frame
encoding/decoding with the 7-bit / 16-bit / 64-bit extended length forms, unmasking
client→server frames (masked per spec) while leaving server→client frames unmasked (also
per spec), and reassembling a frame that arrives split across multiple TCP packets. It's
tested against a real socket — `tests/ws.test.js` spins up a plain `node:http` server,
attaches this WebSocket layer to it, and connects with Node's built-in `WebSocket` client
to do an actual handshake and a real bidirectional message exchange, not a mocked one.

## License

MIT
