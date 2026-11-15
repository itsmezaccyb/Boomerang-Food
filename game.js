/* Boomerang Bites — client: rendering, input, sound, menus, and online netcode.
   Game rules live in sim.js (shared with the server). */
'use strict';
const { TILE, FLOOR, WALL, CRATE, PIT, TREE, GRASS, ICE, PAD, TEAM_COLORS, TEAM_NAMES, PCOLORS, CHARS, POWERS, POWER_KEYS, MAPS, clamp, lerp, rand, dist2, angDiff } = Sim;

// Arena size changes per map
let COLS = 20, ROWS = 12, WW = COLS * TILE, WH = ROWS * TILE;
function setDims(c, r) { COLS = c; ROWS = r; WW = c * TILE; WH = r * TILE; game.cols = c; game.rows = r; }
const SLOT_TYPES = [
  { id: 'human', label: 'Player', sub: 'Touch / WASD' },
  { id: 'cpu1', label: 'CPU', sub: 'Easy' },
  { id: 'cpu2', label: 'CPU', sub: 'Normal' },
  { id: 'cpu3', label: 'CPU', sub: 'Hard' },
  { id: 'keys2', label: 'Player', sub: 'Arrow keys' },
  { id: 'pad0', label: 'Controller 1', sub: 'Gamepad' },
  { id: 'pad1', label: 'Controller 2', sub: 'Gamepad' },
  { id: 'pad2', label: 'Controller 3', sub: 'Gamepad' },
  { id: 'pad3', label: 'Controller 4', sub: 'Gamepad' },
  { id: 'pad4', label: 'Controller 5', sub: 'Gamepad' },
  { id: 'pad5', label: 'Controller 6', sub: 'Gamepad' },
  { id: 'pad6', label: 'Controller 7', sub: 'Gamepad' },
  { id: 'pad7', label: 'Controller 8', sub: 'Gamepad' },
  { id: 'off', label: 'Off', sub: '' },
];
const ONLINE_SLOT_LABEL = { open: ['Open', 'Waiting for a friend'], cpu1: ['CPU', 'Easy'], cpu2: ['CPU', 'Normal'], cpu3: ['CPU', 'Hard'], off: ['Off', ''] };

const $ = (id) => document.getElementById(id);
function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- sprites
const SPRITE_NAMES = CHARS.map(c => c.key).concat(['boomerang', 'brick', 'crate', 'tree', 'skull', 'crown', 'boom', 'fire', 'multi', 'shoe', 'shield', 'ice', 'crystal', 'sparkles', 'drill', 'mask', 'decoy', 'dizzy', 'herb']);
const SPR = {};
function greyCopy(src) {
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d'); g.drawImage(src, 0, 0);
  try {
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
    for (let i = 0; i < a.length; i += 4) { const l = (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) * 0.8 + 40; a[i] = a[i + 1] = a[i + 2] = l; }
    g.putImageData(d, 0, 0);
  } catch (e) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(150,150,150,0.8)'; g.fillRect(0, 0, c.width, c.height); }
  return c;
}
function loadSprites() {
  return Promise.all(SPRITE_NAMES.map(n => new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = c.height = 160; c.getContext('2d').drawImage(img, 0, 0, 160, 160); SPR[n] = c;
      if (n === 'boomerang') SPR.boomerang_grey = greyCopy(c); // free-for-all boomerangs (owner is out)
      res();
    };
    img.onerror = () => res();
    img.src = 'sprites/' + n + '.svg';
  })));
}
function drawSpr(ctx, key, x, y, size, rot = 0, alpha = 1) {
  const s = SPR[key]; if (!s) return;
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (alpha !== 1) ctx.globalAlpha *= alpha;
  ctx.drawImage(s, -size / 2, -size / 2, size, size); ctx.restore();
}

// ---------------------------------------------------------------- audio
const Sound = {
  ac: null, on: store('bb_sound') !== false,
  unlock() {
    if (!this.ac) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ac = new AC(); }
    if (this.ac && this.ac.state === 'suspended') this.ac.resume();
  },
  tone(f, dur, type = 'sine', vol = 0.15, slideTo = 0, delay = 0) {
    if (!this.on || !this.ac) return;
    const a = this.ac, t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, vol = 0.2, freq = 1000, type = 'bandpass') {
    if (!this.on || !this.ac) return;
    const a = this.ac, t = a.currentTime;
    if (!this._buf) { const b = a.createBuffer(1, a.sampleRate, a.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this._buf = b; }
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    s.buffer = this._buf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(a.destination); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  },
  throw() { this.noise(0.18, 0.25, 1400); this.tone(500, 0.15, 'triangle', 0.06, 900); },
  slash() { this.noise(0.09, 0.3, 3000, 'highpass'); },
  catch() { this.tone(900, 0.06, 'square', 0.06); this.tone(1350, 0.06, 'square', 0.05, 0, 0.05); },
  hit() { this.tone(320, 0.3, 'sawtooth', 0.15, 50); this.noise(0.25, 0.3, 600, 'lowpass'); },
  boom() { this.noise(0.6, 0.5, 350, 'lowpass'); this.tone(120, 0.5, 'sine', 0.3, 30); },
  dash() { this.noise(0.12, 0.18, 800); },
  clink() { this.tone(1800, 0.12, 'triangle', 0.1); this.tone(2400, 0.1, 'triangle', 0.06); },
  crate() { this.noise(0.15, 0.3, 500); this.tone(180, 0.1, 'square', 0.06, 90); },
  pickup() { [660, 880, 1100].forEach((f, i) => this.tone(f, 0.1, 'triangle', 0.09, 0, i * 0.06)); },
  shield() { this.tone(600, 0.25, 'sine', 0.15, 1200); },
  fall() { this.tone(500, 0.5, 'sine', 0.15, 60); },
  win() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.12, 0, i * 0.11)); },
  tick() { this.tone(700, 0.07, 'square', 0.06); },
  go() { this.tone(1050, 0.18, 'square', 0.07); this.tone(1400, 0.2, 'triangle', 0.06, 0, 0.06); },
  shove() { this.noise(0.1, 0.25, 400, 'lowpass'); this.tone(160, 0.1, 'square', 0.08, 80); },
  drop() { this.tone(300, 0.08, 'triangle', 0.08, 180); },
  recall() { this.tone(400, 0.25, 'sine', 0.08, 900); },
  freeze() { this.tone(1600, 0.3, 'sine', 0.08, 2400); this.noise(0.2, 0.1, 5000, 'highpass'); },
  teleport() { this.tone(300, 0.2, 'sine', 0.12, 1500); },
};

// ---------------------------------------------------------------- settings
const defaultSlots = [{ type: 'human', char: 0 }, { type: 'cpu2', char: 1 }, { type: 'cpu2', char: 2 }, { type: 'cpu2', char: 3 },
  { type: 'off', char: 4 }, { type: 'off', char: 5 }, { type: 'off', char: 6 }, { type: 'off', char: 7 }];
const settings = Object.assign({ slots: defaultSlots, points: 10, map: -1, name: '', server: '', camera: 'whole', mode: 'ffa', pw: 1, pull: true }, store('bb_settings') || {});
if (!Array.isArray(settings.slots)) settings.slots = defaultSlots;
while (settings.slots.length < Sim.MAX_PLAYERS) settings.slots.push(Object.assign({}, defaultSlots[settings.slots.length])); // older saves had 4
const saveSettings = () => store('bb_settings', settings);
if (!settings.camV2) { settings.camera = 'whole'; settings.camV2 = true; saveSettings(); } // whole-arena view is now the default (once, for older saves)
const POINT_OPTIONS = [5, 10, 15];
if (!POINT_OPTIONS.includes(settings.points)) settings.points = 10; // older saves used 3/5/7

// ---------------------------------------------------------------- input
const keys = new Set();
addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (e.repeat) return; keys.add(e.code);
  if (e.code === 'Escape' && (game.state === 'play' || game.state === 'paused')) togglePause();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const ZERO = { mx: 0, my: 0, ax: 0, ay: 0, throw: false, dash: false, slash: false };
const TUNE = Sim.T;

function keyInput(set) {
  const k = set === 'A'
    ? { u: ['KeyW'], d: ['KeyS'], l: ['KeyA'], r: ['KeyD'], t: ['KeyJ', 'Space'], h: ['KeyK', 'ShiftLeft'], s: ['KeyL', 'KeyE'] }
    : { u: ['ArrowUp'], d: ['ArrowDown'], l: ['ArrowLeft'], r: ['ArrowRight'], t: ['Slash', 'Numpad0', 'Enter'], h: ['Period', 'ShiftRight'], s: ['Comma', 'Numpad1'] };
  const any = (arr) => arr.some(c => keys.has(c));
  return { mx: (any(k.r) ? 1 : 0) - (any(k.l) ? 1 : 0), my: (any(k.d) ? 1 : 0) - (any(k.u) ? 1 : 0), ax: 0, ay: 0, throw: any(k.t), dash: any(k.h), slash: any(k.s) };
}
function getPads() { return navigator.getGamepads ? Array.from(navigator.getGamepads() || []).filter(Boolean) : []; }
// Round ("radial") dead zone, rescaled so the stick goes smoothly from 0 at the edge of the dead zone to 1.
// (A per-axis dead zone snaps aim to 0°/90° whenever one axis is small — that was the jumpy feel.)
function radialStick(x, y, dead) {
  const m = Math.hypot(x, y);
  if (m < dead) return { x: 0, y: 0, m: 0 };
  const mag = Math.min(1, (m - dead) / (1 - dead));
  return { x: x / m * mag, y: y / m * mag, m: mag };
}
// Aim filter: only follows the stick while it's pushed well out (so the spring-back when you let go can't
// flip your aim), and smooths tiny jitter over ~35 ms. Returns a direction while held, or 0,0 when released.
const aimFilters = {};
function filterAim(key, x, y, m, holdAt, followAt) {
  const f = aimFilters[key] || (aimFilters[key] = { a: null, t: performance.now() });
  const now = performance.now(), dt = Math.min(0.1, (now - f.t) / 1000); f.t = now;
  if (m < holdAt) { f.a = null; return [0, 0]; }                 // released / resting near centre
  const target = Math.atan2(y, x);
  if (f.a === null) f.a = target;                                  // fresh push: snap straight to it
  else if (m >= followAt) f.a += angDiff(target, f.a) * (1 - Math.exp(-dt / 0.035)); // follow smoothly
  return [Math.cos(f.a), Math.sin(f.a)];
}
function padInput(i) {
  const p = getPads()[i]; if (!p) return ZERO;
  const b = (n) => !!(p.buttons[n] && (p.buttons[n].pressed || p.buttons[n].value > 0.4));
  const mv = radialStick(p.axes[0] || 0, p.axes[1] || 0, 0.15);
  let mx = mv.x, my = mv.y;
  if (b(14)) mx = -1; if (b(15)) mx = 1; if (b(12)) my = -1; if (b(13)) my = 1;
  const as = radialStick(p.axes[2] || 0, p.axes[3] || 0, 0.22);
  const [ax, ay] = filterAim('pad' + i, as.x, as.y, as.m, 0.3, 0.5);
  return { mx, my, ax, ay, throw: b(0) || b(7), dash: b(1) || b(6) || b(4), slash: b(2) || b(5) || b(3) };
}

