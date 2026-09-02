import test from 'node:test';
import assert from 'node:assert/strict';
import { periodReturns, sharpeRatio, maxDrawdown, annualizedVolatility, riskSummary } from '../src/risk.js';

test('periodReturns: computes decimal returns between consecutive values', () => {
  const result = periodReturns([100, 110, 99]);
  assert.equal(result.length, 2);
  assert.ok(Math.abs(result[0] - 0.1) < 1e-9); // +10%
  assert.ok(Math.abs(result[1] - -0.1) < 1e-9); // -10% from 110 -> 99
});

test('maxDrawdown: zero for a monotonically rising series', () => {
  const values = [100, 105, 110, 120, 130];
  assert.equal(maxDrawdown(values), 0);
});

test('maxDrawdown: matches a hand-computed peak-to-trough decline', () => {
  // Peak at 120, trough at 90 before recovering -> (120-90)/120 = 25%
  const values = [100, 120, 90, 110];
  assert.equal(maxDrawdown(values), 25);
});

test('maxDrawdown: tracks the running high-water mark, not just the global max', () => {
  // Two separate drawdowns: 100->110 (peak) ->99 (10% DD), then ->130(peak)->110 (15.38% DD)
  const values = [100, 110, 99, 130, 110];
  const dd = maxDrawdown(values);
  assert.ok(Math.abs(dd - 15.3846) < 0.001);
});

test('annualizedVolatility: zero for a perfectly flat series', () => {
  const values = Array(30).fill(100_000);
  assert.equal(annualizedVolatility(values), 0);
});

test('annualizedVolatility: positive and finite for a noisy series', () => {
  const values = [100, 102, 98, 105, 95, 110, 90, 108, 97, 103];
  const result = annualizedVolatility(values);
  assert.ok(result > 0 && Number.isFinite(result));
});

test('sharpeRatio: null when there is not enough history', () => {
  assert.equal(sharpeRatio([100]), null);
  assert.equal(sharpeRatio([100, 101]), null); // only 1 return, needs >= 2
});

test('sharpeRatio: positive for a steadily rising series, negative for a steadily falling one', () => {
  const rising = Array.from({ length: 60 }, (_, i) => 100 * (1 + 0.001 * i));
  const falling = Array.from({ length: 60 }, (_, i) => 100 * (1 - 0.001 * i));
  assert.ok(sharpeRatio(rising) > 0);
  assert.ok(sharpeRatio(falling) < 0);
});

test('sharpeRatio: zero when returns have no variance (stdev = 0) but are non-negative', () => {
  // Constant positive return every period -> stdev of excess returns is 0
  const values = [100, 101, 102.01, 103.0301];
  assert.equal(sharpeRatio(values), 0);
});

test('riskSummary: bundles all three metrics', () => {
  const values = [100_000, 101_000, 99_000, 103_000, 102_000];
  const summary = riskSummary(values);
  assert.ok('sharpeRatio' in summary);
  assert.ok('maxDrawdownPercent' in summary);
  assert.ok('volatilityPercent' in summary);
});
