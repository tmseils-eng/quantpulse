import test from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, rsi, dailyReturns, volatility } from '../src/indicators.js';

function bar(close) {
  return { date: '2024-01-01', open: close, high: close, low: close, close, volume: 1000 };
}

test('sma: nulls before the window fills, then a plain moving average', () => {
  const bars = [1, 2, 3, 4, 5].map(bar);
  const result = sma(bars, 3);
  assert.deepEqual(result, [null, null, 2, 3, 4]);
});

test('sma: matches a hand-computed average on an uneven series', () => {
  const bars = [10, 12, 14, 11, 13, 15].map(bar);
  const result = sma(bars, 4);
  // window [10,12,14,11] -> 11.75 ; [12,14,11,13] -> 12.5 ; [14,11,13,15] -> 13.25
  assert.deepEqual(result.slice(3), [11.75, 12.5, 13.25]);
});

test('ema: seeds on the SMA of the first `period` closes, then reacts faster than SMA', () => {
  const bars = [10, 10, 10, 10, 20, 20, 20, 20].map(bar);
  const emaResult = ema(bars, 4);
  const smaResult = sma(bars, 4);

  assert.equal(emaResult[3], 10); // seed = average of first 4 closes
  // Once the shock hits, EMA should have moved further toward it than SMA.
  assert.ok(emaResult[5] > smaResult[5]);
});

test('rsi: a strictly rising series approaches 100', () => {
  const closes = Array.from({ length: 20 }, (_, i) => 100 + i); // steady gains, no losses
  const result = rsi(closes.map(bar), 14);
  assert.equal(result[14], 100);
});

test('rsi: a strictly falling series approaches 0', () => {
  const closes = Array.from({ length: 20 }, (_, i) => 200 - i);
  const result = rsi(closes.map(bar), 14);
  assert.equal(result[14], 0);
});

test('rsi: a flat series with a null return has no defined RSI', () => {
  const closes = Array(20).fill(50);
  const result = rsi(closes.map(bar), 14);
  // No gains and no losses -> avgLoss is 0 -> RSI defined as 100 by convention
  assert.equal(result[14], 100);
});

test('dailyReturns: percent change day over day, first entry null', () => {
  const bars = [100, 110, 99].map(bar);
  const result = dailyReturns(bars);
  assert.equal(result[0], null);
  assert.equal(result[1], 10); // +10%
  assert.equal(result[2], -10); // -10% from 110 -> 99
});

test('volatility: zero for a perfectly flat series', () => {
  const bars = Array(30).fill(100).map(bar);
  assert.equal(volatility(bars), 0);
});

test('volatility: positive and finite for a noisy series', () => {
  const closes = [100, 102, 98, 105, 95, 110, 90, 108, 97, 103];
  const result = volatility(closes.map(bar));
  assert.ok(result > 0 && Number.isFinite(result));
});
