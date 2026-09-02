import { Router } from 'express';
import { getHistory } from '../marketData.js';
import { runBacktest, BacktestError } from '../backtest.js';

export const backtestRouter = Router();

backtestRouter.post('/', async (req, res, next) => {
  try {
    const { symbol, days = 365, strategy, startingCash, ...params } = req.body;
    if (!symbol) return res.status(400).json({ error: 'symbol is required' });

    const normalizedSymbol = String(symbol).toUpperCase();
    const numDays = Math.min(Math.max(Number(days) || 365, 30), 1000);
    const bars = await getHistory(normalizedSymbol, numDays);

    const result = runBacktest(bars, {
      strategy,
      startingCash: startingCash != null ? Number(startingCash) : undefined,
      ...params,
    });

    res.json({ symbol: normalizedSymbol, barsUsed: bars.length, ...result });
  } catch (err) {
    if (err instanceof BacktestError) return res.status(400).json({ error: err.message });
    next(err);
  }
});
