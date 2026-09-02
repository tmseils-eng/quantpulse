// Risk metrics computed from a value-over-time series (portfolio value, or
// an equity curve from a backtest) — oldest value first. These are shared by
// both the live portfolio (routes/portfolio.js) and the backtesting engine
// (backtest.js), so the same math means the same thing in both places.

/** Period-over-period returns (as decimals, e.g. 0.01 == +1%). */
export function periodReturns(values) {
  const out = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    if (prev) out.push((values[i] - prev) / prev);
  }
  return out;
}

/**
 * Annualized Sharpe ratio: mean excess return over its own stdev, scaled by
 * sqrt(periodsPerYear). `riskFreeAnnualRate` is a decimal (0.04 == 4%).
 * Returns null if there isn't enough history to compute a stdev.
 */
export function sharpeRatio(values, riskFreeAnnualRate = 0, periodsPerYear = 252) {
  const returns = periodReturns(values);
  if (returns.length < 2) return null;

  const periodRiskFree = riskFreeAnnualRate / periodsPerYear;
  const excess = returns.map((r) => r - periodRiskFree);
  const mean = excess.reduce((a, b) => a + b, 0) / excess.length;
  const variance = excess.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (excess.length - 1);
  const stdev = Math.sqrt(variance);
  if (stdev < 1e-9) return 0; // effectively constant returns — avoid dividing by ~0

  return round4((mean / stdev) * Math.sqrt(periodsPerYear));
}

/**
 * Maximum peak-to-trough decline over the series, as a percent (e.g. 12.5
 * means the portfolio was once 12.5% below its running high-water mark).
 */
export function maxDrawdown(values) {
  if (!values || values.length === 0) return null;

  let peak = values[0];
  let maxDD = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (peak - v) / peak : 0;
    if (dd > maxDD) maxDD = dd;
  }
  return round4(maxDD * 100);
}

/** Annualized volatility (stdev of period returns), as a percent. */
export function annualizedVolatility(values, periodsPerYear = 252) {
  const returns = periodReturns(values);
  if (returns.length < 2) return null;

  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  const stdev = Math.sqrt(variance);
  return round4(stdev * Math.sqrt(periodsPerYear) * 100);
}

/**
 * Bundles the three metrics above into one call — what the portfolio route
 * and the backtest report both actually want to show.
 */
export function riskSummary(values, { riskFreeAnnualRate = 0, periodsPerYear = 252 } = {}) {
  return {
    sharpeRatio: sharpeRatio(values, riskFreeAnnualRate, periodsPerYear),
    maxDrawdownPercent: maxDrawdown(values),
    volatilityPercent: annualizedVolatility(values, periodsPerYear),
  };
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
