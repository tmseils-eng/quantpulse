import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { buy, TradeError, STARTING_CASH } from '../src/portfolio.js';
import {
  placeLimitOrder,
  cancelOrder,
  getOpenOrders,
  getAllOrders,
  checkAndFillOrders,
  reservedCashForPendingBuys,
  reservedSharesForSymbol,
} from '../src/orders.js';

// Same schema db.js creates, in-memory, so this exercises real SQL — not a mock.
function freshDb() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE portfolio (id INTEGER PRIMARY KEY CHECK (id = 1), cash REAL NOT NULL);
    CREATE TABLE holdings (symbol TEXT PRIMARY KEY, shares REAL NOT NULL, avg_cost REAL NOT NULL);
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
      shares REAL NOT NULL,
      price REAL NOT NULL,
      total REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE portfolio_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total_value REAL NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
      order_type TEXT NOT NULL CHECK (order_type IN ('MARKET', 'LIMIT')),
      shares REAL NOT NULL,
      limit_price REAL,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'FILLED', 'CANCELLED')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      filled_at TEXT,
      filled_price REAL
    );
  `);
  db.prepare('INSERT INTO portfolio (id, cash) VALUES (1, ?)').run(STARTING_CASH);
  return db;
}

test('placeLimitOrder: a valid buy limit order is recorded as PENDING', () => {
  const db = freshDb();
  const order = placeLimitOrder(db, 'AAPL', 'BUY', 10, 180);
  assert.equal(order.status, 'PENDING');
  assert.equal(order.symbol, 'AAPL');
  assert.equal(order.order_type, 'LIMIT');
  assert.equal(getOpenOrders(db).length, 1);
});

test('placeLimitOrder: rejects a buy order costing more than available cash', () => {
  const db = freshDb();
  assert.throws(() => placeLimitOrder(db, 'AAPL', 'BUY', 1_000_000, 200), TradeError);
  assert.equal(getOpenOrders(db).length, 0);
});

test('placeLimitOrder: cash gets reserved across multiple pending buy orders', () => {
  const db = freshDb();
  // Two orders that individually fit, but together exceed STARTING_CASH.
  placeLimitOrder(db, 'AAPL', 'BUY', 300, 200); // 60,000
  assert.equal(reservedCashForPendingBuys(db), 60_000);
  assert.throws(() => placeLimitOrder(db, 'MSFT', 'BUY', 250, 200), TradeError); // would need 50,000 more (only 40,000 left)
});

test('placeLimitOrder: rejects a sell order for shares not held', () => {
  const db = freshDb();
  assert.throws(() => placeLimitOrder(db, 'AAPL', 'SELL', 5, 200), TradeError);
});

test('placeLimitOrder: a sell order is capped by shares already reserved by other pending sells', () => {
  const db = freshDb();
  buy(db, 'AAPL', 10, 100); // now holds 10 AAPL
  placeLimitOrder(db, 'AAPL', 'SELL', 6, 150);
  assert.equal(reservedSharesForSymbol(db, 'AAPL'), 6);
  assert.throws(() => placeLimitOrder(db, 'AAPL', 'SELL', 5, 160), TradeError); // only 4 free
  placeLimitOrder(db, 'AAPL', 'SELL', 4, 160); // exactly the remainder — should succeed
  assert.equal(getOpenOrders(db).length, 2);
});

test('cancelOrder: frees up the order and its reservation', () => {
  const db = freshDb();
  const order = placeLimitOrder(db, 'AAPL', 'BUY', 300, 200);
  const cancelled = cancelOrder(db, order.id);
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(reservedCashForPendingBuys(db), 0);
  // Now a previously-blocked order should go through.
  const second = placeLimitOrder(db, 'MSFT', 'BUY', 250, 200);
  assert.equal(second.status, 'PENDING');
});

test('cancelOrder: rejects cancelling an order that is not pending', () => {
  const db = freshDb();
  const order = placeLimitOrder(db, 'AAPL', 'BUY', 10, 200);
  cancelOrder(db, order.id);
  assert.throws(() => cancelOrder(db, order.id), TradeError);
});

test('checkAndFillOrders: a buy limit fills once the quote drops to/below the limit', () => {
  const db = freshDb();
  const order = placeLimitOrder(db, 'AAPL', 'BUY', 10, 180);

  let filled = checkAndFillOrders(db, { AAPL: 185 }); // still above limit
  assert.equal(filled.length, 0);
  assert.equal(getOpenOrders(db).length, 1);

  filled = checkAndFillOrders(db, { AAPL: 178 }); // crosses the limit
  assert.equal(filled.length, 1);
  assert.equal(filled[0].status, 'FILLED');
  assert.equal(filled[0].filled_price, 178); // filled at the better (lower) of quote vs limit
  assert.equal(getOpenOrders(db).length, 0);
});

test('checkAndFillOrders: a sell limit fills once the quote rises to/above the limit, at the better price', () => {
  const db = freshDb();
  buy(db, 'AAPL', 10, 150);
  placeLimitOrder(db, 'AAPL', 'SELL', 10, 200);

  const filled = checkAndFillOrders(db, { AAPL: 210 }); // quote better than limit
  assert.equal(filled.length, 1);
  assert.equal(filled[0].filled_price, 210); // filled at the better (higher) of quote vs limit
});

test('checkAndFillOrders: an order for a symbol with no quote available is left pending', () => {
  const db = freshDb();
  placeLimitOrder(db, 'AAPL', 'BUY', 10, 180);
  const filled = checkAndFillOrders(db, {}); // no quote for AAPL at all
  assert.equal(filled.length, 0);
  assert.equal(getOpenOrders(db).length, 1);
});

test('getAllOrders: returns filled, cancelled, and pending orders together, most recent first', () => {
  const db = freshDb();
  const a = placeLimitOrder(db, 'AAPL', 'BUY', 10, 180);
  const b = placeLimitOrder(db, 'MSFT', 'BUY', 5, 300);
  cancelOrder(db, b.id);
  checkAndFillOrders(db, { AAPL: 170 });

  const all = getAllOrders(db);
  assert.equal(all.length, 2);
  assert.equal(all[0].id, b.id); // most recent (higher id) first
  assert.equal(all[1].status, 'FILLED');
});
