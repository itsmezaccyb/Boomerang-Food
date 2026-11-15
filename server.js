/* Boomerang Bites — authoritative game server.
   - Serves the web app (so a laptop can host everything at one address)
   - Runs the real simulation for every room at 60 ticks/s; clients only send inputs
   - Streams compact snapshots at 30/s; each client predicts its own movement and reconciles

   Run:  npm install && npm start      (PORT env var, default 8080)          */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Sim = require('./sim.js');

const PORT = +process.env.PORT || 8080;
const ROOT = __dirname;
const TICK = 1 / 60;          // server simulation tick
const SNAP_EVERY = 2;         // snapshot every 2 ticks -> 30 Hz
const MAX_QUEUE = 4;          // input jitter buffer per player (ticks)

// ---------------------------------------------------------------- static files
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8' };
const PUBLIC = new Set(['index.html', 'game.js', 'sim.js', 'config.js', 'style.css', 'sw.js', 'manifest.webmanifest']);
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    return res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: wss.clients.size }));
  }
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
  const ok = PUBLIC.has(rel) || /^(sprites|icons)\/[\w.-]+$/.test(rel);
  const file = path.join(ROOT, rel);
  if (!ok || !file.startsWith(ROOT)) { res.writeHead(404); return res.end('not found'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': rel === 'sw.js' ? 'no-cache' : 'public, max-age=300' });
    res.end(data);
  });
});

