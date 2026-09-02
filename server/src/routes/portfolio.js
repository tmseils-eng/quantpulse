import { Router } from 'express';
import { db } from '../db.js';
import { getQuotes } from '../marketData.js';
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

export const portfolioRouter = Router();

async function currentQuotesBySymbol() {
  const symbols = getHoldings(db).map((h) => h.symbol);
  if (symbols.length === 0) return {};
  const quotes = await getQuotes(symbols);
  return Object.fromEntries(quotes.map((q) => [q.symbol, q.price]));
}

portfolioRouter.get('/', async (req, res, next) => {
  try {
    const quotesBySymbol = await currentQuotesBySymbol();
    res.json(summarize(db, quotesBySymbol));
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

portfolioRouter.post('/trade', async (req, res, next) => {
  try {
    const { symbol, side, shares, price } = req.body;
    if (!symbol || !side || !shares || !price) {
      return res.status(400).json({ error: 'symbol, side, shares, and price are required' });
    }
    const normalizedSymbol = String(symbol).toUpperCase();
    const numShares = Number(shares);
    const numPrice = Number(price);

    // buy()/sell() already return a post-trade summary, but it's priced
    // off the fill price passed in — re-summarize against a fresh quote so
    // the response reflects the current mark-to-market value.
    if (String(side).toUpperCase() === 'BUY') {
      buy(db, normalizedSymbol, numShares, numPrice);
    } else {
      sell(db, normalizedSymbol, numShares, numPrice);
    }

    const quotesBySymbol = await currentQuotesBySymbol();
    const fresh = summarize(db, quotesBySymbol);
    recordHistoryPoint(db, fresh.totalValue);
    res.status(201).json(fresh);
  } catch (err) {
    if (err instanceof TradeError) return res.status(400).json({ error: err.message });
    next(err);
  }
});

portfolioRouter.post('/reset', (req, res) => {
  res.json(resetPortfolio(db));
});
