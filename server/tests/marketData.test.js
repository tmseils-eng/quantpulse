import test from 'node:test';
import assert from 'node:assert/strict';
import { getQuote, getHistory, getQuotes, searchSymbols } from '../src/marketData.js';

// These tests exercise the simulated-market fallback path (no ALPHA_VANTAGE_KEY
// set in the test environment), which is what QuantPulse runs on out of the box.

test('getHistory: returns the requested number of trading-day bars, oldest first', async () => {
  const bars = await getHistory('AAPL', 30);
  assert.equal(bars.length, 30);
  const dates = bars.map((b) => b.date);
  assert.deepEqual(dates, [...dates].sort());
});

test('getHistory: every bar has high >= open/close >= low, and positive volume', async () => {
  const bars = await getHistory('MSFT', 60);
  for (const bar of bars) {
    assert.ok(bar.high >= bar.open);
    assert.ok(bar.high >= bar.close);
    assert.ok(bar.low <= bar.open);
    assert.ok(bar.low <= bar.close);
    assert.ok(bar.volume > 0);
  }
});

test('getQuote and getHistory agree on the latest close regardless of window size', async () => {
  const quote = await getQuote('NVDA');
  const short = await getHistory('NVDA', 5);
  const long = await getHistory('NVDA', 250);

  assert.equal(quote.price, short[short.length - 1].close);
  assert.equal(quote.price, long[long.length - 1].close);
});

test('getQuotes: fetches multiple symbols and preserves order', async () => {
  const quotes = await getQuotes(['AAPL', 'TSLA', 'AMZN']);
  assert.deepEqual(
    quotes.map((q) => q.symbol),
    ['AAPL', 'TSLA', 'AMZN']
  );
});

test('an unknown symbol still produces a stable, deterministic quote', async () => {
  const first = await getQuote('ZZZZ');
  const second = await getQuote('ZZZZ');
  assert.equal(first.price, second.price);
  assert.equal(first.symbol, 'ZZZZ');
});

test('searchSymbols: matches by symbol or company name, case-insensitively', () => {
  assert.deepEqual(
    searchSymbols('aapl').map((r) => r.symbol),
    ['AAPL']
  );
  assert.ok(searchSymbols('disney').some((r) => r.symbol === 'DIS'));
  assert.deepEqual(searchSymbols(''), []);
});
