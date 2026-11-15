/* Boomerang Bites — shared simulation.
   Runs in the browser (offline / local play) and in Node (server-authoritative online play).
   No DOM, no audio: anything visual or audible is pushed to game.events for the client to present. */
(function (root) {
'use strict';

const TILE = 48, COLS = 20, ROWS = 12, WW = COLS * TILE, WH = ROWS * TILE;
const FLOOR = 0, WALL = 1, CRATE = 2, PIT = 3, TREE = 4;
const PLAYER_R = 16;
const PCOLORS = ['#ff5d73', '#43a8ff', '#ffd23f', '#5ee06b'];
const CHARS = [
  { key: 'pizza', name: 'Pizza', col: '#f4b13e' },
  { key: 'burger', name: 'Burger', col: '#c1694f' },
  { key: 'taco', name: 'Taco', col: '#ffcc4d' },
  { key: 'donut', name: 'Donut', col: '#ea596e' },
  { key: 'sushi', name: 'Sushi', col: '#f4900c' },
  { key: 'avocado', name: 'Avocado', col: '#77b255' },
  { key: 'watermelon', name: 'Melon', col: '#dd2e44' },
  { key: 'cupcake', name: 'Cupcake', col: '#f4abba' },
  { key: 'hotdog', name: 'Hot Dog', col: '#e0703a' },
  { key: 'strawberry', name: 'Berry', col: '#be1931' },
  { key: 'croissant', name: 'Croissant', col: '#d99e82' },
  { key: 'riceball', name: 'Onigiri', col: '#e1e8ed' },
];
const POWERS = {
  fire:   { sprite: 'fire',   name: 'Explosive!' },
  multi:  { sprite: 'multi',  name: 'Triple Throw!' },
  ghost:  { sprite: 'ghost',  name: 'Ghost Rang!' },
  zap:    { sprite: 'speed',  name: 'Zap Rang!' },
  feet:   { sprite: 'shoe',   name: 'Speedy Feet!' },
  shield: { sprite: 'shield', name: 'Shield!' },
};
const POWER_KEYS = Object.keys(POWERS);
const BOT_DIFF = {
  cpu1: { react: 0.5, err: 0.32, dodge: 0.25, aggro: 0.5 },
  cpu2: { react: 0.28, err: 0.16, dodge: 0.6, aggro: 0.8 },
  cpu3: { react: 0.13, err: 0.06, dodge: 0.92, aggro: 1 },
};
// Quadrant maps (10x6), mirrored both ways into a fair 20x12 arena.
// # wall  t tree  c box  o hot-sauce pit  S spawn  . floor
const MAPS = [
  { name: 'Picnic', q: ['##########', '#S........', '#..##..c..', '#..#...c..', '#....c....', '#.c...o...'] },
  { name: 'Kitchen', q: ['##########', '#S...c....', '#.##...##.', '#.#..c....', '#...##..cc', '#.c..#....'] },
  { name: 'Sauce Pit', q: ['##########', '#S..c.....', '#..ooo..#.', '#..o....#.', '#..o..c...', '#.c....ooo'] },
  { name: 'Garden', q: ['##########', '#S...t....', '#.c.....c.', '#..t.cc.t.', '#.....t...', '#.tc......'] },
  { name: 'Open Plate', q: ['##########', '#S........', '#.........', '#...c..#..', '#.........', '#......c..'] },
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const NO_INPUT = { mx: 0, my: 0, ax: 0, ay: 0, throw: false, dash: false };

let game = null; // the game currently being simulated (set by use())
const emit = (type, d) => { game.events.push([type, d === undefined ? 0 : d]); };

function create() {
  return {
    grid: [], spawns: [], mapIndex: 0, players: [], rangs: [], pickups: [], events: [],
    round: 0, phase: 'intro', phaseT: 0, timeScale: 1, slowT: 0, powerTimer: 0, time: 0,
    points: 5, mapSetting: -1, nextId: 1, over: false,
  };
}
function use(g) { game = g; }

function buildMap(idx) {
  const m = MAPS[idx], g = [], spawns = [];
  for (let y = 0; y < ROWS; y++) {
    g.push([]);
    for (let x = 0; x < COLS; x++) {
      const ch = m.q[y < 6 ? y : 11 - y][x < 10 ? x : 19 - x];
      let v = FLOOR;
      if (ch === '#') v = WALL; else if (ch === 'c') v = CRATE; else if (ch === 'o') v = PIT; else if (ch === 't') v = TREE;
      else if (ch === 'S') spawns.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, q: (x < 10 ? 0 : 1) + (y < 6 ? 0 : 2) });
      g[y].push(v);
    }
  }
  // TL, BR, TR, BL — so a 1v1 starts in opposite corners
  return { grid: g, spawns: [0, 3, 1, 2].map(q => spawns.find(s => s.q === q)) };
}
const gridToString = (g) => g.map(r => r.join('')).join('');
const gridFromString = (s) => { const g = []; for (let y = 0; y < ROWS; y++) { g.push([]); for (let x = 0; x < COLS; x++) g[y].push(+s[y * COLS + x]); } return g; };

const tileAt = (px, py) => {
  const x = Math.floor(px / TILE), y = Math.floor(py / TILE);
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return WALL;
  return game.grid[y][x];
};
const solidT = (v) => v === WALL || v === CRATE || v === TREE;
const solidAt = (px, py) => solidT(tileAt(px, py));

function makeBot(type) {
  return { diff: BOT_DIFF[type] || BOT_DIFF.cpu2, think: 0, mode: 'idle', aimErr: 0, chargeGoal: 0, tap: 0, field: null, fieldKey: '', fieldAge: 0, strafe: 1, strafeT: 0, noPathT: 0, danger: null };
}

// specs: [{ i, type, char }]  type: 'local' | 'net' | 'cpu1' | 'cpu2' | 'cpu3'
function newMatch(g, specs, points, mapSetting) {
  use(g);
  g.points = points; g.mapSetting = mapSetting; g.over = false;
  g.players = specs.map(s => ({
    i: s.i, type: s.type, char: CHARS[s.char], charIndex: s.char, color: PCOLORS[s.i], score: 0,
    bot: s.type.startsWith('cpu') ? makeBot(s.type) : null, input: NO_INPUT,
  }));
  g.round = 0;
  newRound();
}

function newRound() {
  game.round++;
  const n = MAPS.length;
  const idx = game.mapSetting >= 0 ? game.mapSetting
    : game.round === 1 ? Math.floor(Math.random() * n)
    : (game.mapIndex + 1 + Math.floor(Math.random() * (n - 1))) % n;
  const m = buildMap(idx);
  game.grid = m.grid; game.spawns = m.spawns; game.mapIndex = idx;
  game.rangs = []; game.pickups = [];
  game.players.forEach((p, n) => {
    const s = game.spawns[n];
    Object.assign(p, {
      x: s.x, y: s.y, vx: 0, vy: 0, face: Math.atan2(WH / 2 - s.y, WW / 2 - s.x), alive: true, hasRang: true,
      charging: false, charge: 0, slashT: 0, slashCd: 0, dashT: 0, dashCd: 0, dashDir: 0, power: null, shield: false,
      falling: 0, walkT: 0, prevThrow: false, prevDash: false, inv: 0,
    });
    if (p.bot) Object.assign(p.bot, { think: 0.3 + Math.random() * 0.3, mode: 'idle', tap: 0, field: null, fieldKey: '', danger: null });
  });
  game.phase = 'intro'; game.phaseT = 1.3; game.powerTimer = 7; game.timeScale = 1; game.slowT = 0;
  emit('round', { n: game.round, map: idx, grid: gridToString(game.grid) });
}

// ---------------------------------------------------------------- step
function step(g, dt) {
  use(g);
  if (g.over) return;
  g.time += dt;
  if (g.slowT > 0) { g.slowT -= dt; g.timeScale = g.slowT > 0 ? 0.3 : 1; }
  const sdt = dt * g.timeScale;

  if (g.phase === 'intro') {
    g.phaseT -= dt;
    for (const p of g.players) { p.prevThrow = p.input.throw; p.prevDash = p.input.dash; }
    if (g.phaseT <= 0) { g.phase = 'fight'; emit('go'); }
    return;
  }
  for (const p of g.players) if (p.bot && p.alive) updateBot(p, sdt);
  for (const p of g.players) updatePlayer(p, sdt);
  separatePlayers();
  for (const r of g.rangs.slice()) updateRang(r, sdt);
  rangClashes();
  updatePickups(sdt);

  if (g.phase === 'fight') {
    const alive = g.players.filter(p => p.alive);
    if (alive.length <= (g.players.length > 1 ? 1 : 0)) { g.phase = 'end'; g.phaseT = 1.6; }
  } else if (g.phase === 'end') {
    g.phaseT -= dt;
    if (g.phaseT <= 0) endRound();
  } else if (g.phase === 'between') {
    g.phaseT -= dt;
    if (g.phaseT <= 0) newRound();
  }
}

function endRound() {
  const alive = game.players.filter(p => p.alive);
  const scores = () => game.players.map(p => p.score);
  if (alive.length === 1) {
    const w = alive[0]; w.score++;
    if (w.score >= game.points) { game.over = true; game.phase = 'over'; emit('result', { w: w.i, scores: scores() }); return; }
    emit('score', { w: w.i, scores: scores() });
  } else emit('draw', { scores: scores() });
  game.phase = 'between'; game.phaseT = 1.2;
}

// Movement only — shared with client-side prediction, so keep it free of side effects other than the player itself.
function movePlayer(p, inp, dt, quiet) {
  p.dashCd = Math.max(0, p.dashCd - dt);
  let mx = inp.mx, my = inp.my; const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  if (Math.hypot(inp.ax, inp.ay) > 0.3) p.face = Math.atan2(inp.ay, inp.ax);
  else if (ml > 0.25) p.face = Math.atan2(my, mx);
  if (inp.dash && !p.prevDash && p.dashCd <= 0) {
    p.dashT = 0.17; p.dashCd = 0.8; p.dashDir = ml > 0.25 ? Math.atan2(my, mx) : p.face;
    if (!quiet) emit('dash', { x: Math.round(p.x), y: Math.round(p.y) });
  }
  p.prevDash = inp.dash;
  const speed = 200 * (p.power === 'feet' ? 1.35 : 1) * (p.charging ? 0.55 : 1);
  if (p.dashT > 0) {
    p.dashT -= dt; p.vx = Math.cos(p.dashDir) * 640; p.vy = Math.sin(p.dashDir) * 640;
  } else {
    const a = Math.min(1, dt * 14);
    p.vx = lerp(p.vx, mx * speed, a); p.vy = lerp(p.vy, my * speed, a);
  }
  moveCircle(p, p.vx * dt, p.vy * dt, PLAYER_R);
  if (Math.hypot(p.vx, p.vy) > 30) p.walkT += dt * 12;
}

function updatePlayer(p, dt) {
  if (!p.alive) return;
  if (p.falling > 0) { p.falling -= dt; if (p.falling <= 0) kill(p, null, true); return; }
  const inp = game.phase === 'between' ? NO_INPUT : p.input;
  p.slashT = Math.max(0, p.slashT - dt); p.slashCd = Math.max(0, p.slashCd - dt); p.inv = Math.max(0, p.inv - dt);
  movePlayer(p, inp, dt);
  if (p.dashT <= 0 && tileAt(p.x, p.y) === PIT) { p.falling = 0.45; p.vx = p.vy = 0; p.charging = false; emit('sfx', 'fall'); }

  if (inp.throw && !p.prevThrow && p.hasRang && p.slashCd <= 0) { p.charging = true; p.charge = 0; }
  if (p.charging) {
    if (!p.hasRang) p.charging = false;
    else if (inp.throw) p.charge += dt;
    else {
      p.charging = false;
      if (p.charge < 0.16) slash(p); else throwRang(p, clamp((p.charge - 0.16) / 0.55, 0, 1));
    }
  }
  p.prevThrow = inp.throw;

  for (const k of game.pickups.slice()) {
    if (dist2(p.x, p.y, k.x, k.y) < (PLAYER_R + 16) ** 2) {
      game.pickups.splice(game.pickups.indexOf(k), 1);
      if (k.type === 'shield') p.shield = true; else p.power = k.type;
      emit('pickup', { x: Math.round(p.x), y: Math.round(p.y), k: k.type });
    }
  }
}

function moveCircle(e, dx, dy, r) {
  const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8) || 1;
  for (let s = 0; s < steps; s++) {
    e.x += dx / steps; resolve(e, r, 'x');
    e.y += dy / steps; resolve(e, r, 'y');
  }
}
function resolve(e, r, axis) {
  const x0 = Math.floor((e.x - r) / TILE), x1 = Math.floor((e.x + r) / TILE);
  const y0 = Math.floor((e.y - r) / TILE), y1 = Math.floor((e.y + r) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    const v = (tx < 0 || ty < 0 || tx >= COLS || ty >= ROWS) ? WALL : game.grid[ty][tx];
    if (!solidT(v)) continue;
    const rx = tx * TILE, ry = ty * TILE;
    const cx = clamp(e.x, rx, rx + TILE), cy = clamp(e.y, ry, ry + TILE);
    const dx = e.x - cx, dy = e.y - cy, d = Math.hypot(dx, dy);
    if (d >= r) continue;
    if (d === 0) {
      if (axis === 'x') e.x = (e.x < rx + TILE / 2) ? rx - r : rx + TILE + r;
      else e.y = (e.y < ry + TILE / 2) ? ry - r : ry + TILE + r;
    } else { e.x += dx / d * (r - d); e.y += dy / d * (r - d); }
  }
}
function separatePlayers() {
  const ps = game.players.filter(p => p.alive && !p.falling);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j], d = Math.hypot(a.x - b.x, a.y - b.y), min = PLAYER_R * 2;
    if (d > 0 && d < min) {
      const push = (min - d) / 2, nx = (a.x - b.x) / d, ny = (a.y - b.y) / d;
      moveCircle(a, nx * push, ny * push, PLAYER_R); moveCircle(b, -nx * push, -ny * push, PLAYER_R);
    }
  }
}

