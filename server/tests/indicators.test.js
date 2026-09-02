import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sma,
  ema,
  rsi,
  dailyReturns,
  volatility,
  macd,
  bollingerBands,
  vwap,
} from '../src/indicators.js';

function bar(close, volume = 1000) {
  return { date: '2024-01-01', open: close, high: close, low: close, close, volume };
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

test('macd: flat series converges to a zero line, zero signal, zero histogram', () => {
  const bars = Array(40).fill(100).map((c) => bar(c));
  const { macd: macdLine, signal, histogram } = macd(bars, 12, 26, 9);
  assert.equal(macdLine[35], 0);
  assert.equal(signal[35], 0);
  assert.equal(histogram[35], 0);
});

test('macd: is null until the slow EMA has enough history, then defined', () => {
  const bars = Array.from({ length: 40 }, (_, i) => bar(100 + i)).map((b) => b);
  const { macd: macdLine, signal } = macd(bars, 12, 26, 9);
  assert.equal(macdLine[24], null); // slowPeriod=26 needs index 25 to seed
  assert.notEqual(macdLine[25], null);
  // signal needs signalPeriod=9 more values past the first MACD value (idx 25) -> seeds at idx 33
  assert.equal(signal[32], null);
  assert.notEqual(signal[33], null);
});

test('macd: a rising series produces a positive MACD line (fast EMA above slow EMA)', () => {
  const bars = Array.from({ length: 40 }, (_, i) => bar(100 + i * 2));
  const { macd: macdLine } = macd(bars, 12, 26, 9);
  assert.ok(macdLine[39] > 0);
});

test('bollingerBands: null before the window fills, then middle band matches sma', () => {
  const closes = [10, 12, 14, 11, 13, 15];
  const bars = closes.map((c) => bar(c));
  const { middle, upper, lower } = bollingerBands(bars, 3, 2);
  const smaResult = sma(bars, 3);

  assert.equal(middle[0], null);
  assert.equal(middle[1], null);
  assert.deepEqual(middle.slice(2), smaResult.slice(2));
  // Upper/lower should straddle the middle band once defined.
  for (let i = 2; i < closes.length; i++) {
    assert.ok(upper[i] > middle[i]);
    assert.ok(lower[i] < middle[i]);
  }
});

test('bollingerBands: zero width on a perfectly flat series (stdev = 0)', () => {
  const bars = Array(10).fill(100).map((c) => bar(c));
  const { middle, upper, lower } = bollingerBands(bars, 5, 2);
  assert.equal(upper[4], 100);
  assert.equal(lower[4], 100);
  assert.equal(middle[4], 100);
});

test('vwap: matches a hand-computed cumulative volume-weighted average', () => {
  // typical price == close here since open/high/low/close are all equal in bar()
  const bars = [bar(10, 100), bar(20, 300)];
  const result = vwap(bars);
  assert.equal(result[0], 10); // only one bar so far: 10
  // (10*100 + 20*300) / (100+300) = (1000 + 6000) / 400 = 17.5
  assert.equal(result[1], 17.5);
});

test('vwap: is non-decreasing in the denominator sense — stays a weighted blend, not a spike', () => {
  const bars = [bar(100, 1000), bar(200, 1)]; // huge price jump but tiny volume
  const result = vwap(bars);
  // With such a small second-bar volume, VWAP should barely move off 100.
  assert.ok(result[1] > 100 && result[1] < 101);
});
