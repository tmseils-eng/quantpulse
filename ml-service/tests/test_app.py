"""
Integration tests for app.py's HTTP surface, using Flask's built-in test
client (no extra dependency beyond flask itself, already in requirements.txt).

Run with: python -m unittest discover -s tests -v   (from ml-service/)
"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import app as app_module  # noqa: E402


def make_bars(n, start_price=100):
    bars = []
    price = start_price
    for i in range(n):
        price += 1
        bars.append(
            {
                "date": f"2024-01-{i + 1:02d}" if i < 28 else f"2024-02-{i - 27:02d}",
                "open": price,
                "high": price + 1,
                "low": price - 1,
                "close": price,
                "volume": 1_000_000,
            }
        )
    return bars


class DummyModel:
    """A model stand-in with the sklearn predict_proba shape (n, 2) so tests
    don't depend on an actual trained model.joblib being present."""

    def predict_proba(self, X):
        import numpy as np

        return np.column_stack([np.full(len(X), 0.3), np.full(len(X), 0.7)])


class TestApp(unittest.TestCase):
    def setUp(self):
        self.client = app_module.app.test_client()
        self._original_bundle = app_module._model_bundle

    def tearDown(self):
        app_module._model_bundle = self._original_bundle

    def test_health_reports_model_state(self):
        app_module._model_bundle = None
        res = self.client.get("/health")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["modelLoaded"], False)

        app_module._model_bundle = {"model": DummyModel(), "features": []}
        res = self.client.get("/health")
        self.assertEqual(res.get_json()["modelLoaded"], True)

    def test_predict_with_no_model_returns_nulls_not_an_error(self):
        app_module._model_bundle = None
        bars = make_bars(10)
        res = self.client.post("/predict", json={"bars": bars})
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertEqual(body["modelLoaded"], False)
        self.assertEqual(len(body["predictions"]), len(bars))
        self.assertTrue(all(p["probabilityUp"] is None for p in body["predictions"]))

    def test_predict_with_empty_bars_returns_empty_predictions(self):
        res = self.client.post("/predict", json={"bars": []})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.get_json()["predictions"], [])

    def test_predict_rejects_malformed_body(self):
        res = self.client.post("/predict", json={"not_bars": []})
        self.assertEqual(res.status_code, 400)
        self.assertIn("error", res.get_json())

    def test_predict_rejects_bar_missing_fields(self):
        res = self.client.post("/predict", json={"bars": [{"date": "2024-01-01", "close": 100}]})
        self.assertEqual(res.status_code, 400)

    def test_predict_with_loaded_model_returns_null_for_warmup_and_numbers_after(self):
        from features import FEATURE_COLUMNS

        app_module._model_bundle = {"model": DummyModel(), "features": FEATURE_COLUMNS}
        bars = make_bars(40)
        res = self.client.post("/predict", json={"bars": bars})
        self.assertEqual(res.status_code, 200)
        body = res.get_json()
        self.assertTrue(body["modelLoaded"])
        predictions = body["predictions"]
        self.assertEqual(len(predictions), len(bars))

        # Early (warmup) rows have no prediction; later rows get the dummy
        # model's constant 0.7 P(up).
        self.assertIsNone(predictions[0]["probabilityUp"])
        self.assertAlmostEqual(predictions[-1]["probabilityUp"], 0.7, places=4)

    def test_reload_picks_up_no_model_state(self):
        app_module._model_bundle = {"model": DummyModel(), "features": []}
        res = self.client.post("/reload")
        self.assertEqual(res.status_code, 200)
        # No model.joblib exists in the test environment, so a reload should
        # go back to "no model loaded".
        self.assertEqual(res.get_json()["modelLoaded"], False)
        self.assertIsNone(app_module._model_bundle)


if __name__ == "__main__":
    unittest.main()
