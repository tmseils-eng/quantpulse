"""
QuantPulse ML signal service.

A small Flask app that serves next-bar-direction predictions from a
gradient-boosted classifier trained on the technical features in
features.py. This is intentionally a separate Python process from the main
Node/Express API (server/) — QuantPulse's core app has zero Python
dependency; this service only backs the optional `ml_signal` backtest
strategy (see server/src/ml.js and server/src/backtest.js).

Run it with `python train.py` first to produce model.joblib, then:
    python app.py
(or `flask --app app run --port 8000` / behind a real WSGI server such as
gunicorn in a heavier-traffic deployment — Flask's own dev server is plenty
for this project's scope, the same "hand-rolled over a heavier dependency
where reasonable" choice the rest of QuantPulse makes.)
"""

import os
from pathlib import Path

import joblib
import numpy as np
from flask import Flask, jsonify, request

from features import compute_features

MODEL_PATH = Path(os.environ.get("ML_MODEL_PATH", Path(__file__).parent / "model.joblib"))

app = Flask(__name__)

_model_bundle = None


def load_model():
    """Loads model.joblib if present. Safe to call again after retraining."""
    global _model_bundle
    _model_bundle = joblib.load(MODEL_PATH) if MODEL_PATH.exists() else None
    return _model_bundle


load_model()

REQUIRED_BAR_FIELDS = ("date", "open", "high", "low", "close", "volume")


def parse_bars(payload):
    """Validates and coerces the request body's `bars` list. Raises ValueError
    with a human-readable message on anything malformed."""
    bars = payload.get("bars") if isinstance(payload, dict) else None
    if bars is None:
        raise ValueError("request body must be a JSON object with a `bars` array")
    if not isinstance(bars, list):
        raise ValueError("`bars` must be an array")

    parsed = []
    for i, bar in enumerate(bars):
        if not isinstance(bar, dict) or not all(k in bar for k in REQUIRED_BAR_FIELDS):
            raise ValueError(f"bars[{i}] is missing one of {REQUIRED_BAR_FIELDS}")
        parsed.append(
            {
                "date": str(bar["date"]),
                "open": float(bar["open"]),
                "high": float(bar["high"]),
                "low": float(bar["low"]),
                "close": float(bar["close"]),
                "volume": float(bar["volume"]),
            }
        )
    return parsed


@app.get("/health")
def health():
    return jsonify(status="ok", modelLoaded=_model_bundle is not None, modelPath=str(MODEL_PATH))


@app.post("/reload")
def reload_model():
    """Re-reads model.joblib from disk without restarting the process — lets
    train.py produce a fresh model that this service picks up on the next
    request without a redeploy."""
    load_model()
    return jsonify(modelLoaded=_model_bundle is not None)


@app.post("/predict")
def predict():
    try:
        bars = parse_bars(request.get_json(force=True, silent=False) or {})
    except (ValueError, TypeError) as exc:
        return jsonify(error=str(exc)), 400

    if len(bars) == 0:
        return jsonify(predictions=[], modelLoaded=_model_bundle is not None)

    df = compute_features(bars)

    if _model_bundle is None:
        # No trained model yet — respond with nulls and modelLoaded: false
        # rather than a 5xx, so callers (ml.js) can surface a clear message
        # ("run train.py first") instead of a generic server error.
        predictions = [{"index": i, "probabilityUp": None} for i in range(len(df))]
        return jsonify(predictions=predictions, modelLoaded=False)

    model = _model_bundle["model"]
    features = _model_bundle["features"]

    valid_mask = df["valid"].to_numpy()
    probs = np.full(len(df), np.nan)
    if valid_mask.any():
        probs[valid_mask] = model.predict_proba(df.loc[valid_mask, features])[:, 1]

    predictions = [
        {"index": i, "probabilityUp": None if np.isnan(probs[i]) else round(float(probs[i]), 4)}
        for i in range(len(df))
    ]
    return jsonify(predictions=predictions, modelLoaded=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
