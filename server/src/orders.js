// Limit order book. Market orders fill immediately against buy()/sell() (see
// routes/portfolio.js); limit orders sit here as PENDING until a quote
// crosses their limit price, at which point checkAndFillOrders() executes
// them through the same buy()/sell() engine so every fill — market or limit
// — goes through identical cash/holdings accounting.

import { runInTransaction, getPortfolioRow, buy, sell, TradeError } from './portfolio.js';

/**
 * Cash committed to other pending BUY limit orders — a buy limit order
 * reserves `shares * limitPrice` so you can't place more buy orders than you
 * could actually cover if every one of them filled at once.
 */
export function reservedCashForPendingBuys(db, excludeOrderId = null) {
  const rows = excludeOrderId
    ? db
        .prepare(
          "SELECT shares, limit_price FROM orders WHERE status = 'PENDING' AND side = 'BUY' AND id != ?"
        )
        .all(excludeOrderId)
    : db.prepare("SELECT shares, limit_price FROM orders WHERE status = 'PENDING' AND side = 'BUY'").all();
  return rows.reduce((sum, r) => sum + r.shares * r.limit_price, 0);
}

/**
 * Shares of `symbol` committed to other pending SELL limit orders — mirrors
 * reservedCashForPendingBuys() so you can't over-commit shares you don't
 * (yet) have free across multiple open sell orders.
 */
export function reservedSharesForSymbol(db, symbol, excludeOrderId = null) {
  const rows = excludeOrderId
    ? db
        .prepare(
          "SELECT shares FROM orders WHERE status = 'PENDING' AND side = 'SELL' AND symbol = ? AND id != ?"
        )
        .all(symbol, excludeOrderId)
    : db
        .prepare("SELECT shares FROM orders WHERE status = 'PENDING' AND side = 'SELL' AND symbol = ?")
        .all(symbol);
  return rows.reduce((sum, r) => sum + r.shares, 0);
}

function validateLimitInputs(shares, limitPrice) {
  if (!Number.isFinite(shares) || shares <= 0) {
    throw new TradeError('shares must be a positive number');
  }
  if (!Number.isFinite(limitPrice) || limitPrice <= 0) {
    throw new TradeError('limit price must be a positive number');
  }
}

/**
 * Place a resting limit order. Validates against *available* cash/shares
 * (i.e. net of what's already reserved by other pending orders), not just
 * the raw portfolio balance, then inserts it as PENDING.
 */
export function placeLimitOrder(db, symbol, side, shares, limitPrice) {
  validateLimitInputs(shares, limitPrice);

  return runInTransaction(db, () => {
    if (side === 'BUY') {
      const portfolio = getPortfolioRow(db);
      const reserved = reservedCashForPendingBuys(db);
      const available = portfolio.cash - reserved;
      const notional = round2(shares * limitPrice);
      if (notional > available + 1e-6) {
        throw new TradeError(
          `Insufficient available cash: order needs $${notional.toFixed(2)}, ` +
            `only $${available.toFixed(2)} available ($${reserved.toFixed(2)} reserved by other pending orders)`
        );
      }
    } else {
      const holding = db.prepare('SELECT * FROM holdings WHERE symbol = ?').get(symbol);
      const held = holding ? holding.shares : 0;
      const reserved = reservedSharesForSymbol(db, symbol);
      const available = held - reserved;
      if (shares > available + 1e-9) {
        throw new TradeError(
          `Insufficient available shares of ${symbol}: order needs ${shares}, ` +
            `only ${available} available (${reserved} reserved by other pending sell orders)`
        );
      }
    }

    const result = db
      .prepare(
        `INSERT INTO orders (symbol, side, order_type, shares, limit_price, status)
         VALUES (?, ?, 'LIMIT', ?, ?, 'PENDING')`
      )
      .run(symbol, side, shares, limitPrice);

    return getOrderById(db, Number(result.lastInsertRowid));
  });
}

export function cancelOrder(db, orderId) {
  const order = getOrderById(db, orderId);
  if (!order) throw new TradeError(`Order ${orderId} not found`);
  if (order.status !== 'PENDING') {
    throw new TradeError(`Order ${orderId} is already ${order.status.toLowerCase()}, cannot cancel`);
  }
  db.prepare("UPDATE orders SET status = 'CANCELLED' WHERE id = ?").run(orderId);
  return getOrderById(db, orderId);
}

export function getOrderById(db, id) {
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
}

export function getOpenOrders(db) {
  return db.prepare("SELECT * FROM orders WHERE status = 'PENDING' ORDER BY created_at DESC").all();
}

export function getAllOrders(db, limit = 50) {
  return db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT ?').all(limit);
}

/**
 * Check every pending limit order against `quotesBySymbol` (symbol -> last
 * price) and fill any that have crossed their limit. A BUY limit fills once
 * price drops to/below the limit; a SELL limit fills once price rises to/
 * above it — filled at the more favorable of (quote price, limit price), the
 * standard "limit price or better" convention. Returns the orders that were
 * filled this pass.
 */
export function checkAndFillOrders(db, quotesBySymbol) {
  const filled = [];

  for (const order of getOpenOrders(db)) {
    const price = quotesBySymbol[order.symbol];
    if (price == null) continue;

    let fillPrice = null;
    if (order.side === 'BUY' && price <= order.limit_price) {
      fillPrice = Math.min(price, order.limit_price);
    } else if (order.side === 'SELL' && price >= order.limit_price) {
      fillPrice = Math.max(price, order.limit_price);
    }
    if (fillPrice == null) continue;

    try {
      if (order.side === 'BUY') buy(db, order.symbol, order.shares, fillPrice);
      else sell(db, order.symbol, order.shares, fillPrice);

      db.prepare(
        "UPDATE orders SET status = 'FILLED', filled_at = datetime('now'), filled_price = ? WHERE id = ?"
      ).run(fillPrice, order.id);
      filled.push(getOrderById(db, order.id));
    } catch (err) {
      // A reservation should normally prevent this, but if it somehow can't
      // fill (e.g. state drifted), leave the order pending rather than
      // crashing the whole sweep — surface anything unexpected.
      if (!(err instanceof TradeError)) throw err;
    }
  }

  return filled;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
