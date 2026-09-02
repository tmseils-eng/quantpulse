import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

import { db } from './db.js'; // ensures schema + seed data exist before routes touch it
import { stocksRouter } from './routes/stocks.js';
import { watchlistRouter } from './routes/watchlist.js';
import { portfolioRouter } from './routes/portfolio.js';
import { backtestRouter } from './routes/backtest.js';
import { getQuotes } from './marketData.js';
import { getHoldings, summarize, recordHistoryPoint } from './portfolio.js';
import { getAllOrders, checkAndFillOrders } from './orders.js';
import { attachWebSocketServer } from './ws.js';
import { createRateLimiter } from './middleware/rateLimit.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// 120 requests/minute per IP across the whole API is generous for normal
// use (the client polls every 15-20s) while still blocking a runaway loop
// or an accidental hammering script.
app.use('/api', createRateLimiter({ windowMs: 60_000, max: 120 }));

app.use('/api/stocks', stocksRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/portfolio', portfolioRouter);
app.use('/api/backtest', backtestRouter);

// Serve the built React app in production if a build is present.
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`QuantPulse API listening on http://localhost:${PORT}`);
});

// --- WebSocket: live quote ticks pushed to subscribed clients -------------
// Hand-rolled (see ws.js) — no `ws` package dependency. Each connection
// tracks its own subscribed symbol set; a shared interval below fetches
// quotes once per tick and fans them out to whoever wants each symbol.

const subscriptions = new Map(); // WSConnection -> Set<symbol>

attachWebSocketServer(server, '/ws', (conn) => {
  subscriptions.set(conn, new Set());

  conn.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw);
      if (msg.type === 'subscribe' && Array.isArray(msg.symbols)) {
        subscriptions.set(conn, new Set(msg.symbols.map((s) => String(s).toUpperCase())));
      }
    } catch {
      // ignore malformed messages rather than drop the connection
    }
  });

  conn.on('close', () => subscriptions.delete(conn));
});

const WS_TICK_MS = 5_000;
setInterval(async () => {
  if (subscriptions.size === 0) return;

  const allSymbols = new Set();
  for (const symbols of subscriptions.values()) {
    for (const s of symbols) allSymbols.add(s);
  }
  if (allSymbols.size === 0) return;

  try {
    const quotes = await getQuotes([...allSymbols]);
    const bySymbol = Object.fromEntries(quotes.map((q) => [q.symbol, q]));
    for (const [conn, symbols] of subscriptions) {
      for (const symbol of symbols) {
        const quote = bySymbol[symbol];
        if (quote) conn.send({ type: 'quote', ...quote });
      }
    }
  } catch (err) {
    console.error('WebSocket quote broadcast failed:', err);
  }
}, WS_TICK_MS);

// --- Background sweep: fill resting limit orders even with no page open ---
// The portfolio route also checks on every GET, but this means an order can
// fill in the background between visits instead of only "on next page load".

const ORDER_SWEEP_MS = 15_000;
setInterval(async () => {
  try {
    const heldSymbols = getHoldings(db).map((h) => h.symbol);
    const orderSymbols = getAllOrders(db, 200)
      .filter((o) => o.status === 'PENDING')
      .map((o) => o.symbol);
    const symbols = [...new Set([...heldSymbols, ...orderSymbols])];
    if (symbols.length === 0) return;

    const quotes = await getQuotes(symbols);
    const quotesBySymbol = Object.fromEntries(quotes.map((q) => [q.symbol, q.price]));
    const filled = checkAndFillOrders(db, quotesBySymbol);
    if (filled.length > 0) {
      const fresh = summarize(db, quotesBySymbol);
      recordHistoryPoint(db, fresh.totalValue);
    }
  } catch (err) {
    console.error('Background order sweep failed:', err);
  }
}, ORDER_SWEEP_MS);