// Touch: left side = floating joystick; right side = throw/aim stick; small dash button.
const touch = { move: null, aim: null, dash: false, dashId: null, slash: false, slashId: null, active: false };
const canvas = $('game'), ctx = canvas.getContext('2d');
const view = { w: 0, h: 0, dpr: 1, scale: 1, ox: 0, oy: 0, safe: { t: 0, r: 0, b: 0, l: 0 } };
const dashBtn = () => ({ x: view.w - view.safe.r - 205, y: view.h - view.safe.b - 58, r: 36 });
const slashBtn = () => ({ x: view.w - view.safe.r - 178, y: view.h - view.safe.b - 168, r: 36 });
const throwBtn = () => ({ x: view.w - view.safe.r - 88, y: view.h - view.safe.b - 96, r: 52 });

canvas.addEventListener('pointerdown', e => {
  Sound.unlock();
  if (game.state !== 'play') return;
  e.preventDefault(); touch.active = e.pointerType !== 'mouse' || touch.active;
  const x = e.clientX, y = e.clientY, db = dashBtn(), sb = slashBtn();
  if (dist2(x, y, db.x, db.y) < (db.r * 1.4) ** 2) { touch.dash = true; touch.dashId = e.pointerId; }
  else if (dist2(x, y, sb.x, sb.y) < (sb.r * 1.4) ** 2) { touch.slash = true; touch.slashId = e.pointerId; }
  else if (x < view.w * 0.45) { if (!touch.move) touch.move = { id: e.pointerId, ox: x, oy: y, x, y }; }
  else if (!touch.aim) touch.aim = { id: e.pointerId, ox: x, oy: y, x, y };
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
}, { passive: false });
canvas.addEventListener('pointermove', e => {
  const t = touch.move && touch.move.id === e.pointerId ? touch.move : touch.aim && touch.aim.id === e.pointerId ? touch.aim : null;
  if (!t) return;
  t.x = e.clientX; t.y = e.clientY;
  if (t === touch.move) { // base follows the thumb so it never "runs out"
    const dx = t.x - t.ox, dy = t.y - t.oy, d = Math.hypot(dx, dy), max = 70;
    if (d > max) { t.ox = t.x - dx / d * max; t.oy = t.y - dy / d * max; }
  }
});
function endPointer(e) {
  if (touch.move && touch.move.id === e.pointerId) touch.move = null;
  if (touch.aim && touch.aim.id === e.pointerId) touch.aim = null;
  if (touch.dashId === e.pointerId) { touch.dash = false; touch.dashId = null; }
  if (touch.slashId === e.pointerId) { touch.slash = false; touch.slashId = null; }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
document.addEventListener('touchmove', e => { if (game.state === 'play' && !(e.target && e.target.closest && e.target.closest('.screen'))) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());

function touchInput() {
  const r = { mx: 0, my: 0, ax: 0, ay: 0, throw: false, dash: touch.dash, slash: touch.slash };
  if (touch.move) {
    const dx = touch.move.x - touch.move.ox, dy = touch.move.y - touch.move.oy, d = Math.hypot(dx, dy);
    if (d > 8) { const m = Math.min(1, d / 50); r.mx = dx / d * m; r.my = dy / d * m; }
  }
  if (touch.aim) {
    r.throw = true;
    const dx = touch.aim.x - touch.aim.ox, dy = touch.aim.y - touch.aim.oy, d = Math.hypot(dx, dy);
    const m = Math.min(1, Math.max(0, (d - 14) / 40)); // ~14px dead zone, full at ~54px
    [r.ax, r.ay] = filterAim('touch', dx, dy, m, 0.12, 0.12);
  } else filterAim('touch', 0, 0, 0, 1, 1);
  return r;
}
const mergeInput = (a, b) => ({ mx: clamp(a.mx + b.mx, -1, 1), my: clamp(a.my + b.my, -1, 1), ax: a.ax || b.ax, ay: a.ay || b.ay, throw: a.throw || b.throw, dash: a.dash || b.dash, slash: a.slash || b.slash });
// "Main" device input: touch + WASD + arrows + controller 1 (used for the touch player locally and always online)
function mainInput(useArrows = true, usePad = true) {
  let inp = mergeInput(touchInput(), keyInput('A'));
  if (useArrows) inp = mergeInput(inp, keyInput('B'));
  if (usePad) inp = mergeInput(inp, padInput(0));
  return inp;
}

// ---------------------------------------------------------------- state
// `game` is either a real Sim game (local play) or a mirror of the server's state (online).
let game = { state: 'menu', online: false, grid: [], players: [], rangs: [], pickups: [], mapIndex: 0, time: 0 };
const vfx = { parts: [], fx: [], shake: 0, grass: [], pads: [], rang: new Map(), pick: new Map(), floor: null };

// ---------------------------------------------------------------- events -> sound & visuals
function handleEvent(type, d) {
  const P = (i) => game.players.find(p => p.i === i);
  switch (type) {
    case 'round':
      game.mapIndex = d.map;
      setDims(d.cols || 20, d.rows || 12);
      { const built = Sim.buildMap(d.map); game.shapes = built.shapes; game.nav = built.nav; } // custom shapes are static per map
      if (game.online) game.grid = Sim.gridFromString(d.grid, COLS, ROWS);
      vfx.parts = []; vfx.fx = []; vfx.rang.clear(); vfx.pick.clear();
      hideScoreboard(); game.roundStart = game.players.map(p => p.score || 0); game.roundNo = d.n;
      renderFloor();
      showBanner(`Round ${d.n}<small>${MAPS[d.map].name}</small>`, 1200);
      touch.move = touch.aim = null; touch.dash = false;
      if (game.online) net.onRound();
      break;
    case 'count': showBanner(String(d), 800); Sound.tick(); break;
    case 'go': showBanner('GO!', 600); Sound.go(); break;
    case 'sfx': if (Sound[d]) Sound[d](); break;
    case 'dash':
      Sound.dash();
      for (let i = 0; i < 6; i++) vfx.parts.push({ x: d.x, y: d.y + 10, vx: rand(-60, 60), vy: rand(-60, 20), life: 0.4, max: 0.4, col: 'rgba(255,255,255,0.7)', r: rand(3, 6) });
      break;
    case 'slash': { Sound.slash(); const p = P(d.i); if (p && game.online) { p.slashT = 0.2; p.slashArmed = !!d.a; } break; }
    case 'shove': Sound.shove(); vfx.shake = Math.max(vfx.shake, 3); vfx.fx.push({ type: 'ring', x: d.x, y: d.y, t: 0, max: 0.25, col: '#fff' }); break;
    case 'drop': Sound.drop(); for (let i = 0; i < 5; i++) vfx.parts.push({ x: d.x, y: d.y + 6, vx: rand(-50, 50), vy: rand(-40, 10), life: 0.35, max: 0.35, col: 'rgba(255,255,255,0.7)', r: rand(2, 4) }); break;
    case 'freeze': Sound.freeze(); vfx.fx.push({ type: 'ring', x: d.x, y: d.y, t: 0, max: 0.5, col: '#9fe3ff' }); break;
    case 'teleport':
      Sound.teleport();
      vfx.fx.push({ type: 'ring', x: d.x, y: d.y, t: 0, max: 0.4, col: '#e3c7ff' }, { type: 'ring', x: d.x2, y: d.y2, t: 0, max: 0.4, col: '#e3c7ff' });
      if (game.online && net.pred) net.smooth = { x: 0, y: 0 };
      break;
    case 'spark': if (d.s) Sound.clink(); vfx.fx.push({ type: 'spark', x: d.x, y: d.y, t: 0, max: 0.25 }); break;
    case 'ring': vfx.fx.push({ type: 'ring', x: d.x, y: d.y, t: 0, max: 0.5, col: '#fff' }); break;
    case 'boom':
      Sound.boom(); vfx.shake = Math.max(vfx.shake, 12);
      vfx.fx.push({ type: 'boom', x: d.x, y: d.y, t: 0, max: 0.5, R: d.R });
      for (let i = 0; i < 18; i++) { const a = rand(0, 7), s = rand(80, 260); vfx.parts.push({ x: d.x, y: d.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5, max: 0.5, col: ['#ffb627', '#ff5d2a', '#fff1a8'][i % 3], r: rand(4, 9) }); }
      break;
    case 'crate': {
      if (game.online && game.grid[d.ty]) game.grid[d.ty][d.tx] = FLOOR;
      renderFloor(); Sound.crate();
      const cx = d.tx * TILE + TILE / 2, cy = d.ty * TILE + TILE / 2;
      for (let i = 0; i < 10; i++) vfx.parts.push({ x: cx, y: cy, vx: rand(-160, 160), vy: rand(-160, 160), life: 0.5, max: 0.5, col: ['#c1915a', '#e2b77f', '#8a5a2b'][i % 3], r: rand(3, 7), sq: true });
      break;
    }
    case 'pickup': Sound.pickup(); vfx.fx.push({ type: 'text', x: d.x, y: d.y - 30, text: POWERS[d.k].name, col: d.k === 'bamboo' ? '#ff9b9b' : '#fff', t: 0, max: 1.2 }, { type: 'reveal', k: d.k, x: d.x, y: d.y, t: 0, max: 0.8 }); break;
    case 'shield': Sound.shield(); vfx.fx.push({ type: 'ring', x: d.x, y: d.y, t: 0, max: 0.4, col: '#7fd3ff' }); break;
    case 'kill': {
      const q = P(d.i); Sound.hit(); vfx.shake = Math.max(vfx.shake, d.f ? 4 : 9);
      if (q && !d.f) for (let i = 0; i < 22; i++) {
        const a = rand(0, Math.PI * 2), s = rand(60, 280);
        vfx.parts.push({ x: d.x, y: d.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.5, 0.9), max: 0.9, col: i % 3 ? q.char.col : q.color, r: rand(3, 7) });
      }
      vfx.fx.push({ type: 'ghostup', x: d.x, y: d.y, t: 0, max: 1.1 });
      if (q && game.online) q.alive = false;
      if (d.scores) d.scores.forEach((s, n) => { if (game.players[n]) game.players[n].score = s; });
      const k = P(d.by);
      if (k) vfx.fx.push({ type: 'text', x: k.x, y: k.y - 34, text: '+1', col: k.color, t: 0, max: 1, big: true });
      else if (q) vfx.fx.push({ type: 'text', x: d.x, y: d.y - 34, text: '-1', col: '#ff8a8a', t: 0, max: 1, big: true });
      break;
    }
    case 'roundend': d.scores.forEach((s, n) => { if (game.players[n]) game.players[n].score = s; }); showScoreboard(d); break;
    case 'regen': Sound.catch(); vfx.fx.push({ type: 'ring', x: d.x, y: d.y, t: 0, max: 0.35, col: '#ffd27a' }); break;
    case 'score': {
      d.scores.forEach((s, n) => { if (game.players[n]) game.players[n].score = s; });
      const w = P(d.w);
      if (d.team >= 0) showBanner(`${TEAM_NAMES[d.team]} team +1`, 1100, TEAM_COLORS[d.team]);
      else if (w) showBanner(`${esc(playerLabel(w))} +1`, 1100, w.color);
      break;
    }
    case 'pad': Sound.teleport(); vfx.fx.push({ type: 'ring', x: d.x, y: d.y, t: 0, max: 0.4, col: '#c9a7ff' }, { type: 'ring', x: d.x2, y: d.y2, t: 0, max: 0.4, col: '#c9a7ff' }); if (game.online && net.pred) net.smooth = { x: 0, y: 0 }; break;
    case 'decoy': Sound.teleport(); vfx.fx.push({ type: 'ring', x: d.x, y: d.y, t: 0, max: 0.35, col: '#fff' }); break;
    case 'disguise': case 'poof':
      Sound.shove();
      for (let i = 0; i < 12; i++) { const a = rand(0, 7), sp = rand(40, 140); vfx.parts.push({ x: d.x, y: d.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.45, max: 0.45, col: 'rgba(240,240,240,0.85)', r: rand(4, 8) }); }
      break;
    case 'draw': d.scores.forEach((s, n) => { if (game.players[n]) game.players[n].score = s; }); showBanner('Draw!', 1100); break;
    case 'result': {
      d.scores.forEach((s, n) => { if (game.players[n]) game.players[n].score = s; });
      if (d.kills) d.kills.forEach((k, n) => { if (game.players[n]) { game.players[n].kills = k; game.players[n].deaths = d.deaths[n]; } });
      setTimeout(() => showResult(P(d.w), d.team), 300);
      break;
    }
  }
}
const playerLabel = (p) => (p.name ? p.name : p.char.name);

// Between rounds: a scoreboard where everyone's points tally up from what they had at the start of the round.
let sbTimer = 0;
function showScoreboard(d) {
  const before = game.roundStart || game.players.map(() => 0), target = game.points || 10;
  const rows = game.players.map((p, n) => ({ p, from: before[n] || 0, to: p.score || 0 })).sort((a, b) => b.to - a.to || a.p.i - b.p.i);
  const last = d && d.last >= 0 ? game.players.find(p => p.i === d.last) : null;
  $('sb-title').textContent = `After round ${game.roundNo || 1}`;
  $('sb-sub').innerHTML = `First to <b>${target}</b>` + (last ? ` · <span style="color:${last.color}">${esc(playerLabel(last))}</span> survived` : '');
  const el = $('sb-rows'); el.innerHTML = '';
  for (const r of rows) {
    const diff = r.to - r.from, row = document.createElement('div');
    row.className = 'sb-row';
    row.innerHTML = `<img src="sprites/${r.p.char.key}.svg" alt=""><span class="sb-name" style="color:${r.p.color}">${esc(playerLabel(r.p))}</span>
      <span class="sb-bar"><i style="width:${Math.min(100, r.from / target * 100)}%;background:${r.p.color}"></i></span>
      <span class="sb-delta ${diff > 0 ? 'up' : diff < 0 ? 'down' : ''}">${diff > 0 ? '+' + diff : diff < 0 ? diff : ''}</span>
      <span class="sb-score">${r.from}</span>`;
    el.appendChild(row);
    r.el = row;
  }
  show('scoreboard'); show('banner', false);
  clearInterval(sbTimer);
  setTimeout(() => { // bars slide, numbers count up
    for (const r of rows) r.el.querySelector('.sb-bar i').style.width = Math.min(100, Math.max(0, r.to) / target * 100) + '%';
    let step = 0;
    sbTimer = setInterval(() => {
      step++;
      let done = true;
      for (const r of rows) {
        const shown = +r.el.querySelector('.sb-score').textContent;
        if (shown !== r.to) { done = false; r.el.querySelector('.sb-score').textContent = shown + Math.sign(r.to - shown); if (r.to > shown) Sound.tick(); }
      }
      if (done || step > 30) clearInterval(sbTimer);
    }, 180);
  }, 450);
}
function hideScoreboard() { clearInterval(sbTimer); show('scoreboard', false); }

function updateVfx(dt) {
  vfx.shake = Math.max(0, vfx.shake - dt * 30);
  for (const p of vfx.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 3; p.vy *= 1 - dt * 3; p.life -= dt; }
  vfx.parts = vfx.parts.filter(p => p.life > 0);
  for (const f of vfx.fx) f.t += dt;
  vfx.fx = vfx.fx.filter(f => f.t < f.max);
  // boomerang trails & spin, keyed by id so they work for both local and online games
  const seen = new Set();
  for (const r of game.rangs) {
    let v = vfx.rang.get(r.id); if (!v) { v = { trail: [], spin: r.spin || 0 }; vfx.rang.set(r.id, v); }
    seen.add(r.id);
    if (r.state !== 'dropped') { v.spin += dt * 28; v.trail.push({ x: r.x, y: r.y }); if (v.trail.length > 7) v.trail.shift(); }
  }
  for (const id of vfx.rang.keys()) if (!seen.has(id)) vfx.rang.delete(id);
  const seenK = new Set();
  for (const k of game.pickups) { seenK.add(k.id); vfx.pick.set(k.id, (vfx.pick.get(k.id) || 0) + dt); }
  for (const id of vfx.pick.keys()) if (!seenK.has(id)) vfx.pick.delete(id);
  if (game.online) for (const p of game.players) { // local games get these from the sim
    p.slashT = Math.max(0, (p.slashT || 0) - dt);
    if (Math.hypot(p.vx || 0, p.vy || 0) > 30) p.walkT = (p.walkT || 0) + dt * 12;
  }
}

// ---------------------------------------------------------------- local play
function applyTeamColors() {
  const teams = (game.opts && game.opts.mode === 'teams') || game.mode === 'teams';
  for (const p of game.players) p.color = teams ? TEAM_COLORS[p.i % 2] : PCOLORS[p.i];
}
function startLocal() {
  const specs = [];
  settings.slots.forEach((s, i) => { if (s.type !== 'off') specs.push({ i, type: s.type.startsWith('cpu') ? s.type : 'local', char: s.char }); });
  if (specs.length < 2) return;
  const g = Sim.create();
  game = Object.assign(g, { state: 'play', online: false });
  Sim.newMatch(g, specs, settings.points, settings.map, { mode: settings.mode, pw: settings.pw, pull: settings.pull });
  g.players.forEach(p => { p.src = settings.slots[p.i].type; });
  applyTeamColors();
  enterGame();
  drainLocalEvents();
}
function drainLocalEvents() { const ev = game.events; game.events = []; for (const [t, d] of ev) handleEvent(t, d); }
function localInputs() {
  const hasKeys2 = game.players.some(p => p.src === 'keys2'), hasPad0 = game.players.some(p => p.src === 'pad0');
  for (const p of game.players) {
    if (p.bot) continue;
    if (p.src === 'human') p.input = mainInput(!hasKeys2, !hasPad0);
    else if (p.src === 'keys2') p.input = keyInput('B');
    else if (p.src && p.src.startsWith('pad')) p.input = padInput(+p.src.slice(3));
  }
}

// ---------------------------------------------------------------- online play
const INTERP = 0.1;          // render other players 100 ms in the past (3 snapshots of buffer)
const NET_STEP = 1 / 60;     // must match the server tick
const net = {
  ws: null, you: 0, code: '', lobby: null, slot: -1, snaps: [], clock: null, seq: 0, hist: [], pred: null,
  smooth: { x: 0, y: 0 }, acc: 0, ping: 0, pingTimer: 0, phase: 'intro', leaving: false,

  url() {
    let u = (settings.server || '').trim();
    if (!u) u = (window.BB_SERVER || '').trim();
    if (!u && /^https?:$/.test(location.protocol) && !/(github\.io|vercel\.app|netlify\.app|pages\.dev)$/.test(location.hostname)) u = location.origin;
    if (!u) return '';
    if (!/^\w+:\/\//.test(u)) u = (/^(localhost|\d+\.\d+\.\d+\.\d+)(:|$)/.test(u) ? 'http://' : 'https://') + u;
    return u.replace(/^http/, 'ws').replace(/\/+$/, '') + '/ws';
  },
  connect(first) {
    const url = this.url();
    if (!url) { onlineStatus('Enter the server address first.'); return; }
    this.close(); this.leaving = false;
    onlineStatus('Connecting…');
    let ws;
    try { ws = new WebSocket(url); } catch (e) { onlineStatus('Bad server address.'); return; }
    this.ws = ws;
    ws.onopen = () => { onlineStatus('Connected'); ws.send(JSON.stringify(first)); this.sendPing(); };
    ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this.onMessage(m); };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.leaving) return;
      onlineStatus('Disconnected from server.');
      if (game.online) { toMenu(); show('online'); }
      else if (!$('lobby').classList.contains('hidden')) { show('lobby', false); show('online'); }
    };
    ws.onerror = () => onlineStatus("Couldn't reach the server. Is it running? (Free servers can take ~30s to wake up — try again.)");
  },
  close() { if (this.ws) { this.leaving = true; try { this.ws.close(); } catch (e) {} this.ws = null; } },
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); },
  sendPing() { this.send({ t: 'ping', ts: performance.now() }); },

  onMessage(m) {
    switch (m.t) {
      case 'room': this.you = m.you; this.code = m.code; this.lan = m.lan || []; this.port = m.port; show('online', false); show('lobby'); break;
      case 'lobby':
        this.lobby = m;
        if (!game.online || game.state === 'result') {
          if (game.online && game.state === 'result' && !m.playing) { exitGameToLobby(); }
          renderLobby();
        }
        break;
      case 'start': this.startGame(m); break;
      case 's': this.onSnapshot(m); break;
      case 'pong': this.ping = Math.round(performance.now() - m.ts); break;
      case 'err': onlineStatus(m.msg); $('lobby-msg').textContent = m.msg; break;
    }
  },

  startGame(m) {
    show('lobby', false); show('result', false);
    game = {
      state: 'play', online: true, grid: [], mapIndex: 0, time: 0, phase: 'intro', rangs: [], pickups: [], points: m.points,
      players: m.players.map(p => ({ i: p.i, char: CHARS[p.char], color: PCOLORS[p.i], name: p.name, bot: p.type !== 'net', score: 0,
        x: 0, y: 0, vx: 0, vy: 0, face: 0, alive: true, hasRang: true, charging: false, charge: 0, shield: false, dashT: 0, dashDir: 0,
        inv: 0, falling: 0, powers: [], slashT: 0, slashArmed: true, walkT: 0, frozen: 0, recalling: false, aim: 0 })),
      trails: [], decoys: [],
    };
    game.mode = m.mode || 'ffa'; applyTeamColors();
    this.slot = m.you; this.snaps = []; this.clock = null; this.hist = []; this.pred = null; this.seq = 0; this.acc = 0;
    this.smooth = { x: 0, y: 0 };
    enterGame();
  },
  onRound() { this.snaps = []; this.clock = null; this.pred = null; this.hist = []; this.smooth = { x: 0, y: 0 }; },

  onSnapshot(m) {
    if (!game.online) return;
    if (m.e) for (const [t, d] of m.e) handleEvent(t, d);
    m.st = m.k * NET_STEP;
    this.snaps.push(m);
    if (this.snaps.length > 30) this.snaps.shift();
    this.phase = m.ph;
    if (this.clock === null) this.clock = m.st - INTERP;
    if (m.a !== undefined && m.m) this.reconcile(m);
    else this.pred = null;
  },

  // Rewind our fighter to the server's authoritative state, then replay inputs it hasn't processed yet.
  reconcile(m) {
    const me = m.P.find(p => p[0] === this.slot);
    if (!me || !(me[4] & 1) || me[9] > 0) { this.pred = null; return; }
    const s = m.m, old = this.pred;
    const pred = {
      x: s[6] / 10, y: s[7] / 10, vx: s[0] / 10, vy: s[1] / 10, dashT: s[2] / 1000, dashCd: s[3] / 1000, prevDash: !!s[4], dashDir: s[5] / 1000,
      face: me[3] / 100, powers: Sim.bitsToPowers(me[6]), shield: !!(me[4] & 8), charging: !!(me[4] & 4), walkT: 0,
      kbx: s[8] / 10, kby: s[9] / 10, aim: s[10] / 1000, aimStick: !!s[11], frozen: s[12] / 1000, steeringNoMove: !!s[13], bamboo: (s[14] || 0) / 1000,
    };
    this.hist = this.hist.filter(h => h.seq > m.a);
    if (this.canPredict()) { Sim.use(game); for (const h of this.hist) this.simulate(pred, h.inp); }
    if (old) {
      this.smooth.x += old.x - pred.x; this.smooth.y += old.y - pred.y;
      if (Math.hypot(this.smooth.x, this.smooth.y) > 90) this.smooth = { x: 0, y: 0 }; // too far off: snap
    }
    this.pred = pred;
  },
  canPredict() { return this.phase === 'fight' || this.phase === 'end'; },
  simulate(p, inp) { Sim.movePlayer(p, inp, NET_STEP / 2, true); Sim.movePlayer(p, inp, NET_STEP / 2, true); },

  frame(dt) {
    if (!game.online) return;
    // 1. sample input at the server tick rate, send it, predict locally
    this.acc += dt;
    let steps = 0;
    while (this.acc >= NET_STEP && steps < 6) {
      this.acc -= NET_STEP; steps++;
      const inp = game.state === 'play' ? mainInput() : ZERO;
      this.seq++;
      if (this.slot >= 0) this.send({ t: 'i', d: Sim.encodeInput(this.seq, inp) });
      this.hist.push({ seq: this.seq, inp });
      if (this.hist.length > 120) this.hist.shift();
      if (this.pred && this.canPredict()) { Sim.use(game); this.simulate(this.pred, inp); }
    }
    if (this.acc > NET_STEP * 6) this.acc = 0;
    const k = Math.exp(-dt * 12); this.smooth.x *= k; this.smooth.y *= k;
    this.pingTimer -= dt; if (this.pingTimer <= 0) { this.pingTimer = 2; this.sendPing(); }

    // 2. advance the interpolation clock, gently steering it to stay INTERP behind the newest snapshot
    if (this.clock === null || !this.snaps.length) return;
    this.clock += dt;
    const target = this.snaps[this.snaps.length - 1].st - INTERP;
    if (Math.abs(target - this.clock) > 0.25) this.clock = target; else this.clock += (target - this.clock) * Math.min(1, dt * 2);
    let a = this.snaps[0], b = a;
    for (let i = 0; i < this.snaps.length; i++) {
      if (this.snaps[i].st <= this.clock) a = this.snaps[i];
      if (this.snaps[i].st >= this.clock) { b = this.snaps[i]; break; }
      b = this.snaps[i];
    }
    while (this.snaps.length > 2 && this.snaps[1].st <= this.clock) this.snaps.shift();
    const t = b.st > a.st ? clamp((this.clock - a.st) / (b.st - a.st), 0, 1) : 1;
    this.applyState(a, b, t);
  },

  applyState(a, b, t) {
    game.phase = b.ph;
    for (const e of b.P) {
      const p = game.players.find(q => q.i === e[0]); if (!p) continue;
      const ea = a.P.find(q => q[0] === e[0]) || e;
      const f = e[4];
      p.x = lerp(ea[1], e[1], t); p.y = lerp(ea[2], e[2], t);
      p.face = ea[3] / 100 + angDiff(e[3] / 100, ea[3] / 100) * t;
      p.alive = !!(f & 1); p.hasRang = !!(f & 2); p.charging = !!(f & 4); p.shield = !!(f & 8);
      p.ammo = f & 2048 ? 2 : p.hasRang ? 1 : 0; p.regenT = f & 4096 ? 1 : 0;
      p.dashT = f & 16 ? 0.1 : 0; p.inv = f & 32 ? 0.1 : 0; p.charge = e[5] / 100;
      p.powers = Sim.bitsToPowers(e[6]); p.vx = e[7]; p.vy = e[8]; p.falling = e[9] / 100;
      p.frozen = f & 64 ? 1 : 0; p.recalling = !!(f & 128); p.aim = e[10] / 100;
      p.hidden = !!(f & 256); p.disguised = !!(f & 512); p.bamboo = f & 1024 ? 1 : 0;
      p.dashDir = Math.atan2(p.vy, p.vx);
      if (p.i === this.slot && this.pred && p.alive && !p.falling) { // our own fighter: predicted, not delayed
        const q = this.pred;
        p.x = q.x + this.smooth.x; p.y = q.y + this.smooth.y; p.vx = q.vx; p.vy = q.vy; p.face = q.face; p.aim = q.aim;
        p.dashT = q.dashT; p.dashDir = q.dashDir;
      }
    }
    const byId = new Map(a.R.map(r => [r[0], r]));
    game.rangs = b.R.map(r => {
      const ra = byId.get(r[0]) || r;
      return { id: r[0], x: lerp(ra[1], r[1], t), y: lerp(ra[2], r[2], t), owner: game.players.find(p => p.i === r[3]) || game.players[0],
        state: Sim.RSTATE[r[4] & 7], fire: !!(r[4] & 8), drill: !!(r[4] & 16), ice: !!(r[4] & 32), boom: !!(r[4] & 64), neutral: !!(r[4] & 128) };
    });
    game.trails = (b.L || []).map(l => ({ id: l[0], x: l[1], y: l[2], k: l[3] ? 'ice' : 'fire', t: l[4] / 10 }));
    game.pickups = b.K.map(k => ({ id: k[0], x: k[1], y: k[2] }));
    const dA = new Map((a.D || []).map(x => [x[0], x]));
    game.decoys = (b.D || []).map(x => { const y = dA.get(x[0]) || x; return { id: x[0], x: lerp(y[1], x[1], t), y: lerp(y[2], x[2], t), owner: game.players.find(p => p.i === x[3]) || game.players[0], face: x[4] / 100, vx: x[1] - y[1], vy: x[2] - y[2] }; });
  },
};

