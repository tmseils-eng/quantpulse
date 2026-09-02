// Persistence layer, built on Node's native `node:sqlite` (stable since
// Node 22.5) so QuantPulse runs with zero native/compiled dependencies —
// no better-sqlite3 build step, no platform-specific prebuilt binaries.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STARTING_CASH } from './portfolio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.QUANTPULSE_DB || path.join(__dirname, '..', 'quantpulse.db');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS portfolio (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    cash REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS holdings (
    symbol TEXT PRIMARY KEY,
    shares REAL NOT NULL,
    avg_cost REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL CHECK (side IN ('BUY', 'SELL')),
    shares REAL NOT NULL,
    price REAL NOT NULL,
    total REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS watchlist (
    symbol TEXT PRIMARY KEY,
    added_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS portfolio_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    total_value REAL NOT NULL,
    recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

const existing = db.prepare('SELECT * FROM portfolio WHERE id = 1').get();
if (!existing) {
  db.prepare('INSERT INTO portfolio (id, cash) VALUES (1, ?)').run(STARTING_CASH);
}

const defaultWatchlist = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN'];
const insertWatch = db.prepare('INSERT OR IGNORE INTO watchlist (symbol) VALUES (?)');
const watchCount = db.prepare('SELECT COUNT(*) AS c FROM watchlist').get();
if (watchCount.c === 0) {
  for (const symbol of defaultWatchlist) insertWatch.run(symbol);
}