function slash(p) {
  p.slashT = 0.2; p.slashCd = 0.35; emit('slash', { i: p.i });
  const reach = 56;
  for (const q of game.players) {
    if (q === p || !q.alive || q.falling) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < reach && (d < 26 || Math.abs(angDiff(Math.atan2(q.y - p.y, q.x - p.x), p.face)) < 1.3)) kill(q, p);
  }
  for (const r of game.rangs) {
    if (r.owner === p || r.state === 'dropped') continue;
    if (dist2(r.x, r.y, p.x, p.y) < (reach + 8) ** 2) {
      const sp = Math.max(480, Math.hypot(r.vx, r.vy));
      r.vx = Math.cos(p.face) * sp; r.vy = Math.sin(p.face) * sp;
      r.state = 'out'; r.traveled = 0; r.maxDist = 260; r.speed = sp; r.immune = p; r.immuneT = 0.5;
      emit('spark', { x: Math.round(r.x), y: Math.round(r.y), s: 1 });
    }
  }
  const fx = p.x + Math.cos(p.face) * 38, fy = p.y + Math.sin(p.face) * 38;
  if (tileAt(fx, fy) === CRATE) breakCrate(Math.floor(fx / TILE), Math.floor(fy / TILE));
}

function newRang(o) { o.id = game.nextId++; o.spin = o.spin || 0; o.t = 0; o.immune = null; o.immuneT = 0; return o; }

