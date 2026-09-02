// A small hand-rolled fixed-window rate limiter — no `express-rate-limit`
// dependency. Tracks a request count per client key (IP by default) inside
// a rolling time window; once the window's limit is hit, further requests
// get a 429 with a Retry-After header until the window resets.

/**
 * @param {object} opts
 * @param {number} [opts.windowMs=60000] length of each counting window
 * @param {number} [opts.max=120] max requests allowed per window per key
 * @param {(req) => string} [opts.keyFn] how to derive the client key (defaults to req.ip)
 */
export function createRateLimiter({ windowMs = 60_000, max = 120, keyFn } = {}) {
  const hits = new Map(); // key -> { count, windowStart }
  const deriveKey = keyFn || ((req) => req.ip || req.socket?.remoteAddress || 'unknown');

  // Periodically forget stale windows so `hits` doesn't grow forever for a
  // long-running server. Not required for correctness (a stale entry's
  // window is simply treated as expired on next access), just for memory.
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now - entry.windowStart > windowMs) hits.delete(key);
    }
  }, windowMs).unref?.();

  function middleware(req, res, next) {
    const key = deriveKey(req);
    const now = Date.now();
    let entry = hits.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      entry = { count: 0, windowStart: now };
      hits.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(max - entry.count, 0);
    const resetInMs = windowMs - (now - entry.windowStart);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil(resetInMs / 1000)));
      return res.status(429).json({ error: 'Too many requests — slow down and try again shortly.' });
    }

    next();
  }

  middleware.stop = () => clearInterval(sweepInterval);
  return middleware;
}
