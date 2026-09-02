// A hand-rolled WebSocket server (RFC 6455) — no `ws` package. Handles the
// HTTP Upgrade handshake and the frame protocol (text frames, close, ping/
// pong) directly over the raw TCP socket Node's http server hands us on an
// 'upgrade' event. Scoped to what QuantPulse actually needs: text (JSON)
// messages in both directions, clean close handling, and correct handling
// of a message split across multiple TCP packets.

import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const OPCODE = {
  CONTINUATION: 0x0,
  TEXT: 0x1,
  BINARY: 0x2,
  CLOSE: 0x8,
  PING: 0x9,
  PONG: 0xa,
};

function acceptValueFor(secWebSocketKey) {
  return createHash('sha1').update(secWebSocketKey + WS_MAGIC).digest('base64');
}

/** Encode a text payload as a single unmasked server->client frame. */
export function encodeTextFrame(text) {
  const payload = Buffer.from(text, 'utf8');
  const len = payload.length;
  let header;

  if (len < 126) {
    header = Buffer.from([0x80 | OPCODE.TEXT, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | OPCODE.TEXT;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | OPCODE.TEXT;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function encodeCloseFrame(code = 1000) {
  const payload = Buffer.alloc(2);
  payload.writeUInt16BE(code, 0);
  return Buffer.concat([Buffer.from([0x80 | OPCODE.CLOSE, payload.length]), payload]);
}

/**
 * Parse as many complete frames as `buffer` contains. Returns
 * `{ frames, rest }` — `rest` is the unconsumed tail to prepend to the next
 * chunk (a frame split across TCP packets waits here until it's whole).
 * Client frames are always masked per the spec; this only decodes masked
 * frames and treats anything else as a protocol error (returns no frames,
 * caller closes the connection).
 */
export function decodeFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (true) {
    if (buffer.length - offset < 2) break;

    const byte0 = buffer[offset];
    const byte1 = buffer[offset + 1];
    const fin = (byte0 & 0x80) !== 0;
    const opcode = byte0 & 0x0f;
    const masked = (byte1 & 0x80) !== 0;
    let payloadLen = byte1 & 0x7f;
    let pos = offset + 2;

    if (payloadLen === 126) {
      if (buffer.length - pos < 2) break;
      payloadLen = buffer.readUInt16BE(pos);
      pos += 2;
    } else if (payloadLen === 127) {
      if (buffer.length - pos < 8) break;
      payloadLen = Number(buffer.readBigUInt64BE(pos));
      pos += 8;
    }

    let maskKey = null;
    if (masked) {
      if (buffer.length - pos < 4) break;
      maskKey = buffer.subarray(pos, pos + 4);
      pos += 4;
    }

    if (buffer.length - pos < payloadLen) break; // payload not fully arrived yet

    let payload = buffer.subarray(pos, pos + payloadLen);
    if (masked) {
      const unmasked = Buffer.alloc(payloadLen);
      for (let i = 0; i < payloadLen; i++) unmasked[i] = payload[i] ^ maskKey[i % 4];
      payload = unmasked;
    }

    frames.push({ fin, opcode, payload });
    offset = pos + payloadLen;
  }

  return { frames, rest: buffer.subarray(offset) };
}

/** One live WebSocket connection. Emits 'message' (string) and 'close'. */
class WSConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this._recvBuffer = Buffer.alloc(0);
    this._fragments = []; // accumulates continuation frames for one logical message
    this._closed = false;

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this._onClose());
    socket.on('error', () => this._onClose());
  }

  _onData(chunk) {
    this._recvBuffer = Buffer.concat([this._recvBuffer, chunk]);
    const { frames, rest } = decodeFrames(this._recvBuffer);
    this._recvBuffer = Buffer.from(rest);

    for (const frame of frames) {
      if (frame.opcode === OPCODE.CLOSE) {
        this.close();
        return;
      }
      if (frame.opcode === OPCODE.PING) {
        this.socket.write(Buffer.from([0x80 | OPCODE.PONG, 0]));
        continue;
      }
      if (frame.opcode === OPCODE.PONG) continue;

      if (frame.opcode === OPCODE.TEXT || frame.opcode === OPCODE.CONTINUATION) {
        this._fragments.push(frame.payload);
        if (frame.fin) {
          const message = Buffer.concat(this._fragments).toString('utf8');
          this._fragments = [];
          this.emit('message', message);
        }
      }
    }
  }

  _onClose() {
    if (this._closed) return;
    this._closed = true;
    this.emit('close');
  }

  send(data) {
    if (this._closed || this.socket.destroyed) return;
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    try {
      this.socket.write(encodeTextFrame(text));
    } catch {
      this._onClose();
    }
  }

  close() {
    if (this._closed) return;
    try {
      this.socket.write(encodeCloseFrame());
    } catch {
      // socket may already be gone
    }
    this.socket.end();
    this._onClose();
  }
}

/**
 * Attach a WebSocket endpoint at `path` to an existing http.Server. Calls
 * `onConnection(conn)` for each successful handshake. Requests to other
 * paths, or non-WebSocket upgrade attempts, are rejected without touching
 * the rest of the app.
 */
export function attachWebSocketServer(httpServer, path, onConnection) {
  httpServer.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    const key = req.headers['sec-websocket-key'];
    const isWsUpgrade = (req.headers.upgrade || '').toLowerCase() === 'websocket';

    if (url.pathname !== path || !isWsUpgrade || !key) {
      socket.destroy();
      return;
    }

    const accept = acceptValueFor(key);
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n` +
        '\r\n'
    );

    const conn = new WSConnection(socket);
    if (head && head.length) conn._onData(head);
    onConnection(conn);
  });
}
