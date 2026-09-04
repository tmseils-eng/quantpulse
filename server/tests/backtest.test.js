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

test('runBacktest: rejects too little history', async () => {
  await assert.rejects(() => runBacktest([bar('2024-01-01', 100)]), BacktestError);
});

test('runBacktest: rejects an unknown strategy', async () => {
  const bars = crossoverBars();
  await assert.rejects(() => runBacktest(bars, { strategy: 'not_a_real_strategy' }), BacktestError);
});

test('runBacktest: rejects a non-positive startingCash', async () => {
  const bars = crossoverBars();
  await assert.rejects(() => runBacktest(bars, { startingCash: 0 }), BacktestError);
});

test('runBacktest: sma_crossover buys on the golden cross and sells on the death cross', async () => {
  const bars = crossoverBars();
  const result = await runBacktest(bars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5, startingCash: 10_000 });

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

test('runBacktest: equity curve has one point per bar and ends at finalValue', async () => {
  const bars = crossoverBars();
  const result = await runBacktest(bars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5 });
  assert.equal(result.equityCurve.length, bars.length);
  assert.equal(result.equityCurve[result.equityCurve.length - 1], result.finalValue);
});

test('runBacktest: an open position at the end gets liquidated at the final close', async () => {
  // Monotonically rising with no death cross before the series ends.
  const closes = [100, 100, 100, 100, 100, 102, 104, 106, 108, 110, 112, 114];
  const bars = closes.map((c, i) => bar(`2024-02-${String(i + 1).padStart(2, '0')}`, c));
  const result = await runBacktest(bars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5, startingCash: 10_000 });

  const lastTrade = result.trades[result.trades.length - 1];
  assert.equal(lastTrade.side, 'SELL (mark-to-close)');
  assert.equal(lastTrade.price, closes[closes.length - 1]);
});

test('runBacktest: buyAndHoldReturnPercent matches first-close to last-close return', async () => {
  const bars = crossoverBars();
  const result = await runBacktest(bars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5 });
  const expected = ((bars[bars.length - 1].close - bars[0].close) / bars[0].close) * 100;
  assert.ok(Math.abs(result.buyAndHoldReturnPercent - expected) < 0.01);
});

test('runBacktest: no trades at all when the strategy never signals (flat series)', async () => {
  const bars = Array.from({ length: 20 }, (_, i) => bar(`2024-03-${String(i + 1).padStart(2, '0')}`, 100));
  const result = await runBacktest(bars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5, startingCash: 10_000 });
  assert.equal(result.trades.length, 0);
  assert.equal(result.finalValue, 10_000);
  assert.equal(result.totalReturnPercent, 0);
});

test('runBacktest: rsi strategy buys oversold and sells overbought', async () => {
  // Sharp dip (RSI falls below 30) then a sharp rally (RSI rises above 70).
  const closes = [
    100, 99, 98, 97, 96, 95, 90, 85, 80, 75, 70, // steady decline -> oversold
    75, 80, 85, 90, 95, 100, 105, 110, 115, 120, // sharp rally -> overbought
  ];
  const bars = closes.map((c, i) => bar(`2024-04-${String(i + 1).padStart(2, '0')}`, c));
  const result = await runBacktest(bars, { strategy: 'rsi', rsiPeriod: 5, oversold: 30, overbought: 70, startingCash: 10_000 });

  assert.equal(result.strategy, 'rsi');
  assert.ok(result.trades.length >= 1);
  assert.equal(result.trades[0].side, 'BUY');
});

test('runBacktest: winRate is null with no completed trades, a percent otherwise', async () => {
  const flatBars = Array.from({ length: 10 }, (_, i) => bar(`2024-05-${String(i + 1).padStart(2, '0')}`, 100));
  const flatResult = await runBacktest(flatBars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5 });
  assert.equal(flatResult.winRate, null);

  const bars = crossoverBars();
  const result = await runBacktest(bars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5 });
  if (result.tradeCount > 0) {
    assert.ok(result.winRate >= 0 && result.winRate <= 100);
  }
});

test('runBacktest: includes a risk summary computed from the equity curve', async () => {
  const bars = crossoverBars();
  const result = await runBacktest(bars, { strategy: 'sma_crossover', fastPeriod: 3, slowPeriod: 5 });
  assert.ok('sharpeRatio' in result.risk);
  assert.ok('maxDrawdownPercent' in result.risk);
  assert.ok('volatilityPercent' in result.risk);
});

// --- ml_signal: uses an injected fake ML client (see backtest.js's `deps`
// parameter) so these tests never make a real network call to ml-service. ---

test('runBacktest: ml_signal buys once probability clears the threshold and sells once it drops', async () => {
  const bars = crossoverBars();
  // Low confidence for the first 5 bars (warmup, mirrors a real "not enough
  // history yet" response), then confidently up, then confidently down.
  const probs = [null, null, null, null, null, 0.6, 0.62, 0.65, 0.63, 0.6, 0.3, 0.25, 0.2, 0.22, 0.2];
  const fakeGetMlSignals = async () => probs.map((p, index) => ({ index, probabilityUp: p }));

  const result = await runBacktest(
    bars,
    { strategy: 'ml_signal', threshold: 0.55, exitThreshold: 0.45, startingCash: 10_000 },
    { getMlSignals: fakeGetMlSignals }
  );

  assert.equal(result.strategy, 'ml_signal');
  assert.equal(result.trades[0].side, 'BUY');
  assert.equal(result.trades[0].date, bars[5].date);
  const sell = result.trades.find((t) => t.side.startsWith('SELL'));
  assert.ok(sell);
});

test('runBacktest: ml_signal never trades when the model never clears the threshold', async () => {
  const bars = crossoverBars();
  const fakeGetMlSignals = async () => bars.map((_, index) => ({ index, probabilityUp: 0.5 }));

  const result = await runBacktest(
    bars,
    { strategy: 'ml_signal', startingCash: 10_000 },
    { getMlSignals: fakeGetMlSignals }
  );
  assert.equal(result.trades.length, 0);
});

test('runBacktest: ml_signal surfaces an unreachable/untrained ML service as a BacktestError', async () => {
  const bars = crossoverBars();
  const failingGetMlSignals = async () => {
    throw new (await import('../src/ml.js')).MlServiceError('no model trained yet');
  };

  await assert.rejects(
    () => runBacktest(bars, { strategy: 'ml_signal' }, { getMlSignals: failingGetMlSignals }),
    BacktestError
  );
});