// ---------------------------------------------------------------- rooms
const wss = new WebSocketServer({ server, maxPayload: 4096, perMessageDeflate: false });
const rooms = new Map();
let nextClient = 1;
const SLOT_CYCLE = ['open', 'cpu1', 'cpu2', 'cpu3', 'off'];

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c; do { c = Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join(''); } while (rooms.has(c));
  return c;
}
const send = (ws, obj) => { if (ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)); };
const cleanName = (s) => String(s || '').replace(/[^\w \-.!?']/g, '').trim().slice(0, 12) || 'Snack';

function freeChar(room, except) {
  const used = room.slots.filter((s, i) => i !== except && s.type !== 'open' && s.type !== 'off').map(s => s.char);
  for (let c = 0; c < Sim.CHARS.length; c++) if (!used.includes(c)) return c;
  return 0;
}
function lobbyState(room) {
  return {
    t: 'lobby', code: room.code, host: room.host, tv: !!room.tvHost, playing: !!room.g, points: room.points, map: room.map,
    mode: room.mode, pw: room.pw, pull: room.pull,
    slots: room.slots.map(s => ({ type: s.type, owner: s.owner || 0, char: s.char, name: s.owner ? (room.clients.get(s.owner) || {}).name : '' })),
  };
}
function broadcastLobby(room) { const msg = JSON.stringify(lobbyState(room)); for (const c of room.clients.values()) send(c.ws, msg); }

function lanAddrs() {
  const nets = require('os').networkInterfaces();
  return Object.values(nets).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
}
// The host can manage the room; in a big-screen room, any seated player can too (the TV may have no keyboard).
function canManage(room, ws) {
  if (room.host === ws.id) return true;
  const c = room.clients.get(ws.id);
  return !!(room.tvHost && c && c.slot >= 0);
}
function joinRoom(ws, room, spectator) {
  ws.room = room;
  const c = { ws, id: ws.id, name: ws.name, queue: [], last: Sim.NO_INPUT, ack: 0, slot: -1, spectator: !!spectator };
  room.clients.set(ws.id, c);
  if (!room.g) takeSlot(room, c);
  send(ws, { t: 'room', code: room.code, you: ws.id, lan: lanAddrs(), port: PORT });
  broadcastLobby(room);
}
function takeSlot(room, c) {
  if (c.slot >= 0 || c.spectator) return;
  const i = room.slots.findIndex(s => s.type === 'open');
  if (i < 0) return; // room full: spectate
  room.slots[i] = { type: 'net', owner: c.id, char: freeChar(room, i) };
  c.slot = i;
}
function leaveRoom(ws) {
  const room = ws.room; if (!room) return;
  ws.room = null;
  const c = room.clients.get(ws.id); room.clients.delete(ws.id);
  if (c && c.slot >= 0) {
    if (room.g) { // mid-match: a CPU takes over so the game keeps going
      room.slots[c.slot] = { type: 'cpu2', char: room.slots[c.slot].char };
      const p = room.g.players.find(p => p.i === c.slot);
      if (p) { p.type = 'cpu2'; p.bot = Sim.makeBot('cpu2'); }
    } else room.slots[c.slot] = { type: 'open' };
  }
  if (!room.clients.size) { rooms.delete(room.code); return; }
  if (room.host === ws.id) { room.host = room.clients.keys().next().value; room.tvHost = false; }
  broadcastLobby(room);
}

function startMatch(room) {
  const specs = [];
  room.slots.forEach((s, i) => {
    if (s.type === 'net') specs.push({ i, type: 'net', char: s.char });
    else if (s.type.startsWith('cpu')) specs.push({ i, type: s.type, char: s.char });
  });
  if (specs.length < 2) return false;
  room.g = Sim.create(); room.tick = 0; room.events = [];
  Sim.newMatch(room.g, specs, room.points, room.map, { mode: room.mode, pw: room.pw, pull: room.pull });
  room.events.push(...room.g.events); room.g.events = [];
  for (const c of room.clients.values()) {
    c.queue = []; c.last = Sim.NO_INPUT; c.ack = 0;
    if (c.slot >= 0 && room.slots[c.slot].owner !== c.id) c.slot = -1;
  }
  const players = specs.map(s => ({ i: s.i, char: s.char, type: s.type, name: s.type === 'net' ? (room.clients.get(room.slots[s.i].owner) || {}).name : '' }));
  for (const c of room.clients.values()) send(c.ws, { t: 'start', players, you: c.slot, points: room.points, mode: room.g.opts.mode });
  return true;
}

wss.on('connection', (ws) => {
  ws.id = nextClient++; ws.name = 'Snack'; ws.alive = true;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', (buf) => {
    let m; try { m = JSON.parse(buf); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;
    const room = ws.room;
    switch (m.t) {
      case 'i': { // input
        if (!room || !room.g) return;
        const c = room.clients.get(ws.id);
        if (c && Array.isArray(m.d)) { c.queue.push(Sim.decodeInput(m.d)); if (c.queue.length > 30) c.queue.splice(0, c.queue.length - 30); }
        return;
      }
      case 'ping': return send(ws, { t: 'pong', ts: m.ts });
      case 'host': {
        leaveRoom(ws); ws.name = cleanName(m.name);
        const r = { code: makeCode(), clients: new Map(), host: ws.id, points: 10, map: -1, mode: 'ffa', pw: 1, pull: true, g: null, tick: 0, events: [],
          slots: Array.from({ length: Sim.MAX_PLAYERS }, (_, i) => ({ type: i < 4 ? 'open' : 'off' })), tvHost: !!m.tv };
        rooms.set(r.code, r); joinRoom(ws, r, !!m.tv);
        return;
      }
      case 'join': {
        const r = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!r) return send(ws, { t: 'err', msg: 'No room with that code.' });
        leaveRoom(ws); ws.name = cleanName(m.name); joinRoom(ws, r);
        return;
      }
      case 'leave': leaveRoom(ws); return;
      case 'slot': { // host cycles a non-player slot
        if (!room || !canManage(room, ws) || room.g) return;
        const s = room.slots[m.n | 0]; if (!s || s.type === 'net') return;
        const type = SLOT_CYCLE[(SLOT_CYCLE.indexOf(s.type) + 1) % SLOT_CYCLE.length];
        const n = m.n | 0;
        const taken = room.slots.some((o, j) => j !== n && o.char === s.char && o.type !== 'open' && o.type !== 'off');
        room.slots[n] = { type, char: s.char !== undefined && !taken ? s.char : freeChar(room, n) };
        broadcastLobby(room); return;
      }
      case 'char': { // change snack: your own, or (host) a CPU's
        if (!room || room.g) return;
        const c = room.clients.get(ws.id);
        const n = m.n === undefined ? c.slot : m.n | 0;
        const s = room.slots[n]; if (!s) return;
        if (!(s.type === 'net' && s.owner === ws.id) && !(s.type.startsWith('cpu') && canManage(room, ws))) return;
        const used = room.slots.filter((o, j) => j !== n && o.type !== 'open' && o.type !== 'off').map(o => o.char);
        let ch = s.char; do { ch = (ch + 1) % Sim.CHARS.length; } while (used.includes(ch));
        s.char = ch; broadcastLobby(room); return;
      }
      case 'cfg': {
        if (!room || !canManage(room, ws) || room.g) return;
        if ([5, 10, 15].includes(m.points)) room.points = m.points;
        if (Number.isInteger(m.map) && m.map >= -1 && m.map < Sim.MAPS.length) room.map = m.map;
        if (m.mode === 'ffa' || m.mode === 'teams') room.mode = m.mode;
        if ([0, 0.5, 1, 2].includes(m.pw)) room.pw = m.pw;
        if (typeof m.pull === 'boolean') room.pull = m.pull;
        broadcastLobby(room); return;
      }
      case 'start': {
        if (!room || !canManage(room, ws)) return;
        if (room.g && !room.g.over) return;
        room.g = null;
        for (const c of room.clients.values()) takeSlot(room, c);
        if (!startMatch(room)) send(ws, { t: 'err', msg: 'Need at least 2 fighters (add a CPU?).' });
        return;
      }
      case 'lobby': { // host returns everyone to the lobby
        if (!room || !canManage(room, ws)) return;
        room.g = null;
        for (const c of room.clients.values()) takeSlot(room, c);
        broadcastLobby(room); return;
      }
    }
  });
  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => {});
});

