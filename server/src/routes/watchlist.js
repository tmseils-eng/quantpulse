import { Router } from 'express';
import { db } from '../db.js';
import { getQuotes } from '../marketData.js';

export const watchlistRouter = Router();

watchlistRouter.get('/', async (req, res, next) => {
  try {
    const rows = db.prepare('SELECT symbol FROM watchlist ORDER BY added_at').all();
    const symbols = rows.map((r) => r.symbol);
    res.json(symbols.length ? await getQuotes(symbols) : []);
  } catch (err) {
    next(err);
  }
});

watchlistRouter.post('/', (req, res) => {
  const symbol = String(req.body.symbol || '').trim().toUpperCase();
  if (!symbol) return res.status(400).json({ error: 'symbol is required' });
  db.prepare('INSERT OR IGNORE INTO watchlist (symbol) VALUES (?)').run(symbol);
  res.status(201).json({ symbol });
});

watchlistRouter.delete('/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  db.prepare('DELETE FROM watchlist WHERE symbol = ?').run(symbol);
  res.status(204).end();
});