// ---------------------------------------------------------------- render
function renderFloor() {
  if (!game.grid.length || !SPR.brick) return;
  const c = vfx.floor || (vfx.floor = document.createElement('canvas'));
  c.width = WW * 2; c.height = WH * 2; const g = c.getContext('2d'); g.scale(2, 2); vfx.grass = []; vfx.pads = [];
  const theme = [['#f6e7c8', '#efdcb6'], ['#dfe9f2', '#cfdbe7'], ['#f3dccf', '#ead0c1'], ['#cfe6b8', '#c2dca9'], ['#efe3f3', '#e3d5ea']][game.mapIndex % 5];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) { g.fillStyle = theme[(x + y) & 1]; g.fillRect(x * TILE, y * TILE, TILE, TILE); }
  g.fillStyle = 'rgba(60,30,10,0.13)';
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const v = game.grid[y][x];
    if (v === WALL || v === CRATE) g.fillRect(x * TILE + 4, y * TILE + 8, TILE, TILE);
    if (v === TREE) { g.beginPath(); g.ellipse(x * TILE + TILE / 2 + 3, y * TILE + TILE - 6, 20, 8, 0, 0, 7); g.fill(); }
  }
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const v = game.grid[y][x], px = x * TILE, py = y * TILE;
    if (v === WALL) { g.fillStyle = '#7a3b2e'; g.fillRect(px, py, TILE, TILE); g.drawImage(SPR.brick, px - 3, py - 3, TILE + 6, TILE + 6); }
    else if (v === CRATE) g.drawImage(SPR.crate, px - 1, py - 2, TILE + 2, TILE + 2);
    else if (v === TREE) g.drawImage(SPR.tree, px - 6, py - 12, TILE + 12, TILE + 12);
    else if (v === GRASS) {
      g.fillStyle = (x + y) & 1 ? '#78bf63' : '#6fb45b'; g.fillRect(px, py, TILE, TILE);
      vfx.grass.push([px, py, (x * 7 + y * 3) % 5]);
    } else if (v === ICE) {
      g.fillStyle = (x + y) & 1 ? '#d9f3ff' : '#cbecfb'; g.fillRect(px, py, TILE, TILE);
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(px + 8, py + 30); g.lineTo(px + 22, py + 16); g.moveTo(px + 26, py + 40); g.lineTo(px + 36, py + 30); g.stroke();
    } else if (v === PAD) {
      g.fillStyle = '#3b2a63'; g.beginPath(); g.arc(px + TILE / 2, py + TILE / 2, 19, 0, 7); g.fill();
      g.strokeStyle = '#b48cff'; g.lineWidth = 3; g.stroke();
      vfx.pads.push([px + TILE / 2, py + TILE / 2]);
    } else if (v === PIT) {
      g.fillStyle = '#9e1b12'; g.fillRect(px, py, TILE, TILE);
      if (!(y > 0 && game.grid[y - 1][x] === PIT)) { g.fillStyle = '#5c0d08'; g.fillRect(px, py, TILE, 10); }
    }
  }
  drawShapes(g);
}