// keep connections alive through proxies (Render, Cloudflare tunnels, etc.)
setInterval(() => {
  for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch (e) {} }
}, 20000);

// ---------------------------------------------------------------- simulation loop
function tickRoom(room) {
  const g = room.g;
  for (const p of g.players) {
    if (p.type !== 'net') continue;
    const c = room.clients.get(room.slots[p.i].owner);
    if (!c) { p.input = Sim.NO_INPUT; continue; }
    // drop stale inputs if a client got ahead (keeps latency bounded), but keep button presses
    while (c.queue.length > MAX_QUEUE) {
      const old = c.queue.shift();
      if (old.dash && !c.queue[0].dash) c.queue[0] = Object.assign({}, c.queue[0], { dash: true });
    }
    const inp = c.queue.shift();
    if (inp) { c.last = inp; c.ack = inp.seq; }
    p.input = c.last;
  }
  if (!g.over) { Sim.step(g, TICK / 2); Sim.step(g, TICK / 2); }
  if (g.events.length) { room.events.push(...g.events); g.events = []; }
  room.tick++;
  if (room.tick % SNAP_EVERY) return;

  const snap = Sim.encodeSnapshot(g);
  snap.t = 's'; snap.k = room.tick;
  if (room.events.length) { snap.e = room.events; room.events = []; }
  const base = JSON.stringify(snap);
  for (const c of room.clients.values()) {
    if (c.ws.bufferedAmount > 64 * 1024) continue; // slow connection: skip a frame rather than pile up lag
    const p = c.slot >= 0 ? g.players.find(p => p.i === c.slot && p.type === 'net') : null;
    if (p) c.ws.send('{"a":' + c.ack + ',"m":' + JSON.stringify(Sim.encodeSelf(p)) + ',' + base.slice(1));
    else c.ws.send(base);
  }
}
let lastT = process.hrtime.bigint(), acc = 0;
setInterval(() => {
  const now = process.hrtime.bigint();
  acc += Number(now - lastT) / 1e9; lastT = now;
  if (acc > 0.25) acc = TICK; // don't spiral after a stall
  while (acc >= TICK) {
    acc -= TICK;
    for (const room of rooms.values()) if (room.g) { try { tickRoom(room); } catch (e) { console.error('room', room.code, e); room.g = null; broadcastLobby(room); } }
  }
}, 4);

server.listen(PORT, () => {
  const nets = require('os').networkInterfaces();
  const ips = Object.values(nets).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log(`Boomerang Bites server on port ${PORT}`);
  console.log(`  this computer:  http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  same Wi-Fi:     http://${ip}:${PORT}`));
  console.log(`\n  Big screen: open  http://localhost:${PORT}/?tv  on this computer to show the whole arena.`);
  console.log(`  Phones join with the code shown there.`);
});
