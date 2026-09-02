import test from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter } from '../src/middleware/rateLimit.js';

function fakeReqRes(ip = '1.2.3.4') {
  const headers = {};
  const req = { ip };
  const res = {
    statusCode: null,
    body: null,
    setHeader(k, v) {
      headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    headers,
  };
  return { req, res };
}

test('createRateLimiter: allows requests under the limit', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 3 });
  let nextCalls = 0;
  const next = () => nextCalls++;

  for (let i = 0; i < 3; i++) {
    const { req, res } = fakeReqRes();
    limiter(req, res, next);
  }
  assert.equal(nextCalls, 3);
  limiter.stop();
});

test('createRateLimiter: blocks requests once the limit is exceeded, with a 429', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2 });
  const results = [];

  for (let i = 0; i < 4; i++) {
    const { req, res } = fakeReqRes();
    limiter(req, res, () => results.push('next'));
    if (res.statusCode) results.push(res.statusCode);
  }

  // First 2 calls pass through (next), the next 2 are blocked with 429.
  assert.deepEqual(results, ['next', 'next', 429, 429]);
  limiter.stop();
});

test('createRateLimiter: tracks separate windows per key (e.g. per IP)', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1 });
  let nextCalls = 0;
  const next = () => nextCalls++;

  const a = fakeReqRes('1.1.1.1');
  const b = fakeReqRes('2.2.2.2');
  limiter(a.req, a.res, next);
  limiter(b.req, b.res, next);
  // Each IP gets its own budget — both of these first requests should pass.
  assert.equal(nextCalls, 2);

  // A second request from the same IP as `a` should now be blocked.
  const aAgain = fakeReqRes('1.1.1.1');
  limiter(aAgain.req, aAgain.res, next);
  assert.equal(aAgain.res.statusCode, 429);
  assert.equal(nextCalls, 2);

  limiter.stop();
});

test('createRateLimiter: sets X-RateLimit-* headers on every response', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 5 });
  const { req, res } = fakeReqRes();
  limiter(req, res, () => {});
  assert.equal(res.headers['X-RateLimit-Limit'], '5');
  assert.equal(res.headers['X-RateLimit-Remaining'], '4');
  limiter.stop();
});

test('createRateLimiter: resets the count once the window elapses', async () => {
  const limiter = createRateLimiter({ windowMs: 20, max: 1 });
  const { req, res } = fakeReqRes();
  limiter(req, res, () => {}); // uses up the only slot

  const blocked = fakeReqRes();
  limiter(blocked.req, blocked.res, () => {});
  assert.equal(blocked.res.statusCode, 429);

  await new Promise((resolve) => setTimeout(resolve, 30)); // let the window elapse

  const afterReset = fakeReqRes();
  let passed = false;
  limiter(afterReset.req, afterReset.res, () => {
    passed = true;
  });
  assert.equal(passed, true);

  limiter.stop();
});

test('createRateLimiter: supports a custom key function', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, keyFn: (req) => req.userId });
  let nextCalls = 0;
  const { req: req1, res: res1 } = fakeReqRes();
  req1.userId = 'user-a';
  limiter(req1, res1, () => nextCalls++);

  const { req: req2, res: res2 } = fakeReqRes(); // same IP, different user
  req2.userId = 'user-b';
  limiter(req2, res2, () => nextCalls++);

  assert.equal(nextCalls, 2); // different keys, both allowed
  limiter.stop();
});
