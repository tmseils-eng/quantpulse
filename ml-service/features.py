"""
Feature engineering for the QuantPulse ML signal model.

Turns a list of daily OHLCV bars (the same `{date, open, high, low, close,
volume}` shape the Node API uses, oldest first) into a small set of
technical-indicator features, one row per bar. This mirrors the spirit of
`server/src/indicators.js` (SMA/RSI/MACD/Bollinger) but is a separate,
independent implementation in pandas — the two don't need to agree bit for
bit, since this is only ever consumed by the model, never displayed.
"""

import numpy as np
import pandas as pd

FEATURE_COLUMNS = [
    "return_1",
    "sma5_ratio",
    "sma20_ratio",
    "rsi14",
    "macd_hist",
    "bb_width",
    "vol_zscore",
]


def bars_to_frame(bars):
    df = pd.DataFrame(bars)
    df = df.sort_values("date").reset_index(drop=True)
    for col in ("open", "high", "low", "close", "volume"):
        df[col] = df[col].astype(float)
    return df


def compute_features(bars):
    """
    Returns a DataFrame with one row per input bar (same order/length as
    `bars`), the original OHLCV columns, the FEATURE_COLUMNS above, and a
    boolean `valid` column marking rows where every feature has enough
    trailing history to be non-NaN (the same "warmup" idea indicators.js
    uses — early bars just don't have a value yet).
    """
    df = bars_to_frame(bars)
    close = df["close"]
    volume = df["volume"]

    # 1-day return.
    df["return_1"] = close.pct_change()

    # Price relative to its 5/20-day SMA, rather than the raw SMA value, so
    # the feature is scale-free across symbols with very different prices.
    sma5 = close.rolling(5).mean()
    sma20 = close.rolling(20).mean()
    df["sma5_ratio"] = close / sma5 - 1
    df["sma20_ratio"] = close / sma20 - 1

    # RSI(14), Wilder-style smoothing via an EWM with alpha = 1/period. When
    # there have been no losses in the window (avg_loss == 0) RS is
    # undefined (division by zero) — the standard convention, matching
    # indicators.js's rsi(), is to read that as RSI = 100 rather than NaN.
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / 14, min_periods=14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / 14, min_periods=14, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100 - 100 / (1 + rs)
    df["rsi14"] = rsi.mask(avg_loss == 0, 100.0)

    # MACD histogram (12/26/9 EMAs, the standard settings).
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    macd_line = ema12 - ema26
    signal_line = macd_line.ewm(span=9, adjust=False).mean()
    df["macd_hist"] = macd_line - signal_line

    # Bollinger Band width as a fraction of the midline: (upper - lower) /
    # middle, with upper/lower = mean +/- 2 * population stdev — matches
    # indicators.js's numStdDev=2 convention (ddof=0).
    bb_mid = sma20
    bb_std = close.rolling(20).std(ddof=0)
    df["bb_width"] = (4 * bb_std) / bb_mid

    # Rolling z-score of volume — is today's volume unusual for this symbol.
    # A zero-variance window (volume identical for 20 straight bars — rare in
    # real data, common in hand-built test fixtures) reads as "not unusual",
    # i.e. z-score 0, rather than an undefined division by zero.
    vol_mean = volume.rolling(20).mean()
    vol_std = volume.rolling(20).std(ddof=0)
    vol_zscore = (volume - vol_mean) / vol_std.replace(0, np.nan)
    df["vol_zscore"] = vol_zscore.mask(vol_std == 0, 0.0)

    df["valid"] = ~df[FEATURE_COLUMNS].isna().any(axis=1)

    return df