function throwRang(p, power) {
  const zap = p.power === 'zap';
  const maxDist = (170 + 340 * power) * (zap ? 1.45 : 1);
  const speed = (540 + 220 * power) * (zap ? 1.4 : 1);
  const angles = p.power === 'multi' ? [0, -0.32, 0.32] : [0];
  angles.forEach((da, n) => {
    const a = p.face + da;
    game.rangs.push(newRang({
      owner: p, x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      speed, state: 'out', traveled: 0, maxDist, main: n === 0,
      ghost: p.power === 'ghost', fire: p.power === 'fire', zap,
    }));
  });
  p.hasRang = false; emit('sfx', 'throw');
}

function updateRang(r, dt) {
  r.spin += dt * (r.state === 'dropped' ? 0 : 28); r.t += dt;
  if (r.immuneT > 0) { r.immuneT -= dt; if (r.immuneT <= 0) r.immune = null; }
  const remove = () => { const i = game.rangs.indexOf(r); if (i >= 0) game.rangs.splice(i, 1); };

  if (r.state === 'out') {
    const f = 1 - 0.6 * (r.traveled / r.maxDist) ** 2;
    const sp = Math.hypot(r.vx, r.vy) || 1, want = r.speed * f;
    const nx = r.x + r.vx / sp * want * dt, ny = r.y + r.vy / sp * want * dt;
    r.traveled += want * dt;
    if (!r.ghost && solidAt(nx, ny)) {
      const tx = Math.floor(nx / TILE), ty = Math.floor(ny / TILE);
      if (game.grid[ty] && game.grid[ty][tx] === CRATE) breakCrate(tx, ty);
      if (r.fire) explode(r, nx, ny);
      if (solidAt(nx, r.y)) r.vx = -r.vx;
      if (solidAt(r.x, ny)) r.vy = -r.vy;
      r.state = 'return'; r.speed = want;
      emit('spark', { x: Math.round(r.x), y: Math.round(r.y), s: 1 });
    } else {
      r.x = clamp(nx, 4, WW - 4); r.y = clamp(ny, 4, WH - 4);
      r.vx = r.vx / sp * want; r.vy = r.vy / sp * want;
      if (r.traveled >= r.maxDist) { r.state = 'return'; r.speed = want; if (r.fire) explode(r, r.x, r.y); }
    }
  } else if (r.state === 'return') {
    const o = r.owner;
    if (!o.alive || o.falling) { if (r.main) { r.state = 'dropped'; r.vx = r.vy = 0; } else remove(); return; }
    const dx = o.x - r.x, dy = o.y - r.y, d = Math.hypot(dx, dy) || 1;
    r.speed = Math.min(r.speed + 1100 * dt, r.zap ? 900 : 700);
    const k = Math.min(1, dt * (d < 80 ? 20 : 6));
    r.vx = lerp(r.vx, dx / d * r.speed, k); r.vy = lerp(r.vy, dy / d * r.speed, k);
    r.x += r.vx * dt; r.y += r.vy * dt;
    if (d < PLAYER_R + 12) { remove(); if (r.main) { o.hasRang = true; emit('sfx', 'catch'); } return; }
  } else if (r.state === 'dropped') {
    for (const p of game.players) {
      if (p.alive && !p.hasRang && !p.falling && dist2(p.x, p.y, r.x, r.y) < (PLAYER_R + 14) ** 2) {
        p.hasRang = true; remove(); emit('sfx', 'catch'); return;
      }
    }
    return;
  }
  const hr = r.zap ? 15 : 13;
  for (const q of game.players) {
    if (q === r.owner || q === r.immune || !q.alive || q.falling) continue;
    if (dist2(q.x, q.y, r.x, r.y) < (PLAYER_R + hr) ** 2) {
      if (r.fire && !r.exploded) explode(r, r.x, r.y);
      else kill(q, r.owner, false, r);
    }
  }
}

