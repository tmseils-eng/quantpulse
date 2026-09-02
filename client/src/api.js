// Thin fetch wrapper for the QuantPulse API. API_BASE is injected at build
// time by build.js — empty string in production (same-origin, since Express
// serves the built client), or the local API port in dev.
const API_BASE = process.env.API_BASE || '';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  getSymbols: () => request('/api/stocks/symbols'),
  searchSymbols: (q) => request(`/api/stocks/search?q=${encodeURIComponent(q)}`),
  getQuote: (symbol) => request(`/api/stocks/${symbol}/quote`),
  getHistory: (symbol, days = 180) => request(`/api/stocks/${symbol}/history?days=${days}`),

  getWatchlist: () => request('/api/watchlist'),
  addToWatchlist: (symbol) =>
    request('/api/watchlist', { method: 'POST', body: JSON.stringify({ symbol }) }),
  removeFromWatchlist: (symbol) =>
    request(`/api/watchlist/${symbol}`, { method: 'DELETE' }),

  getPortfolio: () => request('/api/portfolio'),
  getTransactions: () => request('/api/portfolio/transactions'),
  getPortfolioHistory: () => request('/api/portfolio/history'),
  trade: (order) => request('/api/portfolio/trade', { method: 'POST', body: JSON.stringify(order) }),
  resetPortfolio: () => request('/api/portfolio/reset', { method: 'POST' }),
};
