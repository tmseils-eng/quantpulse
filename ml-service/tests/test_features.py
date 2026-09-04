"""
Unit tests for features.py, hand-computed where practical — the same
philosophy as the Node side's tests/indicators.test.js. Uses the standard
library's unittest (no pytest dependency) so this suite runs anywhere a
plain `python3` does.

Run with: python -m unittest discover -s tests -v   (from ml-service/)
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from features import FEATURE_COLUMNS, compute_features  # noqa: E402


def make_bars(closes, start="2024-01-01", volumes=None):
    import datetime

    start_date = datetime.date.fromisoformat(start)
    bars = []
    for i, c in enumerate(closes):
        d = start_date + datetime.timedelta(days=i)
        v = volumes[i] if volumes else 1_000_000
        bars.append({"date": d.isoformat(), "open": c, "high": c, "low": c, "close": c, "volume": v})
    return bars


class TestComputeFeatures(unittest.TestCase):
    def test_output_shape_matches_input(self):
        bars = make_bars([100 + i for i in range(40)])
        df = compute_features(bars)
        self.assertEqual(len(df), len(bars))
        for col in FEATURE_COLUMNS + ["valid"]:
            self.assertIn(col, df.columns)

    def test_early_rows_are_invalid_warmup(self):
        # The longest lookback (26-period MACD slow EMA / 20-period rolling
        # windows) means the first several rows can't have every feature yet.
        bars = make_bars([100 + i for i in range(30)])
        df = compute_features(bars)
        self.assertFalse(bool(df.loc[0, "valid"]))
        self.assertFalse(bool(df.loc[5, "valid"]))

    def test_enough_history_eventually_becomes_valid(self):
        bars = make_bars([100 + (i % 5) for i in range(60)])
        df = compute_features(bars)
        self.assertTrue(bool(df["valid"].iloc[-1]))

    def test_return_1_matches_hand_computed_percent_change(self):
        bars = make_bars([100, 110, 99])
        df = compute_features(bars)
        self.assertAlmostEqual(df.loc[1, "return_1"], 0.10, places=6)
        self.assertAlmostEqual(df.loc[2, "return_1"], (99 - 110) / 110, places=6)

    def test_flat_price_series_has_zero_sma_ratio_and_bb_width(self):
        bars = make_bars([100] * 40)
        df = compute_features(bars)
        last = df.iloc[-1]
        self.assertTrue(bool(last["valid"]))
        self.assertAlmostEqual(last["sma5_ratio"], 0.0, places=9)
        self.assertAlmostEqual(last["sma20_ratio"], 0.0, places=9)
        self.assertAlmostEqual(last["bb_width"], 0.0, places=9)  # zero stdev on a flat series
        self.assertAlmostEqual(last["macd_hist"], 0.0, places=9)

    def test_rsi_is_bounded_0_to_100(self):
        # A noisy-ish up/down series so RSI isn't trivially pinned at an edge.
        closes = [100]
        for i in range(60):
            closes.append(closes[-1] + (3 if i % 3 else -2))
        bars = make_bars(closes)
        df = compute_features(bars)
        valid_rsi = df.loc[df["valid"], "rsi14"]
        self.assertTrue((valid_rsi >= 0).all())
        self.assertTrue((valid_rsi <= 100).all())

    def test_steadily_rising_series_has_high_rsi(self):
        bars = make_bars([100 + i for i in range(40)])
        df = compute_features(bars)
        last = df.iloc[-1]
        self.assertTrue(bool(last["valid"]))
        self.assertGreater(last["rsi14"], 90)  # only gains, no losses -> RSI near 100

    def test_bars_are_sorted_by_date_regardless_of_input_order(self):
        bars = make_bars([100, 101, 102, 103, 104])
        shuffled = [bars[2], bars[0], bars[4], bars[1], bars[3]]
        df_sorted = compute_features(bars)
        df_shuffled = compute_features(shuffled)
        self.assertEqual(list(df_sorted["close"]), list(df_shuffled["close"]))


if __name__ == "__main__":
    unittest.main()
