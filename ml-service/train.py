"""
Trains the QuantPulse ML signal model: a gradient-boosted classifier that
predicts P(next daily bar closes higher than this one) from the technical
features in features.py.

Usage (with the QuantPulse server running, e.g. `npm run dev:server`):
    python train.py
    python train.py --symbols AAPL MSFT NVDA --days 900
    python train.py --api-base http://localhost:4000

This pulls price history straight from QuantPulse's own /api/stocks/*
endpoint — the same simulated-or-real (Alpha Vantage) data the rest of the
app sees — builds a labeled dataset across several symbols, and saves the
trained model to model.joblib, where app.py picks it up.

A note on expectations: with no ALPHA_VANTAGE_KEY set, the server's price
history is a deterministic *random walk* by design (see marketData.js) —
there's no real autocorrelation for a model to find, so holdout accuracy
here should land close to 50%, i.e. a coin flip. That's the correct,
honest outcome for a random walk, not a bug. Set ALPHA_VANTAGE_KEY on the
server and retrain against real daily history to see whether these features
carry any actual predictive signal.
"""

import argparse
import sys
from pathlib import Path

import joblib
import pandas as pd
import requests
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.metrics import accuracy_score, roc_auc_score

from features import FEATURE_COLUMNS, compute_features

MODEL_PATH = Path(__file__).parent / "model.joblib"

DEFAULT_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMZN", "GOOGL", "META", "JPM", "V", "DIS"]


def fetch_bars(api_base, symbol, days):
    url = f"{api_base}/api/stocks/{symbol}/history?days={days}"
    res = requests.get(url, timeout=30)
    res.raise_for_status()
    return res.json()["bars"]


def build_dataset(bars):
    """Features + a next-bar-up label, restricted to fully-warmed-up rows
    that also have a next bar to label (so the last row is dropped)."""
    df = compute_features(bars)
    df["label"] = (df["close"].shift(-1) > df["close"]).astype(int)
    df = df.iloc[:-1]
    return df[df["valid"]]


def main():
    parser = argparse.ArgumentParser(description="Train the QuantPulse ML signal model.")
    parser.add_argument("--api-base", default="http://localhost:4000", help="QuantPulse server URL")
    parser.add_argument("--symbols", nargs="+", default=DEFAULT_SYMBOLS)
    parser.add_argument("--days", type=int, default=900)
    parser.add_argument("--test-fraction", type=float, default=0.2)
    args = parser.parse_args()

    print(f"Fetching history for {len(args.symbols)} symbols from {args.api_base} ...")
    frames = []
    for symbol in args.symbols:
        try:
            bars = fetch_bars(args.api_base, symbol, args.days)
        except Exception as exc:  # noqa: BLE001 - report and keep going
            print(f"  {symbol}: skipped ({exc})", file=sys.stderr)
            continue
        df = build_dataset(bars)
        df["symbol"] = symbol
        frames.append(df)
        print(f"  {symbol}: {len(df)} labeled rows")

    if not frames:
        print(
            f"\nNo training data fetched — is the QuantPulse server running at {args.api_base}?",
            file=sys.stderr,
        )
        sys.exit(1)

    data = pd.concat(frames, ignore_index=True)

    # Each symbol's rows are already oldest-first and concatenated in that
    # order, so a simple row-order split keeps the holdout chronologically
    # after the training data per symbol — no shuffling, which would leak
    # future bars into training.
    split = int(len(data) * (1 - args.test_fraction))
    train, test = data.iloc[:split], data.iloc[split:]
    print(f"\nTraining on {len(train)} rows, holding out {len(test)} rows.")

    model = GradientBoostingClassifier(random_state=42)
    model.fit(train[FEATURE_COLUMNS], train["label"])

    preds = model.predict(test[FEATURE_COLUMNS])
    probs = model.predict_proba(test[FEATURE_COLUMNS])[:, 1]
    print(f"\nHoldout accuracy: {accuracy_score(test['label'], preds):.3f}")
    try:
        print(f"Holdout ROC AUC:  {roc_auc_score(test['label'], probs):.3f}")
    except ValueError:
        print("Holdout ROC AUC:  n/a (holdout has only one class)")

    joblib.dump({"model": model, "features": FEATURE_COLUMNS}, MODEL_PATH)
    print(f"\nSaved model to {MODEL_PATH}")
    print(
        "If ml-service is already running, POST /reload (or just restart it) "
        "to pick up this model."
    )


if __name__ == "__main__":
    main()
