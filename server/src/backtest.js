// Strategy backtesting engine. Runs a simple long/flat strategy (SMA
// crossover, RSI mean-reversion, or an ML-driven signal) against a series of
// historical daily bars and reports a trade log, an equity curve, and the
// same risk metrics (risk.js) used for the live portfolio — so a backtest's
// Sharpe/drawdown means exactly the same thing as the portfolio page's.

import { sma, rsi } from './indicators.js';
import { riskSummary } from './risk.js';
import { getMlSignals, MlServiceError } from './ml.js';

export class BacktestError extends Error {}

/** BUY/SELL/null per bar: a golden-cross / death-cross signal on two SMAs. */
function smaCrossoverSignals(bars, fastPeriod, slowPeriod) {
  const fast = sma(bars, fastPeriod);
  const slow = sma(bars, slowPeriod);
  const signals = new Array(bars.length).fill(null);

  for (let i = 1; i < bars.length; i++) {
    if (fast[i] == null || slow[i] == null || fast[i - 1] == null || slow[i - 1] == null) continue;
    const wasBelow = fast[i - 1] <= slow[i - 1];
    const nowAbove = fast[i] > slow[i];
    const wasAbove = fast[i - 1] >= slow[i - 1];
    const nowBelow = fast[i] < slow[i];

    if (wasBelow && nowAbove) signals[i] = 'BUY';
    else if (wasAbove && nowBelow) signals[i] = 'SELL';
  }
  return signals;
}

/** BUY/SELL/null per bar: buy the dip below `oversold`, sell above `overbought`. */
function rsiSignals(bars, period, oversold, overbought) {
  const rsiValues = rsi(bars, period);
  const signals = new Array(bars.length).fill(null);
  let inPosition = false;

  for (let i = 0; i < bars.length; i++) {
    if (rsiValues[i] == null) continue;
    if (!inPosition && rsiValues[i] < oversold) {
      signals[i] = 'BUY';
      inPosition = true;
    } else if (inPosition && rsiValues[i] > overbought) {
      signals[i] = 'SELL';
      inPosition = false;
    }
  }
  return signals;
}

/**
 * BUY/SELL/null per bar, driven by the ML service's per-bar P(next bar up).
 * Goes long once the model's confidence clears `threshold` and exits once it
 * drops to `exitThreshold` — a wider gap between the two (the default is
 * 0.55 / 0.45) avoids flipping position on every small wobble around 50/50.
 */
async function mlSignals(bars, params, deps) {
  const { threshold = 0.55, exitThreshold = 0.45 } = params;
  const fetchSignals = deps.getMlSignals || getMlSignals;

  let predictions;
  try {
    predictions = await fetchSignals(bars);
  } catch (err) {
    if (err instanceof MlServiceError) throw new BacktestError(err.message);
    throw err;
  }

  const signals = new Array(bars.length).fill(null);
  let inPosition = false;

  for (let i = 0; i < bars.length; i++) {
    const prob = predictions?.[i]?.probabilityUp;
    if (prob == null) continue;
    if (!inPosition && prob >= threshold) {
      signals[i] = 'BUY';
      inPosition = true;
    } else if (inPosition && prob <= exitThreshold) {
      signals[i] = 'SELL';
      inPosition = false;
    }
  }
  return signals;
}

// Each generator returns (or resolves to) a BUY/SELL/null array aligned with
// `bars`. sma_crossover/rsi are synchronous; ml_signal is async (it calls
// out to the ML service) — runBacktest awaits all three the same way so the
// rest of the engine doesn't need to know which kind of strategy it's running.
const SIGNAL_GENERATORS = {
  sma_crossover: (bars, p) => smaCrossoverSignals(bars, p.fastPeriod ?? 20, p.slowPeriod ?? 50),
  rsi: (bars, p) => rsiSignals(bars, p.rsiPeriod ?? 14, p.oversold ?? 30, p.overbought ?? 70),
  ml_signal: (bars, p, deps) => mlSignals(bars, p, deps),
};

/**
 * Run a backtest over `bars` (oldest first). The strategy is always fully
 * long or fully flat (no partial sizing, no shorting) — simple by design, so
 * the trade log stays easy to read and reason about. Returns the trade log,
 * equity curve, headline stats, and a buy-and-hold return for comparison.
 *
 * `deps` is test/DI-only: pass `{ getMlSignals }` to substitute a fake ML
 * client instead of calling the real service (see backtest.test.js).
 */
export async function runBacktest(bars, options = {}, deps = {}) {
  const { strategy = 'sma_crossover', startingCash = 100_000, ...params } = options;

  if (!bars || bars.length < 2) {
    throw new BacktestError('Not enough history to backtest');
  }
  if (!SIGNAL_GENERATORS[strategy]) {
    throw new BacktestError(`Unknown strategy: ${strategy}`);
  }
  if (!Number.isFinite(startingCash) || startingCash <= 0) {
    throw new BacktestError('startingCash must be a positive number');
  }

  const signals = await SIGNAL_GENERATORS[strategy](bars, params, deps);

  let cash = startingCash;
  let shares = 0;
  let entryPrice = null;
  const trades = [];
  const equityCurve = [];

  for (let i = 0; i < bars.length; i++) {
    const price = bars[i].close;
    const signal = signals[i];

    if (signal === 'BUY' && shares === 0 && cash > 0) {
      shares = cash / price;
      entryPrice = price;
      cash = 0;
      trades.push({ date: bars[i].date, side: 'BUY', price: round2(price), shares: round4(shares) });
    } else if (signal === 'SELL' && shares > 0) {
      cash = shares * price;
      trades.push({
        date: bars[i].date,
        side: 'SELL',
        price: round2(price),
        shares: round4(shares),
        pnlPercent: round2(((price - entryPrice) / entryPrice) * 100),
      });
      shares = 0;
      entryPrice = null;
    }

    equityCurve.push(round2(cash + shares * price));
  }

  // Liquidate any still-open position at the last close so the reported
  // return reflects a clean, fully-realized outcome.
  if (shares > 0) {
    const lastBar = bars[bars.length - 1];
    cash = shares * lastBar.close;
    trades.push({
      date: lastBar.date,
      side: 'SELL (mark-to-close)',
      price: round2(lastBar.close),
      shares: round4(shares),
      pnlPercent: round2(((lastBar.close - entryPrice) / entryPrice) * 100),
    });
    shares = 0;
  }

  const finalValue = round2(cash);
  const sellTrades = trades.filter((t) => t.side.startsWith('SELL'));
  const wins = sellTrades.filter((t) => t.pnlPercent > 0).length;

  const buyAndHoldReturnPercent = round2(
    ((bars[bars.length - 1].close - bars[0].close) / bars[0].close) * 100
  );

  return {
    strategy,
    params,
    startingCash,
    finalValue,
    totalReturnPercent: round2(((finalValue - startingCash) / startingCash) * 100),
    buyAndHoldReturnPercent,
    tradeCount: sellTrades.length,
    winRate: sellTrades.length ? round2((wins / sellTrades.length) * 100) : null,
    trades,
    equityCurve,
    risk: riskSummary(equityCurve),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
