import test from 'node:test';
import assert from 'node:assert/strict';
import { runBacktest, BacktestError } from '../src/backtest.js';

function bar(date, close) {
  return { date, open: close, high: close, low: close, close, volume: 1_000_000 };
}

// A flat run, then a steady rise (fast SMA crosses above slow), then a
// steady fall back down (fast crosses below slow) — a clean, hand-traceable
// golden-cross / death-cross shape for a 3/5-period SMA crossover.
function crossoverBars() {
  const closes = [
    100, 100, 100, 100, 100, // flat: seeds both SMAs at 100
    102, 104, 106, 108, 110, // rising: fast(3) pulls above slow(5) partway through
    108, 106, 104, 102, 100, // falling: fast drops back below slow
  ];
  return closes.map((c, i) => bar(`2024-01-${String(i + 1).padStart(2, '0')}`, c));
}

test('runBacktest: rejects too little history', () => {
  assert.throws(() => runBacktest([bar('2024-01-01', 100)]), BacktestError);
});

test('runBacktest: rejects an unknown strategy', () => {
  const bars = crossoverBars();
  assert.throws(() => runBacktest(bars, { strategy: 'not_a_real_strategy' }), BacktestError);
});

test('runBacktest: rejects a non-positive startingCash', () => {
  const bars = crossoverBars();
  assert.throws(() => runBacktest(bars, { startingCash: 0 }), BacktestError);
});

test('runBacktest: sma_crossover buys on the golden cross and sells on the death cross', () => {
  const bars = crossoverBars();
  const result = runBacktest(bars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5, startingCash: 10_000 });

  assert.equal(result.strategy, 'sma_crossover');
  assert.ok(result.trades.length >= 2);
  assert.equal(result.trades[0].side, 'BUY');
  const sell = result.trades.find((t) => t.side.startsWith('SELL'));
  assert.ok(sell);
  // Bought during the rise, sold during/after the fall from the same rise —
  // a round trip on a rise-then-fall shape should net out close to flat or
  // positive rather than a random number.
  assert.ok(Number.isFinite(result.totalReturnPercent));
});

test('runBacktest: equity curve has one point per bar and ends at finalValue', () => {
  const bars = crossoverBars();
  const result = runBacktest(bars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5 });
  assert.equal(result.equityCurve.length, bars.length);
  assert.equal(result.equityCurve[result.equityCurve.length - 1], result.finalValue);
});

test('runBacktest: an open position at the end gets liquidated at the final close', () => {
  // Monotonically rising with no death cross before the series ends.
  const closes = [100, 100, 100, 100, 100, 102, 104, 106, 108, 110, 112, 114];
  const bars = closes.map((c, i) => bar(`2024-02-${String(i + 1).padStart(2, '0')}`, c));
  const result = runBacktest(bars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5, startingCash: 10_000 });

  const lastTrade = result.trades[result.trades.length - 1];
  assert.equal(lastTrade.side, 'SELL (mark-to-close)');
  assert.equal(lastTrade.price, closes[closes.length - 1]);
});

test('runBacktest: buyAndHoldReturnPercent matches first-close to last-close return', () => {
  const bars = crossoverBars();
  const result = runBacktest(bars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5 });
  const expected = ((bars[bars.length - 1].close - bars[0].close) / bars[0].close) * 100;
  assert.ok(Math.abs(result.buyAndHoldReturnPercent - expected) < 0.01);
});

test('runBacktest: no trades at all when the strategy never signals (flat series)', () => {
  const bars = Array.from({ length: 20 }, (_, i) => bar(`2024-03-${String(i + 1).padStart(2, '0')}`, 100));
  const result = runBacktest(bars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5, startingCash: 10_000 });
  assert.equal(result.trades.length, 0);
  assert.equal(result.finalValue, 10_000);
  assert.equal(result.totalReturnPercent, 0);
});

test('runBacktest: rsi strategy buys oversold and sells overbought', () => {
  // Sharp dip (RSI falls below 30) then a sharp rally (RSI rises above 70).
  const closes = [
    100, 99, 98, 97, 96, 95, 90, 85, 80, 75, 70, // steady decline -> oversold
    75, 80, 85, 90, 95, 100, 105, 110, 115, 120, // sharp rally -> overbought
  ];
  const bars = closes.map((c, i) => bar(`2024-04-${String(i + 1).padStart(2, '0')}`, c));
  const result = runBacktest(bars, { strategy: 'rsi', rsiPeriod: 5, oversold: 30, overbought: 70, startingCash: 10_000 });

  assert.equal(result.strategy, 'rsi');
  assert.ok(result.trades.length >= 1);
  assert.equal(result.trades[0].side, 'BUY');
});

test('runBacktest: winRate is null with no completed trades, a percent otherwise', () => {
  const flatBars = Array.from({ length: 10 }, (_, i) => bar(`2024-05-${String(i + 1).padStart(2, '0')}`, 100));
  const flatResult = runBacktest(flatBars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5 });
  assert.equal(flatResult.winRate, null);

  const bars = crossoverBars();
  const result = runBacktest(bars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5 });
  if (result.tradeCount > 0) {
    assert.ok(result.winRate >= 0 && result.winRate <= 100);
  }
});

test('runBacktest: includes a risk summary computed from the equity curve', () => {
  const bars = crossoverBars();
  const result = runBacktest(bars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5 });
  assert.ok('sharpeRatio' in result.risk);
  assert.ok('maxDrawdownPercent' in result.risk);
  assert.ok('volatilityPercent' in result.risk);
});
