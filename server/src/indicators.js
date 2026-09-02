// Technical indicator calculations over an array of daily bars
// (`{ date, open, high, low, close, volume }`, oldest first).
// Each function returns an array the same length as the input, with `null`
// for indices where there isn't yet enough history to compute a value —
// that keeps the output aligned with `bars` for easy charting.

/** Simple Moving Average over `period` closes. */
export function sma(bars, period) {
  const closes = bars.map((b) => b.close);
  const out = new Array(closes.length).fill(null);
  let sum = 0;

  for (let i = 0; i < closes.length; i++) {
    sum += closes[i];
    if (i >= period) sum -= closes[i - period];
    if (i >= period - 1) out[i] = round2(sum / period);
  }
  return out;
}

/** Exponential Moving Average over `period` closes. */
export function ema(bars, period) {
  const closes = bars.map((b) => b.close);
  const out = new Array(closes.length).fill(null);
  if (closes.length === 0) return out;

  const k = 2 / (period + 1);
  let prev = null;

  for (let i = 0; i < closes.length; i++) {
    if (i === period - 1) {
      const seed = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
      prev = seed;
      out[i] = round2(prev);
    } else if (i >= period) {
      prev = closes[i] * k + prev * (1 - k);
      out[i] = round2(prev);
    }
  }
  return out;
}

/**
 * Relative Strength Index (Wilder's smoothing), `period` typically 14.
 * RSI > 70 is conventionally read as overbought, < 30 as oversold.
 */
export function rsi(bars, period = 14) {
  const closes = bars.map((b) => b.close);
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i] - closes[i - 1];
    if (delta >= 0) gainSum += delta;
    else lossSum -= delta;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = computeRsi(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i] - closes[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = computeRsi(avgGain, avgLoss);
  }
  return out;
}

function computeRsi(avgGain, avgLoss) {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return round2(100 - 100 / (1 + rs));
}

/** Daily percent change series, first element null. */
export function dailyReturns(bars) {
  const out = new Array(bars.length).fill(null);
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1].close;
    out[i] = prev ? round2(((bars[i].close - prev) / prev) * 100) : null;
  }
  return out;
}

/** Realized volatility: annualized stdev of daily returns, as a percent. */
export function volatility(bars) {
  const returns = dailyReturns(bars).filter((r) => r !== null);
  if (returns.length < 2) return null;
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (returns.length - 1);
  const dailyStdev = Math.sqrt(variance);
  return round2(dailyStdev * Math.sqrt(252)); // annualized, %
}

/**
 * MACD (Moving Average Convergence Divergence): the difference between a
 * fast and slow EMA, plus a signal line (EMA of that difference) and the
 * histogram (macd - signal). Defaults (12, 26, 9) are the standard settings.
 * Returns `{ macd, signal, histogram }`, each an array aligned with `bars`.
 */
export function macd(bars, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEma = emaRaw(bars.map((b) => b.close), fastPeriod);
  const slowEma = emaRaw(bars.map((b) => b.close), slowPeriod);

  const macdLine = bars.map((_, i) =>
    fastEma[i] != null && slowEma[i] != null ? fastEma[i] - slowEma[i] : null
  );

  // The signal line is an EMA of the MACD line itself, seeded once the MACD
  // line has `signalPeriod` consecutive non-null values (i.e. from slowPeriod
  // onward).
  const signalLine = new Array(bars.length).fill(null);
  const firstValid = macdLine.findIndex((v) => v !== null);
  if (firstValid !== -1 && bars.length - firstValid >= signalPeriod) {
    const k = 2 / (signalPeriod + 1);
    let prev = null;
    for (let i = firstValid; i < bars.length; i++) {
      if (i === firstValid + signalPeriod - 1) {
        const seed =
          macdLine.slice(firstValid, firstValid + signalPeriod).reduce((a, b) => a + b, 0) /
          signalPeriod;
        prev = seed;
        signalLine[i] = round4(prev);
      } else if (i >= firstValid + signalPeriod) {
        prev = macdLine[i] * k + prev * (1 - k);
        signalLine[i] = round4(prev);
      }
    }
  }

  const histogram = bars.map((_, i) =>
    macdLine[i] != null && signalLine[i] != null ? round4(macdLine[i] - signalLine[i]) : null
  );

  return {
    macd: macdLine.map((v) => (v == null ? null : round4(v))),
    signal: signalLine,
    histogram,
  };
}

// Like ema(), but returns unrounded values and doesn't require `bars` objects
// (used internally by macd() so intermediate precision isn't lost to round2).
function emaRaw(closes, period) {
  const out = new Array(closes.length).fill(null);
  if (closes.length === 0) return out;
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < closes.length; i++) {
    if (i === period - 1) {
      prev = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
      out[i] = prev;
    } else if (i >= period) {
      prev = closes[i] * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/**
 * Bollinger Bands: an `sma(period)` middle band plus upper/lower bands
 * `numStdDev` standard deviations away, computed over the same rolling
 * window. Returns `{ middle, upper, lower }`, each aligned with `bars`.
 */
export function bollingerBands(bars, period = 20, numStdDev = 2) {
  const closes = bars.map((b) => b.close);
  const middle = new Array(closes.length).fill(null);
  const upper = new Array(closes.length).fill(null);
  const lower = new Array(closes.length).fill(null);

  for (let i = period - 1; i < closes.length; i++) {
    const window = closes.slice(i - period + 1, i + 1);
    const mean = window.reduce((a, b) => a + b, 0) / period;
    const variance = window.reduce((sum, c) => sum + (c - mean) ** 2, 0) / period;
    const stdev = Math.sqrt(variance);
    middle[i] = round2(mean);
    upper[i] = round2(mean + numStdDev * stdev);
    lower[i] = round2(mean - numStdDev * stdev);
  }

  return { middle, upper, lower };
}

/**
 * Volume-Weighted Average Price, cumulative from the start of `bars` (a
 * "session" VWAP would reset daily — since our bars are already daily
 * granularity, this is the running VWAP across the whole series). Uses the
 * typical price ((high + low + close) / 3) per bar, weighted by volume.
 */
export function vwap(bars) {
  const out = new Array(bars.length).fill(null);
  let cumulativePV = 0;
  let cumulativeVolume = 0;

  for (let i = 0; i < bars.length; i++) {
    const typicalPrice = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const volume = bars[i].volume || 0;
    cumulativePV += typicalPrice * volume;
    cumulativeVolume += volume;
    out[i] = cumulativeVolume > 0 ? round2(cumulativePV / cumulativeVolume) : null;
  }
  return out;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
