// Strategy backtesting engine. Runs a simple long/flat strategy (SMA
// crossover or RSI mean-reversion) against a series of historical daily
// bars and reports a trade log, an equity curve, and the same risk metrics
// (risk.js) used for the live portfolio — so a backtest's Sharpe/drawdown
// means exactly the same thing as the portfolio page's.

import { sma, rsi } from './indicators.js';
import { riskSummary } from './risk.js';

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

const STRATEGIES = {
  sma_crossover: (bars, p) => smaCrossoverSignals(bars, p.fastPeriod ?? 20, p.slowPeriod ?? 50),
  rsi: (bars, p) => rsiSignals(bars, p.rsiPeriod ?? 14, p.oversold ?? 30, p.overbought ?? 70),
};

/**
 * Run a backtest over `bars` (oldest first). The strategy is always fully
 * long or fully flat (no partial sizing, no shorting) — simple by design, so
 * the trade log stays easy to read and reason about. Returns the trade log,
 * equity curve, headline stats, and a buy-and-hold return for comparison.
 */
export function runBacktest(bars, options = {}) {
  const { strategy = 'sma_crossover', startingCash = 100_000, ...params } = options;

  if (!bars || bars.length < 2) {
    throw new BacktestError('Not enough history to backtest');
  }
  if (!STRATEGIES[strategy]) {
    throw new BacktestError(`Unknown strategy: ${strategy}`);
  }
  if (!Number.isFinite(startingCash) || startingCash <= 0) {
    throw new BacktestError('startingCash must be a positive number');
  }

  const signals = STRATEGIES[strategy](bars, params);

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
