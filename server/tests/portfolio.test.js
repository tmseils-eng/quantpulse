import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  buy,
  sell,
  summarize,
  getTransactions,
  resetPortfolio,
  TradeError,
  STARTING_CASH,
} from '../src/portfolio.js';

// A fresh in-memory SQLite database per test, with the same schema db.js
// creates against the real file — this exercises the actual SQL the app
// runs, not a hand-rolled mock of it.
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
  `);
  db.prepare('INSERT INTO portfolio (id, cash) VALUES (1, ?)').run(STARTING_CASH);
  return db;
}

test('buy: deducts cash and opens a new holding at the fill price', () => {
  const db = freshDb();
  const result = buy(db, 'AAPL', 10, 200);

  assert.equal(result.cash, STARTING_CASH - 2000);
  assert.equal(result.holdings.length, 1);
  assert.equal(result.holdings[0].symbol, 'AAPL');
  assert.equal(result.holdings[0].shares, 10);
  assert.equal(result.holdings[0].avgCost, 200);
});

test('buy: a second buy at a different price updates a cost-basis-weighted average', () => {
  const db = freshDb();
  buy(db, 'AAPL', 10, 200); // 10 @ 200 = 2000
  const result = buy(db, 'AAPL', 10, 220); // +10 @ 220 = 2200

  // (2000 + 2200) / 20 shares = 210 average cost
  assert.equal(result.holdings[0].shares, 20);
  assert.equal(result.holdings[0].avgCost, 210);
  assert.equal(result.cash, STARTING_CASH - 2000 - 2200);
});

test('buy: rejects an order that costs more than available cash', () => {
  const db = freshDb();
  assert.throws(() => buy(db, 'AAPL', 100_000, 500), TradeError);
  // Nothing should have been recorded — the transaction rolls back.
  assert.equal(getTransactions(db).length, 0);
  assert.equal(summarize(db).cash, STARTING_CASH);
});

test('buy: rejects non-positive shares or price', () => {
  const db = freshDb();
  assert.throws(() => buy(db, 'AAPL', 0, 100), TradeError);
  assert.throws(() => buy(db, 'AAPL', 10, -5), TradeError);
});

test('sell: credits cash and realizes gain/loss against average cost', () => {
  const db = freshDb();
  buy(db, 'AAPL', 10, 200); // cost basis 2000
  const result = sell(db, 'AAPL', 10, 250); // proceeds 2500

  assert.equal(result.holdings.length, 0); // fully liquidated
  assert.equal(result.cash, STARTING_CASH - 2000 + 2500);
});

test('sell: partial sell keeps the remaining position at the same avg cost', () => {
  const db = freshDb();
  buy(db, 'AAPL', 10, 200);
  const result = sell(db, 'AAPL', 4, 250);

  assert.equal(result.holdings[0].shares, 6);
  assert.equal(result.holdings[0].avgCost, 200); // unchanged by a sell
});

test('sell: rejects selling more shares than are held', () => {
  const db = freshDb();
  buy(db, 'AAPL', 5, 200);
  assert.throws(() => sell(db, 'AAPL', 6, 250), TradeError);
});

test('sell: rejects selling a symbol with no position', () => {
  const db = freshDb();
  assert.throws(() => sell(db, 'TSLA', 1, 250), TradeError);
});

test('summarize: totalValue and gain reflect live quotes, not cost basis', () => {
  const db = freshDb();
  buy(db, 'AAPL', 10, 200); // spends 2000, cash = 98000
  const result = summarize(db, { AAPL: 300 }); // price has since risen to 300

  assert.equal(result.holdings[0].marketValue, 3000);
  assert.equal(result.holdings[0].gain, 1000); // 3000 - 2000 cost basis
  assert.equal(result.holdingsValue, 3000);
  assert.equal(result.totalValue, 98000 + 3000);
  assert.equal(result.totalGain, result.totalValue - STARTING_CASH);
});

test('every trade is recorded in transaction history, most recent first', () => {
  const db = freshDb();
  buy(db, 'AAPL', 10, 200);
  buy(db, 'MSFT', 5, 400);
  sell(db, 'AAPL', 3, 210);

  const txns = getTransactions(db);
  assert.equal(txns.length, 3);
  assert.equal(txns[0].symbol, 'AAPL');
  assert.equal(txns[0].side, 'SELL');
  assert.equal(txns[1].symbol, 'MSFT');
  assert.equal(txns[2].side, 'BUY');
});

test('resetPortfolio: clears holdings and history, restores starting cash', () => {
  const db = freshDb();
  buy(db, 'AAPL', 10, 200);
  buy(db, 'MSFT', 5, 400);

  const result = resetPortfolio(db);
  assert.equal(result.cash, STARTING_CASH);
  assert.equal(result.holdings.length, 0);
  assert.equal(getTransactions(db).length, 0);
});