function rangClashes() {
  const rs = game.rangs.filter(r => r.state !== 'dropped');
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j];
    if (a.owner === b.owner) continue;
    if (dist2(a.x, a.y, b.x, b.y) < 22 * 22 && (a.state === 'out' || b.state === 'out')) {
      for (const r of [a, b]) { r.state = 'return'; r.speed = 300; r.vx = -r.vx * 0.5; r.vy = -r.vy * 0.5; }
      emit('spark', { x: Math.round((a.x + b.x) / 2), y: Math.round((a.y + b.y) / 2), s: 1 });
    }
  }
}

function explode(r, x, y) {
  if (r.exploded) return; r.exploded = true; r.fire = false;
  const R = 78;
  emit('boom', { x: Math.round(x), y: Math.round(y), R });
  for (const q of game.players) if (q !== r.owner && q.alive && dist2(q.x, q.y, x, y) < (R + PLAYER_R) ** 2) kill(q, r.owner);
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++)
    if (game.grid[ty][tx] === CRATE && dist2(tx * TILE + TILE / 2, ty * TILE + TILE / 2, x, y) < (R + 20) ** 2) breakCrate(tx, ty);
}

function breakCrate(tx, ty) {
  if (game.grid[ty][tx] !== CRATE) return;
  game.grid[ty][tx] = FLOOR;
  emit('crate', { tx, ty });
  if (Math.random() < 0.4) game.pickups.push({ id: game.nextId++, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, type: POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)], t: 0 });
}

