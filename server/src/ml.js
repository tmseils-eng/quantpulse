// Thin client for the optional Python ML microservice (ml-service/) that
// serves next-bar-direction predictions from a gradient-boosted model
// trained on technical-indicator features.
//
// This is a separate process and a separate language on purpose — it's how
// a real trading shop would actually split this (Python for modeling and
// research, a faster/simpler language for the execution path), rather than
// forcing a scikit-learn model into Node. QuantPulse works exactly as before
// if this service is never started; only the `ml_signal` backtest strategy
// depends on it, and it fails with a clear, catchable error rather than
// crashing the app when the service is unreachable or has no model yet.

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

export class MlServiceError extends Error {}

/**
 * @param {Array<{date:string, open:number, high:number, low:number, close:number, volume:number}>} bars
 *   Oldest-first daily bars, same shape used everywhere else in the app.
 * @returns {Promise<Array<{index:number, probabilityUp: number|null}>>}
 *   One entry per input bar, aligned by index. `probabilityUp` is null for
 *   bars that don't yet have enough trailing history for the model's
 *   features (the same "warmup" convention indicators.js uses).
 */
export async function getMlSignals(bars) {
  let res;
  try {
    res = await fetch(`${ML_SERVICE_URL}/predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bars }),
    });
  } catch (err) {
    throw new MlServiceError(
      `Could not reach the ML service at ${ML_SERVICE_URL} (${err.message}). ` +
        `Start it with "python app.py" from ml-service/, or set ML_SERVICE_URL.`
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new MlServiceError(`ML service returned ${res.status}: ${body}`);
  }

  const data = await res.json();
  if (data.modelLoaded === false) {
    throw new MlServiceError(
      'The ML service is running but has no trained model yet — run ' +
        '"python train.py" from ml-service/ first.'
    );
  }
  return data.predictions;
}
