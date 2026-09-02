import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { encodeTextFrame, decodeFrames, attachWebSocketServer } from '../src/ws.js';

function maskedClientFrame(text, maskKey = [0x01, 0x02, 0x03, 0x04]) {
  const payload = Buffer.from(text, 'utf8');
  const masked = Buffer.alloc(payload.length);
  for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ maskKey[i % 4];
  const header = Buffer.from([0x81, 0x80 | payload.length, ...maskKey]);
  return Buffer.concat([header, masked]);
}

test('encodeTextFrame: short payload uses the 1-byte length form, unmasked', () => {
  const frame = encodeTextFrame('hi');
  assert.deepEqual([...frame], [0x81, 0x02, 0x68, 0x69]);
});

test('encodeTextFrame: payloads >= 126 bytes use the 16-bit extended length form', () => {
  const text = 'x'.repeat(200);
  const frame = encodeTextFrame(text);
  assert.equal(frame[0], 0x81);
  assert.equal(frame[1], 126);
  assert.equal(frame.readUInt16BE(2), 200);
  assert.equal(frame.length, 4 + 200);
});

test('decodeFrames: decodes a single masked client text frame', () => {
  const buffer = maskedClientFrame('hi');
  const { frames, rest } = decodeFrames(buffer);
  assert.equal(frames.length, 1);
  assert.equal(frames[0].fin, true);
  assert.equal(frames[0].opcode, 0x1);
  assert.equal(frames[0].payload.toString('utf8'), 'hi');
  assert.equal(rest.length, 0);
});

test('decodeFrames: a frame split across two buffers waits for the rest', () => {
  const full = maskedClientFrame('hello world');
  const part1 = full.subarray(0, 5);
  const part2 = full.subarray(5);

  const first = decodeFrames(part1);
  assert.equal(first.frames.length, 0); // not enough bytes yet
  assert.ok(first.rest.length > 0);

  const combined = Buffer.concat([first.rest, part2]);
  const second = decodeFrames(combined);
  assert.equal(second.frames.length, 1);
  assert.equal(second.frames[0].payload.toString('utf8'), 'hello world');
});

test('decodeFrames: multiple frames in one buffer are all decoded', () => {
  const buffer = Buffer.concat([maskedClientFrame('one'), maskedClientFrame('two')]);
  const { frames } = decodeFrames(buffer);
  assert.equal(frames.length, 2);
  assert.equal(frames[0].payload.toString('utf8'), 'one');
  assert.equal(frames[1].payload.toString('utf8'), 'two');
});

// Live round-trip against Node's built-in http server + the built-in global
// WebSocket client (browser-compatible) — exercises the real handshake and
// framing over an actual TCP socket, not just the pure encode/decode math.
test('attachWebSocketServer: real handshake + bidirectional message round-trip', async () => {
  const server = createServer((req, res) => {
    res.writeHead(404).end();
  });

  const serverReceived = [];
  let resolveServerMessage;
  const serverMessagePromise = new Promise((resolve) => {
    resolveServerMessage = resolve;
  });

  attachWebSocketServer(server, '/ws', (conn) => {
    conn.on('message', (msg) => {
      serverReceived.push(msg);
      resolveServerMessage();
      conn.send(JSON.stringify({ echo: msg }));
    });
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const ws = new WebSocket(`ws://localhost:${port}/ws`);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', reject);
  });

  const clientMessagePromise = new Promise((resolve) => {
    ws.addEventListener('message', (evt) => resolve(evt.data));
  });

  ws.send('ping from client');
  await serverMessagePromise;
  assert.deepEqual(serverReceived, ['ping from client']);

  const echoed = await clientMessagePromise;
  assert.deepEqual(JSON.parse(echoed), { echo: 'ping from client' });

  ws.close();
  await new Promise((resolve) => server.close(resolve));
});

test('attachWebSocketServer: rejects a non-WebSocket upgrade or wrong path', async () => {
  const server = createServer((req, res) => res.writeHead(404).end());
  let connected = false;
  attachWebSocketServer(server, '/ws', () => {
    connected = true;
  });

  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  await assert.rejects(
    () =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}/wrong-path`);
        ws.addEventListener('open', resolve);
        ws.addEventListener('error', reject);
      })
  );
  assert.equal(connected, false);

  await new Promise((resolve) => server.close(resolve));
});