function kill(q, by, fell, rang) {
  if (!q.alive) return;
  if (!fell && q.inv > 0) return;
  if (!fell && q.shield) {
    q.shield = false; q.inv = 0.6;
    if (rang) { rang.state = 'return'; rang.speed = 400; }
    emit('shield', { x: Math.round(q.x), y: Math.round(q.y) });
    return;
  }
  q.alive = false; q.charging = false;
  if (q.hasRang && !fell) game.rangs.push(newRang({ owner: q, x: q.x, y: q.y, vx: 0, vy: 0, speed: 0, state: 'dropped', traveled: 0, maxDist: 0, spin: rand(0, 6), main: true }));
  q.hasRang = false;
  emit('kill', { i: q.i, x: Math.round(q.x), y: Math.round(q.y), f: fell ? 1 : 0 });
  if (game.players.filter(p => p.alive).length <= 1) game.slowT = 0.7;
}

function updatePickups(dt) {
  for (const k of game.pickups) k.t += dt;
  if (game.phase !== 'fight') return;
  game.powerTimer -= dt;
  if (game.powerTimer > 0) return;
  game.powerTimer = rand(7, 11);
  if (game.pickups.length >= 2) return;
  for (let tries = 0; tries < 40; tries++) {
    const tx = 1 + Math.floor(Math.random() * (COLS - 2)), ty = 1 + Math.floor(Math.random() * (ROWS - 2));
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    if (game.grid[ty][tx] !== FLOOR || game.players.some(p => p.alive && dist2(p.x, p.y, cx, cy) < 90 * 90)) continue;
    game.pickups.push({ id: game.nextId++, x: cx, y: cy, type: POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)], t: 0 });
    emit('ring', { x: cx, y: cy });
    break;
  }
}

