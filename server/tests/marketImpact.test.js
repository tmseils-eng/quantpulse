import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMarketImpact } from '../src/marketImpact.js';

test('applyMarketImpact: a tiny order against deep volume barely moves the price', () => {
  const { fillPrice, impactPct } = applyMarketImpact('BUY', 1, 100, 10_000_000);
  assert.ok(impactPct < 0.01);
  assert.ok(Math.abs(fillPrice - 100) < 0.05);
});

test('applyMarketImpact: buys fill at or above the reference price', () => {
  const { fillPrice, impactPct } = applyMarketImpact('BUY', 50_000, 100, 1_000_000);
  assert.ok(fillPrice > 100);
  assert.ok(impactPct > 0);
});

test('applyMarketImpact: sells fill at or below the reference price', () => {
  const { fillPrice, impactPct } = applyMarketImpact('SELL', 50_000, 100, 1_000_000);
  assert.ok(fillPrice < 100);
  assert.ok(impactPct > 0);
});

test('applyMarketImpact: impact is capped so an enormous order cannot blow through the max', () => {
  const { impactPct, fillPrice } = applyMarketImpact('BUY', 500_000_000, 100, 1_000_000);
  assert.ok(impactPct <= 8.0001);
  assert.ok(fillPrice <= 108.01);
});

test('applyMarketImpact: a bigger order moves the price more than a smaller one', () => {
  const small = applyMarketImpact('BUY', 100, 100, 1_000_000);
  const big = applyMarketImpact('BUY', 10_000, 100, 1_000_000);
  assert.ok(big.impactPct > small.impactPct);
});

test('applyMarketImpact: falls back to a reference volume when avgDailyVolume is 0 or missing', () => {
  const withZero = applyMarketImpact('BUY', 1000, 100, 0);
  const withUndefined = applyMarketImpact('BUY', 1000, 100, undefined);
  assert.equal(withZero.fillPrice, withUndefined.fillPrice);
});

test('applyMarketImpact: rejects non-positive shares or price', () => {
  assert.throws(() => applyMarketImpact('BUY', 0, 100, 1_000_000), RangeError);
  assert.throws(() => applyMarketImpact('BUY', 10, -1, 1_000_000), RangeError);
});
