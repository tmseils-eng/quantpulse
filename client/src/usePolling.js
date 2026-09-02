import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs `fetchFn` immediately and then every `intervalMs`, exposing
 * {data, error, loading, refresh}. Used to keep quotes/portfolio state
 * "live" without a websocket — good enough for a paper-trading demo where
 * prices only need to move every so often.
 */
export function usePolling(fetchFn, intervalMs = 30_000, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;

  const refresh = useCallback(async () => {
    try {
      const result = await fetchFnRef.current();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh();
    if (!intervalMs) return undefined;
    const id = setInterval(refresh, intervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, refresh };
}