// ---------------------------------------------------------------- bots
function lineClear(ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 10);
  for (let i = 1; i < n; i++) if (solidAt(lerp(ax, bx, i / n), lerp(ay, by, i / n))) return false;
  return true;
}
function distField(gx, gy) {
  const f = new Int16Array(COLS * ROWS).fill(-1);
  if (gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS) return f;
  const q = [gx + gy * COLS]; f[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const c = q[h], cx = c % COLS, cy = (c / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      const n = nx + ny * COLS;
      if (f[n] >= 0 || game.grid[ny][nx] !== FLOOR) continue;
      f[n] = f[c] + 1; q.push(n);
    }
  }
  return f;
}
function pathDir(p, b, gx, gy) {
  const tx = Math.floor(gx / TILE), ty = Math.floor(gy / TILE), key = tx + ',' + ty + ',' + game.round;
  if (b.fieldKey !== key || !b.field || b.fieldAge > 1) { b.field = distField(tx, ty); b.fieldKey = key; b.fieldAge = 0; }
  const cx = Math.floor(p.x / TILE), cy = Math.floor(p.y / TILE), f = b.field;
  const direct = (ok) => { const d = Math.hypot(gx - p.x, gy - p.y) || 1; return [(gx - p.x) / d, (gy - p.y) / d, ok]; };
  if (cx === tx && cy === ty) return direct(true);
  let best = null, bv = f[cx + cy * COLS] >= 0 ? f[cx + cy * COLS] : 9999;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = cx + dx, ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
    if (dx && dy && (game.grid[cy][nx] !== FLOOR || game.grid[ny][cx] !== FLOOR)) continue;
    const v = f[nx + ny * COLS];
    if (v >= 0 && v < bv) { bv = v; best = [nx, ny]; }
  }
  if (!best) return direct(false);
  const wx = best[0] * TILE + TILE / 2 - p.x, wy = best[1] * TILE + TILE / 2 - p.y, d = Math.hypot(wx, wy) || 1;
  return [wx / d, wy / d, true];
}

