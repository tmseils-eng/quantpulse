import { Router } from 'express';
import { db } from '../db.js';
import { getQuote, getQuotes } from '../marketData.js';
import { applyMarketImpact } from '../marketImpact.js';
import {
  buy,
  sell,
  summarize,
  getTransactions,
  getHoldings,
  recordHistoryPoint,
  getHistorySeries,
  resetPortfolio,
  TradeError,
} from '../portfolio.js';
import { placeLimitOrder, cancelOrder, getAllOrders, checkAndFillOrders } from '../orders.js';
import { riskSummary } from '../risk.js';

export const portfolioRouter = Router();

// Quotes for every symbol the portfolio actually cares about right now:
// held positions (for mark-to-market) plus anything with a resting limit
// order (so checkAndFillOrders() below has a price to check it against).
async function currentQuotesBySymbol() {
  const heldSymbols = getHoldings(db).map((h) => h.symbol);
  const orderSymbols = getAllOrders(db, 200)
    .filter((o) => o.status === 'PENDING')
    .map((o) => o.symbol);
  const symbols = [...new Set([...heldSymbols, ...orderSymbols])];
  if (symbols.length === 0) return {};
  const quotes = await getQuotes(symbols);
  return Object.fromEntries(quotes.map((q) => [q.symbol, q.price]));
}

function withRisk(summary) {
  const history = getHistorySeries(db, 500).map((h) => h.total_value);
  return { ...summary, risk: riskSummary(history) };
}

portfolioRouter.get('/', async (req, res, next) => {
  try {
    const quotesBySymbol = await currentQuotesBySymbol();
    const filled = checkAndFillOrders(db, quotesBySymbol);
    if (filled.length > 0) {
      // Filling an order can change holdings, so re-quote before summarizing.
      const refreshedQuotes = await currentQuotesBySymbol();
      const fresh = summarize(db, refreshedQuotes);
      recordHistoryPoint(db, fresh.totalValue);
      return res.json(withRisk(fresh));
    }
    res.json(withRisk(summarize(db, quotesBySymbol)));
  } catch (err) {
    next(err);
  }
});

portfolioRouter.get('/transactions', (req, res) => {
  res.json(getTransactions(db));
});

portfolioRouter.get('/history', (req, res) => {
  res.json(getHistorySeries(db));
});

portfolioRouter.get('/orders', (req, res) => {
  res.json(getAllOrders(db, 200));
});

/**
 * Place an order. `orderType: "MARKET"` (default) executes immediately at
 * the current quote, adjusted for market impact based on order size vs.
 * the symbol's traded volume. `orderType: "LIMIT"` instead rests on the
 * book until price crosses `limitPrice` (see orders.js / checkAndFillOrders).
 */
portfolioRouter.post('/trade', async (req, res, next) => {
  try {
    const { symbol, side, shares, orderType = 'MARKET', limitPrice } = req.body;
    if (!symbol || !side || !shares) {
      return res.status(400).json({ error: 'symbol, side, and shares are required' });
    }
    const normalizedSymbol = String(symbol).toUpperCase();
    const normalizedSide = String(side).toUpperCase();
    const numShares = Number(shares);

    if (String(orderType).toUpperCase() === 'LIMIT') {
      const numLimitPrice = Number(limitPrice);
      if (!Number.isFinite(numLimitPrice) || numLimitPrice <= 0) {
        return res.status(400).json({ error: 'limitPrice is required for a LIMIT order' });
      }
      const order = placeLimitOrder(db, normalizedSymbol, normalizedSide, numShares, numLimitPrice);
      return res.status(201).json({ order, portfolio: summarize(db, await currentQuotesBySymbol()) });
    }

    // MARKET order: always execute against a fresh server-side quote (never
    // trust a client-submitted price) and apply size-dependent slippage.
    const quote = await getQuote(normalizedSymbol);
    const { fillPrice, impactPct } = applyMarketImpact(normalizedSide, numShares, quote.price, quote.volume);

    if (normalizedSide === 'BUY') {
      buy(db, normalizedSymbol, numShares, fillPrice);
    } else {
      sell(db, normalizedSymbol, numShares, fillPrice);
    }

    const quotesBySymbol = await currentQuotesBySymbol();
    const fresh = summarize(db, quotesBySymbol);
    recordHistoryPoint(db, fresh.totalValue);
    res.status(201).json({ ...fresh, fillPrice, referencePrice: quote.price, impactPct });
  } catch (err) {
    if (err instanceof TradeError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

portfolioRouter.post('/orders/:id/cancel', (req, res) => {
  try {
    const order = cancelOrder(db, Number(req.params.id));
    res.json(order);
  } catch (err) {
    if (err instanceof TradeError) return res.status(400).json({ error: err.message });
    throw err;
  }
});

portfolioRouter.post('/reset', (req, res) => {
  res.json(resetPortfolio(db));
});
