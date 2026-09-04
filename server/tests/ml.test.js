import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { getMlSignals, MlServiceError } from '../src/ml.js';

function fakeResponse({ ok = true, status = 200, json, text = '' }) {
  return {
    ok,
    status,
    json: async () => json,
    text: async () => text,
  };
}

test('getMlSignals: returns the predictions array on a healthy response', async () => {
  const predictions = [{ index: 0, probabilityUp: null }, { index: 1, probabilityUp: 0.61 }];
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    fakeResponse({ json: { predictions, modelLoaded: true } })
  );

  try {
    const result = await getMlSignals([
      { date: '2024-01-01', open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      { date: '2024-01-02', open: 100, high: 102, low: 99, close: 101, volume: 1000 },
    ]);
    assert.deepEqual(result, predictions);
    assert.equal(fetchMock.mock.callCount(), 1);
    const [url, opts] = fetchMock.mock.calls[0].arguments;
    assert.ok(url.endsWith('/predict'));
    assert.equal(opts.method, 'POST');
  } finally {
    fetchMock.mock.restore();
  }
});

test('getMlSignals: throws MlServiceError when the service is unreachable', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () => {
    throw new Error('ECONNREFUSED');
  });

  try {
    await assert.rejects(() => getMlSignals([]), MlServiceError);
  } finally {
    fetchMock.mock.restore();
  }
});

test('getMlSignals: throws MlServiceError on a non-2xx response', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    fakeResponse({ ok: false, status: 500, text: 'boom' })
  );

  try {
    await assert.rejects(() => getMlSignals([]), MlServiceError);
  } finally {
    fetchMock.mock.restore();
  }
});

test('getMlSignals: throws MlServiceError when the service has no trained model yet', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async () =>
    fakeResponse({ json: { predictions: [], modelLoaded: false } })
  );

  try {
    await assert.rejects(() => getMlSignals([]), MlServiceError);
  } finally {
    fetchMock.mock.restore();
  }
});