function updateBot(p, dt) {
  const b = p.bot, D = b.diff, inp = { mx: 0, my: 0, ax: 0, ay: 0, throw: false, dash: false };
  b.think -= dt; b.fieldAge += dt; b.strafeT -= dt;
  if (b.strafeT <= 0) { b.strafe = Math.random() < 0.5 ? 1 : -1; b.strafeT = rand(0.8, 2); }
  const enemies = game.players.filter(q => q !== p && q.alive && !q.falling);
  if (!enemies.length || game.phase === 'between') { p.input = inp; return; }
  let tgt = enemies[0], td = Infinity;
  for (const q of enemies) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < td) { td = d; tgt = q; } }

  if (b.think <= 0) { // look for incoming boomerangs (reaction-delayed)
    b.danger = null;
    for (const r of game.rangs) {
      if (r.owner === p || r.state === 'dropped') continue;
      const rx = p.x - r.x, ry = p.y - r.y, vv = r.vx * r.vx + r.vy * r.vy; if (vv < 1) continue;
      const t = clamp((rx * r.vx + ry * r.vy) / vv, 0, 0.45);
      const cx = r.x + r.vx * t - p.x, cy = r.y + r.vy * t - p.y;
      if (cx * cx + cy * cy < 38 * 38 && Math.random() < D.dodge) {
        const sp = Math.sqrt(vv); let px = -r.vy / sp, py = r.vx / sp;
        if (px * -cx + py * -cy < 0) { px = -px; py = -py; }
        b.danger = { px, py, t: 0.35 };
      }
    }
  }
  if (b.danger) {
    inp.mx = b.danger.px; inp.my = b.danger.py; b.danger.t -= dt;
    if (p.dashCd <= 0 && Math.random() < D.dodge) inp.dash = true;
    if (b.danger.t <= 0) b.danger = null;
  } else {
    let goal = null;
    const nearPow = game.pickups.reduce((best, k) => { const d = Math.hypot(k.x - p.x, k.y - p.y); return d < 220 && (!best || d < best.d) ? { k, d } : best; }, null);
    if (!p.hasRang) {
      const dropped = game.rangs.filter(r => r.state === 'dropped').sort((a, c) => dist2(a.x, a.y, p.x, p.y) - dist2(c.x, c.y, p.x, p.y))[0];
      const mine = game.rangs.find(r => r.owner === p && r.main && r.state !== 'dropped');
      if (dropped && (!mine || dist2(dropped.x, dropped.y, p.x, p.y) < 200 * 200)) goal = dropped;
      else if (nearPow) goal = nearPow.k;
      else {
        const d = td || 1;
        inp.mx = (p.x - tgt.x) / d * 0.6 - (tgt.y - p.y) / d * 0.5 * b.strafe;
        inp.my = (p.y - tgt.y) / d * 0.6 + (tgt.x - p.x) / d * 0.5 * b.strafe;
        if (mine) { const md = Math.hypot(mine.x - p.x, mine.y - p.y) || 1; inp.mx += (mine.x - p.x) / md * 0.4; inp.my += (mine.y - p.y) / md * 0.4; }
      }
    } else {
      const los = p.power === 'ghost' || lineClear(p.x, p.y, tgt.x, tgt.y);
      if (nearPow && nearPow.d < 120) goal = nearPow.k;
      else if (!los || td > 380) goal = tgt;
      else {
        const d = td || 1, ox = (tgt.x - p.x) / d, oy = (tgt.y - p.y) / d;
        const want = td > 240 ? 0.6 : td < 120 ? -0.6 : 0;
        inp.mx = ox * want - oy * b.strafe * 0.8; inp.my = oy * want + ox * b.strafe * 0.8;
      }
      if (b.mode === 'idle' && b.think <= 0 && p.slashCd <= 0) {
        if (td < 58 && Math.random() < D.aggro) { b.mode = 'tap'; b.tap = 1; }
        else if (los && td < 560 && Math.random() < D.aggro * 0.9) {
          b.mode = 'charge'; b.aimErr = rand(-D.err, D.err);
          b.chargeGoal = 0.16 + clamp((td - 140) / 340, 0.05, 1) * 0.55 + rand(0, 0.08);
        } else if (!los && b.noPathT > 0.6) { b.mode = 'charge'; b.aimErr = 0; b.chargeGoal = 0.3; b.noPathT = 0; }
      }
    }
    if (goal) {
      const [dx, dy, ok] = pathDir(p, b, goal.x, goal.y);
      inp.mx = dx; inp.my = dy;
      b.noPathT = ok ? 0 : b.noPathT + dt;
    }
  }
  if (tileAt(p.x + inp.mx * 22, p.y + inp.my * 22) === PIT && p.dashT <= 0) { inp.mx = -inp.mx * 0.3; inp.my = -inp.my * 0.3; }
  if (inp.dash && (tileAt(p.x + inp.mx * 110, p.y + inp.my * 110) === PIT || tileAt(p.x + inp.mx * 60, p.y + inp.my * 60) === PIT)) inp.dash = false;

  if (b.mode === 'tap') {
    inp.ax = tgt.x - p.x; inp.ay = tgt.y - p.y;
    if (b.tap === 1) { inp.throw = true; b.tap = 2; } else { inp.throw = false; b.mode = 'idle'; b.think = D.react; }
  } else if (b.mode === 'charge') {
    if (!p.hasRang) b.mode = 'idle';
    else {
      const lead = td / 650, ex = tgt.x + tgt.vx * lead, ey = tgt.y + tgt.vy * lead;
      const a = Math.atan2(ey - p.y, ex - p.x) + b.aimErr;
      inp.ax = Math.cos(a); inp.ay = Math.sin(a);
      if (p.charge < b.chargeGoal || !p.charging) inp.throw = true;
      else { inp.throw = false; b.mode = 'idle'; b.think = D.react + rand(0, 0.3); }
    }
  }
  if (b.think <= 0) b.think = D.react;
  p.input = inp;
}

