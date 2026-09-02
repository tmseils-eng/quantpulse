import { useEffect, useState } from 'react';
import { wsUrl } from './api.js';

/**
 * Optional live-tick overlay on top of regular polled data. Opens a
 * WebSocket, subscribes to `symbols`, and returns the latest tick per
 * symbol plus whether the socket is currently connected. This never
 * replaces polling — callers keep their existing `usePolling` call as the
 * source of truth and merge in ticks from here when present. If the
 * connection fails, never opens, or drops, `connected` just goes/stays
 * false and everything keeps working off the polled data alone.
 */
export function useLiveQuotes(symbols) {
  const [ticks, setTicks] = useState({});
  const [connected, setConnected] = useState(false);
  const symbolsKey = JSON.stringify([...new Set(symbols)].sort());

  useEffect(() => {
    if (symbols.length === 0) return undefined;

    let cancelled = false;
    let socket;
    try {
      socket = new WebSocket(wsUrl());
    } catch {
      return undefined; // WebSocket unavailable in this environment — stay on polling
    }

    socket.addEventListener('open', () => {
      if (cancelled) return;
      setConnected(true);
      socket.send(JSON.stringify({ type: 'subscribe', symbols: JSON.parse(symbolsKey) }));
    });

    socket.addEventListener('message', (evt) => {
      if (cancelled) return;
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'quote' && msg.symbol) {
          setTicks((prev) => ({ ...prev, [msg.symbol]: msg }));
        }
      } catch {
        // ignore malformed frames rather than crash the UI
      }
    });

    const onDrop = () => !cancelled && setConnected(false);
    socket.addEventListener('close', onDrop);
    socket.addEventListener('error', onDrop);

    return () => {
      cancelled = true;
      try {
        socket.close();
      } catch {
        // already closed
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbolsKey]);

  return { ticks, connected };
}
