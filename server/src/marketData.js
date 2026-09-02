// Market data provider.
//
// If ALPHA_VANTAGE_KEY is set, real daily price history is pulled from Alpha
// Vantage's free tier (https://www.alphavantage.co) and cached in-memory to
// respect the 5-requests/minute limit. Without a key, QuantPulse falls back
// to a deterministic simulated market so the app is fully usable out of the
// box — each symbol follows a seeded random walk, so prices are stable
// across requests within a run instead of jumping around randomly.

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_KEY || '';
const ALPHA_VANTAGE_URL = 'https://www.alphavantage.co/query';
const CACHE_TTL_MS = 60_000;

export const KNOWN_SYMBOLS = {
  AAPL: { name: 'Apple Inc.', sector: 'Technology', basePrice: 227 },
  MSFT: { name: 'Microsoft Corporation', sector: 'Technology', basePrice: 421 },
  NVDA: { name: 'NVIDIA Corporation', sector: 'Semiconductors', basePrice: 118 },
  TSLA: { name: 'Tesla, Inc.', sector: 'Automotive', basePrice: 248 },
  AMZN: { name: 'Amazon.com, Inc.', sector: 'Consumer Discretionary', basePrice: 186 },
  GOOGL: { name: 'Alphabet Inc.', sector: 'Technology', basePrice: 165 },
  META: { name: 'Meta Platforms, Inc.', sector: 'Technology', basePrice: 512 },
  JPM: { name: 'JPMorgan Chase & Co.', sector: 'Financials', basePrice: 210 },
  V: { name: 'Visa Inc.', sector: 'Financials', basePrice: 275 },
  DIS: { name: 'The Walt Disney Company', sector: 'Media & Entertainment', basePrice: 96 },
};

const cache = new Map(); // key -> { data, expiresAt }

function cacheGet(key) {
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.data;
  return null;
}

function cacheSet(key, data, ttl = CACHE_TTL_MS) {
  cache.set(key, { data, expiresAt: Date.now() + ttl });
}

// --- Deterministic seeded PRNG (mulberry32) so a symbol's simulated history
// is stable across requests instead of re-randomizing every call. ---
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function symbolMeta(symbol) {
  return (
    KNOWN_SYMBOLS[symbol] || {
      name: symbol,
      sector: 'Unknown',
      basePrice: 50 + (hashSeed(symbol) % 200),
    }
  );
}

// How far back the simulated walk is anchored, in calendar days. The walk
// always runs from this fixed anchor up to today and is cached in full per
// symbol — callers then slice the tail they need. That's what keeps a
// symbol's "current" price consistent no matter how many days of history a
// given request asks for (a 30-day quote lookup and a 180-day chart lookup
// must agree on today's close).
const MOCK_ANCHOR_CALENDAR_DAYS = 900;

const mockHistoryCache = new Map(); // symbol -> full bar array

/**
 * Simulated daily OHLCV history for a symbol, deterministic per symbol and
 * per UTC calendar day (so it doesn't re-randomize on every request), plus a
 * small within-the-minute tick on the final bar so a "live" quote moves.
 */
function generateMockHistory(symbol) {
  const meta = symbolMeta(symbol);
  const rand = mulberry32(hashSeed(symbol));
  const bars = [];
  let price = meta.basePrice * (0.75 + rand() * 0.5);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let i = MOCK_ANCHOR_CALENDAR_DAYS - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setUTCDate(date.getUTCDate() - i);
    // Skip weekends to look like a real trading calendar.
    if (date.getUTCDay() === 0 || date.getUTCDay() === 6) continue;

    const drift = (rand() - 0.485) * 0.028; // slight upward bias, ~market-like
    price = Math.max(1, price * (1 + drift));

    const open = price * (1 + (rand() - 0.5) * 0.01);
    const close = price;
    const high = Math.max(open, close) * (1 + rand() * 0.012);
    const low = Math.min(open, close) * (1 - rand() * 0.012);
    const volume = Math.round(1_000_000 + rand() * 9_000_000);

    bars.push({
      date: date.toISOString().slice(0, 10),
      open: round2(open),
      high: round2(high),
      low: round2(low),
      close: round2(close),
      volume,
    });
  }

  // Nudge the final bar deterministically within the current minute so the
  // "live" quote ticks slightly without breaking day-to-day stability.
  const minuteSeed = Math.floor(Date.now() / CACHE_TTL_MS);
  const tickRand = mulberry32(hashSeed(symbol + ':' + minuteSeed));
  const last = bars[bars.length - 1];
  const tick = (tickRand() - 0.5) * 0.006;
  last.close = round2(last.close * (1 + tick));
  last.high = Math.max(last.high, last.close);
  last.low = Math.min(last.low, last.close);

  return bars;
}

let mockCacheDay = null;

function getMockHistory(symbol, days) {
  const today = new Date().toISOString().slice(0, 10);
  if (mockCacheDay !== today) {
    // The calendar day rolled over — yesterday's cached walks are stale
    // (each bakes in "today" as its final bar), so start fresh.
    mockHistoryCache.clear();
    mockCacheDay = today;
  }

  let full = mockHistoryCache.get(symbol);
  if (!full) {
    full = generateMockHistory(symbol);
    mockHistoryCache.set(symbol, full);
  }
  return full.slice(-days).map((bar) => ({ ...bar }));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

async function fetchAlphaVantageDaily(symbol) {
  const url = `${ALPHA_VANTAGE_URL}?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(
    symbol
  )}&outputsize=compact&apikey=${ALPHA_VANTAGE_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);
  const json = await res.json();
  const series = json['Time Series (Daily)'];
  if (!series) return null; // rate-limited or invalid symbol — caller falls back to mock
  return Object.entries(series)
    .map(([date, bar]) => ({
      date,
      open: parseFloat(bar['1. open']),
      high: parseFloat(bar['2. high']),
      low: parseFloat(bar['3. low']),
      close: parseFloat(bar['4. close']),
      volume: parseInt(bar['5. volume'], 10),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export async function getHistory(symbol, days = 180) {
  const key = `history:${symbol}:${days}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  let bars = null;
  if (ALPHA_VANTAGE_KEY) {
    try {
      const full = await fetchAlphaVantageDaily(symbol);
      if (full) bars = full.slice(-days);
    } catch {
      bars = null; // fall through to mock
    }
  }
  if (!bars) bars = getMockHistory(symbol, days);

  cacheSet(key, bars);
  return bars;
}

export async function getQuote(symbol) {
  const history = await getHistory(symbol, 30);
  const last = history[history.length - 1];
  const prev = history[history.length - 2] || last;
  const change = round2(last.close - prev.close);
  const changePercent = prev.close ? round2((change / prev.close) * 100) : 0;
  const meta = symbolMeta(symbol);

  return {
    symbol,
    name: meta.name,
    sector: meta.sector,
    price: last.close,
    change,
    changePercent,
    volume: last.volume,
    high: last.high,
    low: last.low,
    open: last.open,
    asOf: last.date,
    source: ALPHA_VANTAGE_KEY ? 'alpha_vantage' : 'simulated',
  };
}

export async function getQuotes(symbols) {
  return Promise.all(symbols.map(getQuote));
}

export function searchSymbols(query) {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  return Object.entries(KNOWN_SYMBOLS)
    .filter(([symbol, meta]) => symbol.includes(q) || meta.name.toUpperCase().includes(q))
    .map(([symbol, meta]) => ({ symbol, name: meta.name, sector: meta.sector }));
}