// ---------------------------------------------------------------- network encoding
// Compact snapshot: integers only, so JSON stays tiny (~200-400 bytes for a full 4-player scene).
const PFLAG = { alive: 1, rang: 2, charging: 4, shield: 8, dash: 16, inv: 32 };
function encodeSnapshot(g) {
  const P = g.players.map(p => [
    p.i, Math.round(p.x), Math.round(p.y), Math.round(p.face * 100),
    (p.alive ? 1 : 0) | (p.hasRang ? 2 : 0) | (p.charging ? 4 : 0) | (p.shield ? 8 : 0) | (p.dashT > 0 ? 16 : 0) | (p.inv > 0 ? 32 : 0),
    p.charging ? Math.round(p.charge * 100) : 0, p.power ? POWER_KEYS.indexOf(p.power) + 1 : 0,
    Math.round(p.vx), Math.round(p.vy), Math.round(p.falling * 100),
  ]);
  const R = g.rangs.map(r => [r.id, Math.round(r.x), Math.round(r.y), r.owner.i,
    (r.state === 'out' ? 0 : r.state === 'return' ? 1 : 2) | (r.fire ? 4 : 0) | (r.ghost ? 8 : 0) | (r.zap ? 16 : 0)]);
  const K = g.pickups.map(k => [k.id, k.x, k.y, POWER_KEYS.indexOf(k.type)]);
  return { P, R, K, ph: g.phase };
}
// Prediction state the owning client needs to replay its own inputs.
function encodeSelf(p) {
  return [Math.round(p.vx * 10), Math.round(p.vy * 10), Math.round(p.dashT * 1000), Math.round(p.dashCd * 1000), p.prevDash ? 1 : 0, Math.round(p.dashDir * 1000), Math.round(p.x * 10), Math.round(p.y * 10)];
}
// Inputs: [seq, mx, my, ax, ay, bits] with axes in -100..100
function encodeInput(seq, inp) {
  return [seq, Math.round(inp.mx * 100), Math.round(inp.my * 100), Math.round(inp.ax * 100), Math.round(inp.ay * 100), (inp.throw ? 1 : 0) | (inp.dash ? 2 : 0)];
}
function decodeInput(a) {
  const n = (v) => clamp((+v || 0) / 100, -1, 1);
  return { seq: a[0] | 0, mx: n(a[1]), my: n(a[2]), ax: n(a[3]), ay: n(a[4]), throw: !!(a[5] & 1), dash: !!(a[5] & 2) };
}

const Sim = {
  TILE, COLS, ROWS, WW, WH, FLOOR, WALL, CRATE, PIT, TREE, PLAYER_R, PCOLORS, CHARS, POWERS, POWER_KEYS, BOT_DIFF, MAPS, PFLAG,
  clamp, lerp, rand, dist2, angDiff, NO_INPUT,
  create, use, buildMap, gridFromString, gridToString, newMatch, step, movePlayer, makeBot, tileAt,
  encodeSnapshot, encodeSelf, encodeInput, decodeInput,
};
if (typeof module !== 'undefined' && module.exports) module.exports = Sim; else root.Sim = Sim;
})(typeof self !== 'undefined' ? self : this);
