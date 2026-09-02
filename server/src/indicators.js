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

function round2(n) {
  return Math.round(n * 100) / 100;
}
