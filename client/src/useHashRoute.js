import { useEffect, useState } from 'react';

/**
 * Minimal hash-based router — no react-router dependency needed for an app
 * with three views. Reads `#/`, `#/stock/AAPL`, `#/portfolio` and re-renders
 * on hashchange (including programmatic navigation via `navigate()`).
 */
export function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/');

  useEffect(() => {
    const onChange = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);

  if (parts[0] === 'stock' && parts[1]) {
    return { route: 'stock', symbol: parts[1].toUpperCase() };
  }
  if (parts[0] === 'portfolio') {
    return { route: 'portfolio' };
  }
  return { route: 'dashboard' };
}

export function navigate(path) {
  window.location.hash = path;
}
