// Paper-trading portfolio engine. All functions take a `db` (better-sqlite3
// instance) as the first argument so the trading logic can be unit-tested
// against an in-memory database, independent of the live server.

export class TradeError extends Error {}

/**
 * node:sqlite's DatabaseSync has no built-in `.transaction()` helper (unlike
 * better-sqlite3), so this wraps a block of statements in BEGIN/COMMIT with
 * ROLLBACK on error — used anywhere a trade must update multiple tables
 * atomically.
 */
export function runInTransaction(db, fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function getPortfolioRow(db) {
  return db.prepare('SELECT * FROM portfolio WHERE id = 1').get();
}

export function getHoldings(db) {
  return db.prepare('SELECT * FROM holdings ORDER BY symbol').all();
}

export function getTransactions(db, limit = 50) {
  return db
    .prepare('SELECT * FROM transactions ORDER BY id DESC LIMIT ?')
    .all(limit);
}

/**
 * Execute a BUY: deducts cash, creates/updates the holding with a
 * cost-basis-weighted average price, and records the transaction.
 */
export function buy(db, symbol, shares, price) {
  validateOrder(shares, price);
  const cost = round2(shares * price);

  runInTransaction(db, () => {
    const portfolio = getPortfolioRow(db);
    if (cost > portfolio.cash + 1e-6) {
      throw new TradeError(
        `Insufficient cash: need $${cost.toFixed(2)}, have $${portfolio.cash.toFixed(2)}`
      );
    }

    const existing = db.prepare('SELECT * FROM holdings WHERE symbol = ?').get(symbol);
    if (existing) {
      const newShares = existing.shares + shares;
      const newAvgCost =
        (existing.shares * existing.avg_cost + shares * price) / newShares;
      db.prepare('UPDATE holdings SET shares = ?, avg_cost = ? WHERE symbol = ?').run(
        newShares,
        newAvgCost,
        symbol
      );
    } else {
      db.prepare('INSERT INTO holdings (symbol, shares, avg_cost) VALUES (?, ?, ?)').run(
        symbol,
        shares,
        price
      );
    }

    db.prepare('UPDATE portfolio SET cash = cash - ? WHERE id = 1').run(cost);
    db.prepare(
      'INSERT INTO transactions (symbol, side, shares, price, total) VALUES (?, ?, ?, ?, ?)'
    ).run(symbol, 'BUY', shares, price, cost);
  });

  return summarize(db);
}

/**
 * Execute a SELL: requires an existing holding with enough shares, credits
 * cash at the current price, and removes the holding if fully liquidated.
 * Realized gain/loss is measured against the position's average cost.
 */
export function sell(db, symbol, shares, price) {
  validateOrder(shares, price);
  const proceeds = round2(shares * price);

  runInTransaction(db, () => {
    const existing = db.prepare('SELECT * FROM holdings WHERE symbol = ?').get(symbol);
    if (!existing || existing.shares < shares - 1e-9) {
      const held = existing ? existing.shares : 0;
      throw new TradeError(`Cannot sell ${shares} shares of ${symbol}: only ${held} held`);
    }

    const remaining = existing.shares - shares;
    if (remaining < 1e-9) {
      db.prepare('DELETE FROM holdings WHERE symbol = ?').run(symbol);
    } else {
      db.prepare('UPDATE holdings SET shares = ? WHERE symbol = ?').run(remaining, symbol);
    }

    db.prepare('UPDATE portfolio SET cash = cash + ? WHERE id = 1').run(proceeds);
    db.prepare(
      'INSERT INTO transactions (symbol, side, shares, price, total) VALUES (?, ?, ?, ?, ?)'
    ).run(symbol, 'SELL', shares, price, proceeds);
  });

  return summarize(db);
}

function validateOrder(shares, price) {
  if (!Number.isFinite(shares) || shares <= 0) {
    throw new TradeError('shares must be a positive number');
  }
  if (!Number.isFinite(price) || price <= 0) {
    throw new TradeError('price must be a positive number');
  }
}

/** Cash + holdings summary; `quotesBySymbol` maps symbol -> current price. */
export function summarize(db, quotesBySymbol = {}) {
  const portfolio = getPortfolioRow(db);
  const holdings = getHoldings(db).map((h) => {
    const currentPrice = quotesBySymbol[h.symbol] ?? h.avg_cost;
    const marketValue = round2(h.shares * currentPrice);
    const costBasis = round2(h.shares * h.avg_cost);
    const gain = round2(marketValue - costBasis);
    const gainPercent = costBasis ? round2((gain / costBasis) * 100) : 0;
    return {
      symbol: h.symbol,
      shares: h.shares,
      avgCost: round2(h.avg_cost),
      currentPrice: round2(currentPrice),
      marketValue,
      costBasis,
      gain,
      gainPercent,
    };
  });

  const holdingsValue = round2(holdings.reduce((sum, h) => sum + h.marketValue, 0));
  const totalValue = round2(portfolio.cash + holdingsValue);
  const totalGain = round2(totalValue - STARTING_CASH);
  const totalGainPercent = round2((totalGain / STARTING_CASH) * 100);

  return {
    cash: round2(portfolio.cash),
    holdingsValue,
    totalValue,
    totalGain,
    totalGainPercent,
    holdings,
  };
}

export function recordHistoryPoint(db, totalValue) {
  db.prepare('INSERT INTO portfolio_history (total_value) VALUES (?)').run(totalValue);
}

export function getHistorySeries(db, limit = 200) {
  return db
    .prepare('SELECT total_value, recorded_at FROM portfolio_history ORDER BY id ASC LIMIT ?')
    .all(limit);
}

export function resetPortfolio(db) {
  runInTransaction(db, () => {
    db.prepare('DELETE FROM holdings').run();
    db.prepare('DELETE FROM transactions').run();
    db.prepare('DELETE FROM portfolio_history').run();
    db.prepare('UPDATE portfolio SET cash = ? WHERE id = 1').run(STARTING_CASH);
  });
  return summarize(db);
}

export const STARTING_CASH = Number(process.env.QUANTPULSE_STARTING_CASH) || 100_000;

function round2(n) {
  return Math.round(n * 100) / 100;
}
