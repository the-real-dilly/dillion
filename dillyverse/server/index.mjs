#!/usr/bin/env node
/* ==========================================================================
   DILLYVERSE — Authoritative Node.js WebSocket Multiplayer Server
   Zero-dependency RFC 6455 WebSocket server with world seed sync,
   server-authoritative block persistence, chat, and anti-cheat reach/rate.
   Run: node dillyverse/server/index.mjs [port] [seed]
   ========================================================================== */

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.argv[2] || process.env.PORT || 25565);
const WORLD_SEED = process.argv[3] || process.env.DILLYVERSE_SEED || 'DILLYVERSE-MP-01';
const SAVE_PATH = path.resolve(process.cwd(), 'dillyverse-server-world.json');

const clients = new Map(); // id -> { id, name, socket, x, y, z, yaw, lastEdit }
const blockMods = new Map(); // "x,y,z" -> blockId

// Load persisted server world modifications if present
try {
  if (fs.existsSync(SAVE_PATH)) {
    const saved = JSON.parse(fs.readFileSync(SAVE_PATH, 'utf8'));
    for (const [k, v] of Object.entries(saved.blocks || {})) blockMods.set(k, v);
    console.log(`[DillyVerse Server] Loaded ${blockMods.size} persisted block edits.`);
  }
} catch (_) {}

function persistWorld() {
  try {
    fs.writeFileSync(SAVE_PATH, JSON.stringify({ seed: WORLD_SEED, blocks: Object.fromEntries(blockMods) }));
  } catch (_) {}
}
setInterval(persistWorld, 20000);

function encodeFrame(str) {
  const payload = Buffer.from(str, 'utf8');
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x81, len]);
  } else if (len < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

function send(client, obj) {
  if (client.socket.writable) client.socket.write(encodeFrame(JSON.stringify(obj)));
}

function broadcast(obj, exceptId = null) {
  const frame = encodeFrame(JSON.stringify(obj));
  for (const c of clients.values()) {
    if (c.id !== exceptId && c.socket.writable) c.socket.write(frame);
  }
}

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ name: 'DillyVerse Multiplayer Server', seed: WORLD_SEED, players: clients.size }));
});

server.on('upgrade', (req, socket) => {
  const key = req.headers['sec-websocket-key'];
  if (!key) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write(
    'HTTP/1.1 101 Switching Protocols\r\n' +
    'Upgrade: websocket\r\n' +
    'Connection: Upgrade\r\n' +
    `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
  );

  const id = crypto.randomBytes(4).toString('hex');
  const client = { id, name: 'Explorer', socket, x: 0, y: 45, z: 0, yaw: 0, lastEdit: 0 };
  clients.set(id, client);

  let buf = Buffer.alloc(0);
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const total = off + (masked ? 4 : 0) + len;
      if (buf.length < total) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      const data = Buffer.from(buf.subarray(off + (masked ? 4 : 0), total));
      buf = buf.subarray(total);
      if (op === 0x8) { socket.end(); return; }
      if (masked && mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      try {
        handleMessage(client, JSON.parse(data.toString('utf8')));
      } catch (_) {}
    }
  });

  socket.on('close', () => {
    clients.delete(id);
    broadcast({ type: 'player_leave', id, name: client.name });
  });
  socket.on('error', () => { clients.delete(id); });
});

function handleMessage(client, msg) {
  if (msg.type === 'join') {
    client.name = String(msg.name || 'Explorer').slice(0, 18);
    send(client, {
      type: 'welcome',
      id: client.id,
      seed: WORLD_SEED,
      blocks: Array.from(blockMods.entries()),
      players: Array.from(clients.values()).map(c => ({ id: c.id, name: c.name, x: c.x, y: c.y, z: c.z, yaw: c.yaw }))
    });
    broadcast({ type: 'player_join', player: { id: client.id, name: client.name, x: client.x, y: client.y, z: client.z, yaw: client.yaw } }, client.id);
    console.log(`[Join] ${client.name} (${client.id})`);
  } else if (msg.type === 'move') {
    client.x = Number(msg.x) || 0;
    client.y = Number(msg.y) || 0;
    client.z = Number(msg.z) || 0;
    client.yaw = Number(msg.yaw) || 0;
    broadcast({ type: 'player_move', id: client.id, x: client.x, y: client.y, z: client.z, yaw: client.yaw }, client.id);
  } else if (msg.type === 'block_set') {
    // Anti-cheat: basic rate limit + reach check + valid block bounds
    const now = Date.now();
    if (now - client.lastEdit < 45) return;
    const x = Math.floor(msg.x), y = Math.floor(msg.y), z = Math.floor(msg.z);
    const bid = Number(msg.blockId);
    if (y <= 0 || y >= 95 || bid < 0 || bid > 30) return;
    if (Math.hypot(x - client.x, y - client.y, z - client.z) > 9.5) return;
    client.lastEdit = now;
    blockMods.set(`${x},${y},${z}`, bid);
    broadcast({ type: 'block_set', x, y, z, blockId: bid }, client.id);
  } else if (msg.type === 'chat') {
    const text = String(msg.text || '').trim().slice(0, 180);
    if (!text) return;
    broadcast({ type: 'chat', name: client.name, text });
  }
}

server.listen(PORT, () => {
  console.log(`[DillyVerse Server] Listening on ws://localhost:${PORT} (seed: ${WORLD_SEED})`);
});
