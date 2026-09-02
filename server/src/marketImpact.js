// Market impact / slippage model.
//
// Real fills don't happen at the exact last-quoted price once an order gets
// big relative to how liquid the symbol is — a large buy pushes the price up
// as it fills, a large sell pushes it down. This models that with a
// square-root impact function (impact ~ sqrt(participation rate)), which is
// the same functional shape used in real transaction-cost-analysis models:
// impact grows with order size, but with diminishing marginal cost per
// share, and is capped so a single order can't blow through a sane bound.

const IMPACT_COEFFICIENT = 0.08; // strength of the impact curve
const MAX_IMPACT_PCT = 0.08; // hard cap: no fill moves more than 8% from reference price
const REFERENCE_VOLUME_FALLBACK = 500_000; // used if a symbol has no volume data available

/**
 * Compute the executed fill price for an order of `shares` against
 * `referencePrice` (the last quoted price), given `avgDailyVolume` (shares)
 * as a proxy for how liquid the symbol is. Buys fill at or above the
 * reference price, sells at or below it, scaling with order size.
 */
export function applyMarketImpact(side, shares, referencePrice, avgDailyVolume) {
  if (!Number.isFinite(shares) || shares <= 0) {
    throw new RangeError('shares must be a positive number');
  }
  if (!Number.isFinite(referencePrice) || referencePrice <= 0) {
    throw new RangeError('referencePrice must be a positive number');
  }

  const volume = avgDailyVolume > 0 ? avgDailyVolume : REFERENCE_VOLUME_FALLBACK;
  const participation = shares / volume;
  const impactPct = Math.min(IMPACT_COEFFICIENT * Math.sqrt(participation), MAX_IMPACT_PCT);
  const sign = side === 'BUY' ? 1 : -1;
  const fillPrice = referencePrice * (1 + sign * impactPct);

  return {
    fillPrice: round2(fillPrice),
    referencePrice: round2(referencePrice),
    impactPct: round4(impactPct * 100), // as a percent, e.g. 1.23 == 1.23%
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
