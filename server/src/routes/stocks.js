import { Router } from 'express';
import { getHistory, getQuote, getQuotes, searchSymbols, KNOWN_SYMBOLS } from '../marketData.js';
import { sma, ema, rsi, volatility } from '../indicators.js';

export const stocksRouter = Router();

stocksRouter.get('/symbols', (req, res) => {
  res.json(
    Object.entries(KNOWN_SYMBOLS).map(([symbol, meta]) => ({ symbol, ...meta }))
  );
});

stocksRouter.get('/search', (req, res) => {
  res.json(searchSymbols(String(req.query.q || '')));
});

stocksRouter.get('/quotes', async (req, res, next) => {
  try {
    const symbols = String(req.query.symbols || '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (symbols.length === 0) return res.json([]);
    res.json(await getQuotes(symbols));
  } catch (err) {
    next(err);
  }
});

stocksRouter.get('/:symbol/quote', async (req, res, next) => {
  try {
    res.json(await getQuote(req.params.symbol.toUpperCase()));
  } catch (err) {
    next(err);
  }
});

stocksRouter.get('/:symbol/history', async (req, res, next) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 180, 5), 1000);
    const bars = await getHistory(req.params.symbol.toUpperCase(), days);
    res.json({
      symbol: req.params.symbol.toUpperCase(),
      bars,
      indicators: {
        sma20: sma(bars, 20),
        sma50: sma(bars, 50),
        ema12: ema(bars, 12),
        rsi14: rsi(bars, 14),
      },
      volatility: volatility(bars),
    });
  } catch (err) {
    next(err);
  }
});