// Custom collision shapes: drawn with their own art if the map gives one, otherwise as plain rounded blocks.
const artCache = {};
function artImage(src) {
  if (!artCache[src]) { const img = new Image(); img.onload = () => renderFloor(); img.src = src; artCache[src] = img; }
  return artCache[src].complete && artCache[src].naturalWidth ? artCache[src] : null;
}
function shapePath(g, sh) {
  g.beginPath();
  if (sh.type === 'circle') g.arc(sh.x, sh.y, sh.r, 0, Math.PI * 2);
  else { g.moveTo(sh.points[0][0], sh.points[0][1]); for (const pt of sh.points.slice(1)) g.lineTo(pt[0], pt[1]); if (sh.type === 'poly') g.closePath(); }
}
function drawShapes(g) {
  for (const sh of game.shapes || []) {
    const art = sh.art && artImage(sh.art.src);
    if (art) { // art box is in tile units; mirrored copies flip the image
      const a = sh.art, w = a.w * TILE, h = a.h * TILE;
      let x = a.x * TILE, y = a.y * TILE;
      if (sh.fx) x = WW - x - w;
      if (sh.fy) y = WH - y - h;
      g.save(); g.translate(x + w / 2, y + h / 2); g.scale(sh.fx ? -1 : 1, sh.fy ? -1 : 1); g.drawImage(art, -w / 2, -h / 2, w, h); g.restore();
      continue;
    }
    const col = sh.color || (sh.type === 'circle' ? '#b9773f' : '#a8553d');
    g.lineCap = g.lineJoin = 'round';
    g.save(); g.translate(4, 7); g.globalAlpha = 0.18; g.fillStyle = g.strokeStyle = '#3c1e0a'; // drop shadow
    shapePath(g, sh); if (sh.type === 'path') { g.lineWidth = sh.w; g.stroke(); } else g.fill();
    g.restore();
    g.fillStyle = g.strokeStyle = col;
    shapePath(g, sh); if (sh.type === 'path') { g.lineWidth = sh.w; g.stroke(); } else g.fill();
    g.globalAlpha = 0.35; g.strokeStyle = '#fff'; g.lineWidth = sh.type === 'path' ? Math.max(2, sh.w * 0.25) : 3; // highlight
    if (sh.type === 'path') { g.save(); g.translate(0, -sh.w * 0.18); shapePath(g, sh); g.stroke(); g.restore(); }
    else { shapePath(g, sh); g.stroke(); }
    g.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- camera
// Phones follow their own fighter, zoomed in. The big screen (and anyone who's out) sees the whole arena.
const cam = { x: WW / 2, y: WH / 2, s: 1, ox: 0, oy: 0, ready: false, target: null };
const ZOOM_TILES = 6.5; // how many tiles tall the follow camera shows
function followTarget() {
  if (settings.camera === 'whole' || game.state === 'menu') return null;
  let me = null;
  if (game.online) me = net.tv ? null : game.players.find(p => p.i === net.slot);
  else { const humans = game.players.filter(p => !p.bot); if (humans.length === 1) me = humans[0]; }
  return me && me.alive && !(me.falling > 0) ? me : null;
}
function updateCamera(dt) {
  const aw = view.w - view.safe.l - view.safe.r, ah = view.h - view.safe.t - view.safe.b;
  const fit = Math.min(aw / WW, ah / WH);
  const t = cam.target = followTarget();
  let zs = fit, cx = WW / 2, cy = WH / 2;
  if (t) {
    zs = Math.max(fit, Math.min(ah / (TILE * ZOOM_TILES), aw / (TILE * 9)));
    const look = t.charging ? 40 + 90 * clamp((t.charge - 0.16) / 0.55, 0, 1) : 25; // peek where you're aiming
    cx = t.x + Math.cos(t.face) * look; cy = t.y + Math.sin(t.face) * look;
  }
  const k = cam.ready ? 1 - Math.exp(-dt * 7) : 1;
  cam.s = lerp(cam.s, zs, cam.ready ? 1 - Math.exp(-dt * 4) : 1);
  const hw = aw / 2 / cam.s, hh = ah / 2 / cam.s;
  cx = hw * 2 >= WW ? WW / 2 : clamp(cx, hw, WW - hw);
  cy = hh * 2 >= WH ? WH / 2 : clamp(cy, hh, WH - hh);
  cam.x = lerp(cam.x, cx, k); cam.y = lerp(cam.y, cy, k);
  cam.x = hw * 2 >= WW ? WW / 2 : clamp(cam.x, hw, WW - hw);
  cam.y = hh * 2 >= WH ? WH / 2 : clamp(cam.y, hh, WH - hh);
  cam.ox = view.safe.l + aw / 2 - cam.x * cam.s; cam.oy = view.safe.t + ah / 2 - cam.y * cam.s;
  cam.ready = true;
}
// Arrows at the screen edge pointing to fighters you can't see.
function drawOffscreen(T) {
  const m = 30, top = view.safe.t + 50, bot = view.h - view.safe.b - m, left = view.safe.l + m, right = view.w - view.safe.r - m;
  for (const p of game.players) {
    if (p === cam.target || !p.alive || visAlpha(p, cam.target) < 1) continue;
    const sx = cam.ox + p.x * cam.s, sy = cam.oy + p.y * cam.s;
    if (sx > left - m && sx < right + m && sy > top - m && sy < bot + m) continue;
    const ex = clamp(sx, left, right), ey = clamp(sy, top, bot), a = Math.atan2(sy - ey, sx - ex);
    ctx.save(); ctx.translate(ex, ey);
    ctx.rotate(a); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(14, -8); ctx.lineTo(14, 8); ctx.closePath(); ctx.fill();
    ctx.rotate(-a);
    ctx.fillStyle = 'rgba(20,12,40,0.7)'; ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.fill();
    ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.stroke();
    ctx.drawImage(SPR[p.char.key], -12, -12, 24, 24);
    ctx.restore();
  }
}

function render(T) {
  const { dpr } = view, scale = cam.s, ox = cam.ox, oy = cam.oy;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#1d1630'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!vfx.floor) return;
  const sh = vfx.shake, sx = sh ? rand(-sh, sh) : 0, sy = sh ? rand(-sh, sh) : 0;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (ox + sx), dpr * (oy + sy));
  ctx.drawImage(vfx.floor, 0, 0, WW, WH);
  if (game.state === 'menu' || game.grid.length !== ROWS) return;

  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (game.grid[y][x] === PIT) {
    const s = (x * 7 + y * 13) % 10, ph = (T * 0.8 + s / 10) % 1;
    ctx.fillStyle = `rgba(255,120,60,${0.6 * (1 - ph)})`;
    ctx.beginPath(); ctx.arc(x * TILE + 12 + s * 2.5, y * TILE + 30 - ph * 10, 3 + ph * 4, 0, 7); ctx.fill();
  }

  for (const tr of game.trails || []) {
    const life = 1 - tr.t / TUNE.trailLife, s = (tr.id * 37) % 10;
    if (tr.k === 'fire') {
      ctx.globalAlpha = clamp(life * 1.5, 0, 1) * 0.85;
      drawSpr(ctx, 'fire', tr.x + (s - 5) * 0.6, tr.y - 6, 22 + Math.sin(T * 18 + s) * 3);
    } else {
      ctx.globalAlpha = clamp(life * 1.5, 0, 1) * 0.7; ctx.fillStyle = '#bfefff';
      ctx.beginPath(); ctx.ellipse(tr.x, tr.y, 15, 10, s, 0, 7); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(tr.x - 4, tr.y - 3, 3, 0, 7); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  for (const k of game.pickups) {
    const kt = vfx.pick.get(k.id) || 0, bob = Math.sin(kt * 4) * 3, sc = Math.min(1, kt * 5);
    ctx.fillStyle = 'rgba(0,0,0,0.15)'; ctx.beginPath(); ctx.ellipse(k.x, k.y + 14, 12, 4, 0, 0, 7); ctx.fill();
    // mystery power-up: a glowing "?" bubble — you only find out what it is when you grab it
    const cy = k.y - 4 + bob, glow = 0.5 + Math.sin(kt * 5) * 0.2;
    ctx.fillStyle = `rgba(255,214,90,${glow * 0.35})`; ctx.beginPath(); ctx.arc(k.x, cy, 24 * sc, 0, 7); ctx.fill();
    const grd = ctx.createRadialGradient(k.x - 5, cy - 6, 2, k.x, cy, 16 * sc);
    grd.addColorStop(0, '#fff6c9'); grd.addColorStop(1, '#ffb627');
    ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(k.x, cy, 15 * sc, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#7a3d00'; ctx.font = `900 ${Math.round(19 * sc)}px ui-rounded, system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('?', k.x, cy + 1); ctx.textBaseline = 'alphabetic';
  }
  for (const r of game.rangs) if (r.state === 'dropped') { // lying on the floor: owner's colour ring so you can find yours
    const v = vfx.rang.get(r.id);
    ctx.strokeStyle = r.neutral ? '#d8d8d8' : r.owner.color; ctx.globalAlpha = 0.5 + Math.sin(T * 5) * 0.25; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(r.x, r.y + 4, 17, 9, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    drawSpr(ctx, r.neutral ? 'boomerang_grey' : 'boomerang', r.x, r.y, 24, v ? v.spin : 0);
  }
  for (const r of game.rangs) if (r.state === 'recall' || r.state === 'tele') { // tether line while summoning / steering
    ctx.strokeStyle = r.owner.color; ctx.globalAlpha = 0.45; ctx.lineWidth = 2; ctx.setLineDash([4, 6]); ctx.lineDashOffset = T * 60;
    ctx.beginPath(); ctx.moveTo(r.owner.x, r.owner.y); ctx.lineTo(r.x, r.y); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  for (const [cx, cy] of vfx.pads) drawSpr(ctx, 'multi', cx, cy, 30, T * 3, 0.75);
  const V = viewerPlayer();
  const ps = game.players.filter(p => p.alive).concat((game.decoys || []).map(decoyView)).sort((a, b) => a.y - b.y);
  for (const p of ps) {
    const al = visAlpha(p, V);
    if (p.disguised && al < 1 && p !== V) { drawSpr(ctx, 'crate', p.x, p.y - 4, TILE + 2); continue; } // looks like any other box
    if (al <= 0) continue;
    ctx.globalAlpha = al; drawPlayer(p, T); ctx.globalAlpha = 1;
  }
  for (const [gx, gy, s] of vfx.grass) { // tall grass drawn over everyone
    const inside = V && V.alive && Math.floor(V.x / TILE) === gx / TILE && Math.floor(V.y / TILE) === gy / TILE;
    ctx.globalAlpha = inside ? 0.45 : 0.95;
    const sw = Math.sin(T * 2 + s) * 0.08;
    drawSpr(ctx, 'herb', gx + 14, gy + 20, 30, -0.3 + sw); drawSpr(ctx, 'herb', gx + 34, gy + 22, 30, 0.35 + sw); drawSpr(ctx, 'herb', gx + 24, gy + 34, 30, sw);
  }
  ctx.globalAlpha = 1;

  for (const r of game.rangs) if (r.state !== 'dropped') {
    const v = vfx.rang.get(r.id) || { trail: [], spin: 0 }, sz = 24;
    ctx.fillStyle = r.fire ? '#ff7a2a' : r.ice ? '#9fe3ff' : r.ghost ? '#c9b8ff' : r.owner.color;
    for (let i = 0; i < v.trail.length; i++) {
      const tr = v.trail[i]; ctx.globalAlpha = (i / v.trail.length) * 0.35;
      ctx.beginPath(); ctx.arc(tr.x, tr.y, 6 * i / v.trail.length + 2, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(r.x + 6, r.y + 12, 9, 4, 0, 0, 7); ctx.fill();
    drawSpr(ctx, 'boomerang', r.x, r.y, sz, v.spin, r.ghost ? 0.6 : 1);
    if (r.boom) drawSpr(ctx, 'boom', r.x, r.y - 4, 13 + Math.sin(T * 30) * 2);
  }

  for (const p of vfx.parts) {
    ctx.globalAlpha = clamp(p.life / p.max, 0, 1); ctx.fillStyle = p.col;
    if (p.sq) ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  for (const f of vfx.fx) {
    const k = f.t / f.max;
    if (f.type === 'boom') {
      ctx.globalAlpha = 1 - k; ctx.fillStyle = '#ffcf5a'; ctx.beginPath(); ctx.arc(f.x, f.y, f.R * (0.4 + k * 0.7), 0, 7); ctx.fill();
      drawSpr(ctx, 'boom', f.x, f.y, f.R * 1.8 * (0.6 + k * 0.5), 0, 1 - k);
    } else if (f.type === 'spark') {
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) { const a = i * 1.047; ctx.beginPath(); ctx.moveTo(f.x + Math.cos(a) * 6, f.y + Math.sin(a) * 6); ctx.lineTo(f.x + Math.cos(a) * (8 + k * 18), f.y + Math.sin(a) * (8 + k * 18)); ctx.stroke(); }
    } else if (f.type === 'ring') {
      ctx.globalAlpha = 1 - k; ctx.strokeStyle = f.col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(f.x, f.y, 10 + k * 34, 0, 7); ctx.stroke();
    } else if (f.type === 'reveal') { // the power's icon pops out of the mystery bubble
      drawSpr(ctx, POWERS[f.k].sprite, f.x, f.y - 20 - k * 30, 26 + k * 8, 0, 1 - k * k);
    } else if (f.type === 'ghostup') {
      drawSpr(ctx, 'skull', f.x, f.y - k * 40, 26, Math.sin(k * 12) * 0.2, 1 - k);
    } else if (f.type === 'text') {
      ctx.globalAlpha = 1 - k * k; ctx.font = `900 ${f.big ? 22 : 15}px ui-rounded, system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(f.text, f.x, f.y - k * 25);
      ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, f.y - k * 25);
    }
  }
  ctx.globalAlpha = 1;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (cam.target) drawOffscreen(T);
  drawScores();
  if (game.state === 'play') drawTouchControls();
  if (game.online) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '700 11px system-ui'; ctx.textAlign = 'right';
    ctx.fillText(`${net.ping} ms`, view.w - view.safe.r - 10, view.safe.t + 20);
  }
}

// Who is this screen "playing as"? Hidden snacks are invisible to them unless close.
function viewerPlayer() {
  if (game.online) return net.tv ? null : game.players.find(p => p.i === net.slot) || null;
  const humans = game.players.filter(p => !p.bot);
  return humans.length === 1 ? humans[0] : null;
}
function visAlpha(p, V) {
  const sneaky = p.hidden || p.disguised;
  if (p === V || (p.decoyOf && p.decoyOf === V)) return sneaky ? 0.55 : 1;
  if (!sneaky) return 1;
  if (V && V.alive && Math.hypot(p.x - V.x, p.y - V.y) < TUNE.revealDist) return 1;
  if (V && game.players.length && isTeammate(p, V)) return 0.6;
  return V ? 0 : 0.3; // shared screens (TV, couch) show a faint outline
}
function isTeammate(a, b) { return ((game.opts && game.opts.mode === 'teams') || game.mode === 'teams') && a.i % 2 === b.i % 2; }
function decoyView(d) {
  const o = d.owner;
  return Object.assign({}, o, { x: d.x, y: d.y, vx: d.vx * (game.online ? 30 : 1), vy: d.vy * (game.online ? 30 : 1), face: d.face, hasRang: true, charging: false, slashT: 0,
    shield: false, frozen: 0, falling: 0, inv: 0, dashT: 0, hidden: false, disguised: false, bamboo: 0, decoyOf: o, walkT: (o.walkT || 0) + 1.3 });
}

function drawPlayer(p, T) {
  const moving = Math.hypot(p.vx, p.vy) > 30;
  const fall = p.falling > 0 ? clamp(p.falling / 0.45, 0, 1) : 1;
  const bob = moving ? Math.abs(Math.sin(p.walkT || 0)) * 4 : Math.sin(T * 3 + p.i) * 1.2;
  const size = 40 * fall;
  ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 15, 16 * fall, 6 * fall, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = p.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(p.x, p.y + 15, 19 * fall, 8 * fall, 0, 0, 7); ctx.stroke();
  if (p.bamboo > 0) drawSpr(ctx, 'dizzy', p.x - 18, p.y - 30, 16, Math.sin(T * 8) * 0.4);
  if (!p.falling) {
    const ax = p.x + Math.cos(p.face) * 30, ay = p.y + 6 + Math.sin(p.face) * 22;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(p.face); ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-4, -6); ctx.lineTo(-4, 6); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  if (p.charging) { // aim line + target ring where the boomerang will turn around
    const pw = clamp(p.charge / TUNE.fullCharge, 0, 1), len = TUNE.minRange + (TUNE.maxRange - TUNE.minRange) * pw, a = p.aim;
    const tx = p.x + Math.cos(a) * len, ty = p.y + Math.sin(a) * len;
    ctx.strokeStyle = p.color; ctx.globalAlpha = 0.6; ctx.lineWidth = 3; ctx.setLineDash([6, 8]); ctx.lineDashOffset = -T * 40;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 0.9; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tx, ty, 14, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx - 20, ty); ctx.lineTo(tx - 8, ty); ctx.moveTo(tx + 8, ty); ctx.lineTo(tx + 20, ty);
    ctx.moveTo(tx, ty - 20); ctx.lineTo(tx, ty - 8); ctx.moveTo(tx, ty + 8); ctx.lineTo(tx, ty + 20); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(p.x, p.y - 4, 26, -Math.PI / 2, -Math.PI / 2 + pw * Math.PI * 2); ctx.stroke();
  }
  ctx.save(); ctx.translate(p.x, p.y - bob - 4);
  if (p.dashT > 0) { ctx.rotate(Math.cos(p.dashDir) * 0.3); ctx.scale(1 / 0.85, 0.85); }
  if (p.inv > 0 && Math.floor(T * 20) % 2) ctx.globalAlpha = 0.5;
  ctx.drawImage(SPR[p.char.key], -size / 2, -size / 2, size, size);
  ctx.restore(); ctx.globalAlpha = 1;
  if (p.frozen > 0) { // ice block
    ctx.fillStyle = 'rgba(170,230,255,0.45)'; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2;
    roundRectAt(p.x - 22, p.y - 28, 44, 46, 8); ctx.fill(); ctx.stroke();
  }
  if (p.hasRang && !p.falling) { // one boomerang per hand
    const hx = p.x + Math.cos(p.face + 1.2) * 20, hy = p.y - bob + Math.sin(p.face + 1.2) * 14;
    drawSpr(ctx, 'boomerang', hx, hy, 18, p.face + (p.charging ? T * 20 : 0.6));
    if ((p.ammo || 1) > 1) drawSpr(ctx, 'boomerang', p.x + Math.cos(p.face - 1.2) * 20, p.y - bob + Math.sin(p.face - 1.2) * 14, 18, p.face - 0.6);
  }
  if (p.slashT > 0) {
    const k = 1 - p.slashT / 0.2;
    ctx.strokeStyle = p.slashArmed === false ? `rgba(255,220,160,${1 - k})` : `rgba(255,255,255,${1 - k})`; ctx.lineWidth = p.slashArmed === false ? 4 : 7;
    ctx.beginPath(); ctx.arc(p.x, p.y, 44, p.face - 1.3 + k * 0.3, p.face + 1.3 * (k * 2 - 1)); ctx.stroke();
  }
  if (p.shield) { ctx.strokeStyle = 'rgba(127,211,255,0.85)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y - 4, 25 + Math.sin(T * 6) * 1.5, 0, 7); ctx.stroke(); }
  (p.powers || []).forEach((k, n) => drawSpr(ctx, POWERS[k].sprite, p.x - 14 + n * 14, p.y - 30 - bob, 14));
  if (game.online && p.name) {
    ctx.font = '800 11px ui-rounded, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.strokeText(p.name, p.x, p.y + 34);
    ctx.fillStyle = p.color; ctx.fillText(p.name, p.x, p.y + 34);
  }
}

function drawScores() {
  if (!game.players.length || !$('scoreboard').classList.contains('hidden')) return; // the scoreboard is showing
  const n = game.players.length, gap = n > 4 ? 4 : 6;
  const w = Math.min(64, Math.floor((Math.min(view.w - 120, 600) - (n - 1) * gap) / n)); // chips shrink to fit 8 players
  const total = n * w + (n - 1) * gap;
  let x = view.w / 2 - total / 2; const y = view.safe.t + 6;
  for (const p of game.players) {
    ctx.fillStyle = 'rgba(20,12,40,0.6)'; roundRect(x, y, w, 30, 10); ctx.fill();
    ctx.fillStyle = p.color; roundRect(x, y + 26, w, 4, 2); ctx.fill();
    ctx.globalAlpha = p.alive ? 1 : 0.35; ctx.drawImage(SPR[p.char.key], x + 4, y + 5, 20, 20); ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.font = '900 16px ui-rounded, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.score, x + 24 + (w - 24) / 2, y + 15);
    if (p.score === game.points - 1) drawSpr(ctx, 'crown', x + w - 8, y + 2, 14, 0.3);
    x += w + gap;
  }
  ctx.textBaseline = 'alphabetic';
}
function roundRectAt(x, y, w, h, r) { roundRect(x, y, w, h, r); }
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function drawTouchControls() {
  const me = game.online ? game.players.find(p => p.i === net.slot) : game.players.find(p => p.src === 'human');
  if (!me || !touch.active) return;
  if (touch.move) {
    const m = touch.move;
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(m.ox, m.oy, 60, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(m.x, m.y, 26, 0, 7); ctx.fill();
  } else {
    const bx = view.safe.l + 110, by = view.h - view.safe.b - 100;
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(bx, by, 54, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = '700 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText('MOVE', bx, by + 4);
  }
  const tb = throwBtn();
  if (touch.aim) {
    const a = touch.aim;
    ctx.fillStyle = 'rgba(255,182,39,0.15)'; ctx.beginPath(); ctx.arc(a.ox, a.oy, 60, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,182,39,0.5)'; ctx.lineWidth = 2; ctx.stroke();
    const dx = a.x - a.ox, dy = a.y - a.oy, d = Math.hypot(dx, dy) || 1, k = Math.min(1, 50 / d);
    ctx.fillStyle = 'rgba(255,182,39,0.6)'; ctx.beginPath(); ctx.arc(a.ox + dx * k, a.oy + dy * k, 24, 0, 7); ctx.fill();
    if (me.charging) {
      const pw = clamp(me.charge / TUNE.fullCharge, 0, 1);
      ctx.strokeStyle = '#ffb627'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(a.ox, a.oy, 66, -Math.PI / 2, -Math.PI / 2 + pw * Math.PI * 2); ctx.stroke();
    }
  } else {
    ctx.globalAlpha = me.hasRang ? 1 : 0.6;
    ctx.fillStyle = 'rgba(255,182,39,0.25)'; ctx.beginPath(); ctx.arc(tb.x, tb.y, tb.r, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(255,182,39,0.6)'; ctx.lineWidth = 2; ctx.stroke();
    drawSpr(ctx, 'boomerang', tb.x, tb.y - (me.hasRang ? 0 : 6), me.hasRang ? 44 : 30, -0.4);
    if (!me.hasRang) { ctx.fillStyle = '#fff'; ctx.font = '900 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText(me.regenT > 0 ? 'RELOADING' : (me.powers || []).includes('tele') ? 'HOLD: STEER' : 'HOLD: CALL', tb.x, tb.y + 24); }
    ctx.globalAlpha = 1;
  }
  const sb = slashBtn();
  ctx.globalAlpha = 1;
  ctx.fillStyle = touch.slash ? 'rgba(255,93,115,0.55)' : 'rgba(255,93,115,0.25)'; ctx.beginPath(); ctx.arc(sb.x, sb.y, sb.r, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(255,93,115,0.75)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '900 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(me.hasRang ? 'SLASH' : 'SHOVE', sb.x, sb.y);
  ctx.textBaseline = 'alphabetic';
  const db = dashBtn();
  ctx.fillStyle = touch.dash ? 'rgba(67,168,255,0.5)' : 'rgba(67,168,255,0.25)'; ctx.beginPath(); ctx.arc(db.x, db.y, db.r, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(67,168,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = '900 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('DASH', db.x, db.y);
  ctx.textBaseline = 'alphabetic';
}

// ---------------------------------------------------------------- layout
function resize() {
  const s = getComputedStyle($('safe'));
  view.safe = { t: parseFloat(s.paddingTop) || 0, r: parseFloat(s.paddingRight) || 0, b: parseFloat(s.paddingBottom) || 0, l: parseFloat(s.paddingLeft) || 0 };
  view.w = innerWidth; view.h = innerHeight; view.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  canvas.width = Math.round(view.w * view.dpr); canvas.height = Math.round(view.h * view.dpr);
  const aw = view.w - view.safe.l - view.safe.r, ah = view.h - view.safe.t - view.safe.b;
  view.scale = Math.min(aw / WW, ah / WH);
  view.ox = view.safe.l + (aw - WW * view.scale) / 2; view.oy = view.safe.t + (ah - WH * view.scale) / 2;
  document.body.classList.toggle('portrait', view.h > view.w * 1.05);
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));

// ---------------------------------------------------------------- screens
function show(id, on = true) { $(id).classList.toggle('hidden', !on); }
let bannerTimer = 0;
function showBanner(html, ms, color) {
  const b = $('banner'); b.innerHTML = html; b.style.color = color || '#fff';
  b.classList.remove('hidden'); b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
  clearTimeout(bannerTimer); bannerTimer = setTimeout(() => b.classList.add('hidden'), ms);
}
function slotRow(color, charKey, off, label, sub, onChar, onType) {
  const row = document.createElement('div'); row.className = 'slot';
  row.innerHTML = `<span class="dot" style="background:${color}"></span>
    <button class="char ${off ? 'off' : ''}" aria-label="Change snack"><img src="sprites/${charKey}.svg" alt=""></button>
    <button class="type">${label} <small>${sub || '&nbsp;'}</small></button>`;
  const cb = row.querySelector('.char'), tb = row.querySelector('.type');
  if (onChar) cb.onclick = onChar; else cb.disabled = true;
  if (onType) tb.onclick = onType; else tb.classList.add('static');
  return row;
}

function buildMenu() {
  const slots = $('slots'); slots.innerHTML = '';
  settings.slots.forEach((s, i) => {
    const t = SLOT_TYPES.find(x => x.id === s.type) || SLOT_TYPES[0];
    slots.appendChild(slotRow(PCOLORS[i], CHARS[s.char].key, s.type === 'off', t.label, t.sub,
      () => { const used = settings.slots.filter((o, j) => j !== i).map(o => o.char); let c = s.char; do { c = (c + 1) % CHARS.length; } while (used.includes(c)); s.char = c; saveSettings(); buildMenu(); },
      () => { const idx = SLOT_TYPES.findIndex(x => x.id === s.type); s.type = SLOT_TYPES[(idx + 1) % SLOT_TYPES.length].id; saveSettings(); buildMenu(); }));
  });
  buildSeg($('seg-points'), settings.points, (n) => { settings.points = n; saveSettings(); buildMenu(); });
  $('btn-map').textContent = settings.map < 0 ? 'Random' : MAPS[settings.map].name;
  $('btn-mode').textContent = MODE_LABEL[settings.mode] || MODE_LABEL.ffa;
  $('btn-pw').textContent = PW_LABEL[settings.pw] || 'Normal';
  $('btn-pull').textContent = settings.pull ? 'On' : 'Off';
  $('btn-sound').textContent = Sound.on ? 'On' : 'Off';
  $('btn-camera').textContent = settings.camera === 'whole' ? 'Whole arena' : 'Follow me';
  const active = settings.slots.filter(s => s.type !== 'off').length;
  $('btn-play').disabled = active < 2; $('btn-play').style.opacity = active < 2 ? 0.5 : 1;
  $('btn-play').textContent = active < 2 ? 'Need 2+ fighters' : 'Play';
}
function buildSeg(el, cur, onPick, disabled) {
  el.innerHTML = '';
  POINT_OPTIONS.forEach(n => {
    const b = document.createElement('button'); b.textContent = n; b.className = cur === n ? 'on' : '';
    if (disabled) b.disabled = true; else b.onclick = () => onPick(n);
    el.appendChild(b);
  });
}

function canManage() {
  const L = net.lobby; if (!L) return false;
  return L.host === net.you || (L.tv && L.slots.some(s => s.type === 'net' && s.owner === net.you));
}
function joinURL() {
  const local = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  const host = local && net.lan && net.lan.length ? `${net.lan[0]}:${net.port}` : location.host;
  return `${local ? 'http:' : location.protocol}//${host}/?join=${net.code}`;
}
function renderLobby() {
  const L = net.lobby; if (!L) return;
  const isHost = canManage();
  document.body.classList.toggle('tv', !!net.tv);
  $('lobby-join').innerHTML = net.tv ? `On your phone, open <b>${esc(joinURL())}</b><br>or go to <b>${esc(joinURL().replace(/\/\?join=.*/, ''))}</b> → Play online → code <b>${esc(L.code)}</b>` : '';
  $('lobby-code').textContent = L.code;
  const el = $('lobby-slots'); el.innerHTML = '';
  L.slots.forEach((s, i) => {
    if (s.type === 'net') {
      const mine = s.owner === net.you;
      el.appendChild(slotRow(PCOLORS[i], CHARS[s.char].key, false, esc(s.name) + (mine ? ' (you)' : ''), s.owner === L.host ? 'Host' : 'Online',
        mine ? () => net.send({ t: 'char' }) : null, null));
    } else {
      const [label, sub] = ONLINE_SLOT_LABEL[s.type] || ['?', ''];
      const charKey = s.type.startsWith('cpu') ? CHARS[s.char || 0].key : 'boomerang';
      el.appendChild(slotRow(PCOLORS[i], charKey, !s.type.startsWith('cpu'), label, sub,
        isHost && s.type.startsWith('cpu') ? () => net.send({ t: 'char', n: i }) : null,
        isHost ? () => net.send({ t: 'slot', n: i }) : null));
    }
  });
  buildSeg($('lobby-points'), L.points, (n) => net.send({ t: 'cfg', points: n }), !isHost);
  const mb = $('lobby-map'); mb.textContent = L.map < 0 ? 'Random' : MAPS[L.map].name; mb.disabled = !isHost;
  const mo = $('lobby-mode'); mo.textContent = MODE_LABEL[L.mode] || MODE_LABEL.ffa; mo.disabled = !isHost;
  mo.onclick = () => net.send({ t: 'cfg', mode: L.mode === 'teams' ? 'ffa' : 'teams' });
  const pw = $('lobby-pw'); pw.textContent = PW_LABEL[L.pw] || 'Normal'; pw.disabled = !isHost;
  pw.onclick = () => net.send({ t: 'cfg', pw: nextPw(L.pw) });
  const pu = $('lobby-pull'); pu.textContent = L.pull === false ? 'Off' : 'On'; pu.disabled = !isHost;
  pu.onclick = () => net.send({ t: 'cfg', pull: L.pull === false });
  mb.onclick = () => net.send({ t: 'cfg', map: L.map + 1 >= MAPS.length ? -1 : L.map + 1 });
  $('btn-lobby-start').classList.toggle('hidden', !isHost);
  const fighters = L.slots.filter(s => s.type === 'net' || s.type.startsWith('cpu')).length;
  $('btn-lobby-start').textContent = fighters < 2 ? 'Add a CPU or wait for a friend' : 'Start match';
  $('btn-lobby-start').style.opacity = fighters < 2 ? 0.5 : 1;
  $('lobby-wait').classList.toggle('hidden', isHost);
  $('lobby-wait').textContent = L.playing ? 'Match in progress — you\'ll join the next one.' : 'Waiting for the host to start…';
  $('lobby-msg').textContent = isHost ? (net.tv ? 'Click an empty slot to add a CPU.' : 'Tap an empty slot to add a CPU. Friends join with the code.') : '';
}
function onlineStatus(msg) { $('online-status').textContent = msg; }

$('btn-map').onclick = () => { settings.map = settings.map + 1 >= MAPS.length ? -1 : settings.map + 1; saveSettings(); buildMenu(); };
const MODE_LABEL = { ffa: 'Free-for-all', teams: 'Teams' };
const PW_LABEL = { 0: 'Off', 0.5: 'Few', 1: 'Normal', 2: 'Lots' };
const PW_CYCLE = [1, 2, 0, 0.5];
const nextPw = (v) => PW_CYCLE[(PW_CYCLE.indexOf(v) + 1) % PW_CYCLE.length];
$('btn-mode').onclick = () => { settings.mode = settings.mode === 'teams' ? 'ffa' : 'teams'; saveSettings(); buildMenu(); };
$('btn-pw').onclick = () => { settings.pw = nextPw(settings.pw); saveSettings(); buildMenu(); };
$('btn-pull').onclick = () => { settings.pull = !settings.pull; saveSettings(); buildMenu(); };
$('btn-camera').onclick = () => { settings.camera = settings.camera === 'whole' ? 'follow' : 'whole'; saveSettings(); buildMenu(); };
$('btn-tv').onclick = () => { Sound.unlock(); saveOnlineFields(); net.tv = true; net.connect({ t: 'host', name: 'TV', tv: true }); };
$('btn-host').addEventListener('click', () => { net.tv = false; }, true);
$('btn-join').addEventListener('click', () => { net.tv = false; }, true);
$('btn-sound').onclick = () => { Sound.on = !Sound.on; store('bb_sound', Sound.on); Sound.unlock(); Sound.tick(); buildMenu(); };
$('btn-help').onclick = () => show('help');
$('btn-help-close').onclick = () => show('help', false);
$('btn-play').onclick = () => { Sound.unlock(); startLocal(); };
$('btn-online').onclick = () => {
  show('menu', false); show('online');
  $('in-name').value = settings.name || ''; $('in-server').value = settings.server || window.BB_SERVER || '';
  $('server-row').classList.toggle('hidden', !!window.BB_SERVER && !settings.server && !$('server-row').dataset.open);
  onlineStatus('');
};
$('btn-online-back').onclick = () => { net.close(); show('online', false); show('menu'); };
$('btn-edit-server').onclick = () => { $('server-row').dataset.open = 1; $('server-row').classList.remove('hidden'); };
function saveOnlineFields() {
  settings.name = $('in-name').value.trim().slice(0, 12); settings.server = $('in-server').value.trim(); saveSettings();
}
$('btn-host').onclick = () => { Sound.unlock(); saveOnlineFields(); net.connect({ t: 'host', name: settings.name }); };
$('btn-join').onclick = () => {
  Sound.unlock(); saveOnlineFields();
  const code = $('in-code').value.trim().toUpperCase();
  if (code.length !== 4) { onlineStatus('Room codes are 4 letters.'); return; }
  net.connect({ t: 'join', code, name: settings.name });
};
$('in-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4); });
$('btn-lobby-start').onclick = () => net.send({ t: 'start' });
$('btn-lobby-leave').onclick = () => { net.send({ t: 'leave' }); net.close(); show('lobby', false); show('online'); onlineStatus(''); };
$('btn-pause').onclick = togglePause;
$('btn-resume').onclick = togglePause;
$('btn-quit').onclick = () => { if (game.online) { net.send({ t: 'leave' }); net.close(); } toMenu(); };
$('btn-rematch').onclick = () => { if (game.online) net.send({ t: 'start' }); else startLocal(); };
$('btn-menu').onclick = () => {
  if (game.online) { if (canManage()) net.send({ t: 'lobby' }); else { net.send({ t: 'leave' }); net.close(); toMenu(); } }
  else toMenu();
};

function enterGame() {
  show('menu', false); show('result', false); show('pause', false); show('online', false); show('lobby', false); show('btn-pause');
  document.body.classList.add('playing');
}
function togglePause() {
  if (game.state === 'play') { game.state = 'paused'; show('pause'); $('pause-title').textContent = game.online ? 'Menu' : 'Paused'; $('btn-resume').textContent = game.online ? 'Back to game' : 'Resume'; }
  else if (game.state === 'paused') { game.state = 'play'; show('pause', false); }
}
function toMenu() {
  hideScoreboard();
  game = { state: 'menu', online: false, grid: game.grid, players: [], rangs: [], pickups: [], mapIndex: game.mapIndex, time: 0 };
  show('pause', false); show('result', false); show('btn-pause', false); show('banner', false); show('lobby', false); show('online', false);
  document.body.classList.remove('playing'); show('menu'); buildMenu();
}
function exitGameToLobby() {
  game = { state: 'menu', online: false, grid: game.grid, players: [], rangs: [], pickups: [], mapIndex: game.mapIndex, time: 0 };
  show('result', false); show('pause', false); show('btn-pause', false); show('banner', false);
  document.body.classList.remove('playing'); show('lobby');
}
function showResult(w, team) {
  if (!w) return;
  hideScoreboard();
  game.state = 'result'; Sound.win(); show('btn-pause', false); show('banner', false); show('pause', false);
  if (team >= 0) { $('result-title').textContent = `${TEAM_NAMES[team]} team wins!`; $('result-title').style.color = TEAM_COLORS[team]; }
  else { $('result-title').textContent = `${playerLabel(w)} wins!`; $('result-title').style.color = w.color; }
  const st = $('standings'); st.innerHTML = '';
  game.players.slice().sort((a, b) => b.score - a.score).forEach(p => {
    const d = document.createElement('div'); d.className = 'stand';
    d.innerHTML = `<img src="sprites/${p.char.key}.svg" alt=""><span class="bar" style="color:${p.color}">${esc(playerLabel(p))}${p.bot ? ' <small style="opacity:.6">CPU</small>' : ''}</span><span class="kd">${p.kills || 0} KO · ${p.deaths || 0} out</span><span class="pts">${p.score}</span>`;
    st.appendChild(d);
  });
  const host = !game.online || canManage();
  $('btn-rematch').classList.toggle('hidden', !host);
  $('btn-menu').textContent = game.online ? (host ? 'Back to lobby' : 'Leave') : 'Menu';
  $('result-wait').classList.toggle('hidden', host);
  show('result');
}
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'play' && !game.online) togglePause(); });

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0, padStartPrev = false;
const STEP = 1 / 120;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const startNow = getPads().some(p => p.buttons[9] && p.buttons[9].pressed);
  if (startNow && !padStartPrev) {
    if (game.state === 'menu' && !$('menu').classList.contains('hidden')) startLocal();
    else if (game.state === 'result' && !game.online) startLocal();
    else if (game.state === 'play' || game.state === 'paused') togglePause();
  }
  padStartPrev = startNow;

  if (game.online) {
    net.frame(dt);
    updateVfx(dt);
  } else if (game.state === 'play') {
    acc += dt;
    // hold the countdown while the phone is still upright (the rotate screen is showing)
    const waitForTurn = game.phase === 'intro' && document.body.classList.contains('portrait');
    while (acc >= STEP) { if (!waitForTurn) { localInputs(); Sim.step(game, STEP); } acc -= STEP; }
    drainLocalEvents();
    updateVfx(dt * (game.timeScale || 1));
  }
  updateCamera(dt);
  render(now / 1000);
}

// ---------------------------------------------------------------- boot
resize();
loadSprites().then(() => {
  show('loading', false); buildMenu();
  const m = Sim.buildMap(Math.floor(Math.random() * MAPS.length)); // backdrop behind the menu
  setDims(m.cols, m.rows); game.grid = m.grid; game.shapes = m.shapes; game.nav = m.nav; renderFloor();
  requestAnimationFrame(frame);
  // Deep link: ?join=ABCD opens the online screen with the code filled in
  const q = new URLSearchParams(location.search);
  if (q.get('server')) { settings.server = q.get('server'); saveSettings(); }
  if (q.has('tv')) { $('btn-online').onclick(); $('btn-tv').onclick(); }
  if (q.get('join')) { $('btn-online').onclick(); $('in-code').value = q.get('join').toUpperCase().slice(0, 4); }
});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
