/* Boomerang Bites — shared simulation.
   Runs in the browser (offline / local play) and in Node (server-authoritative online play).
   No DOM, no audio: anything visual or audible is pushed to game.events for the client to present.
   See docs/mechanics.md for the rules this implements. */
(function (root) {
'use strict';

const TILE = 48, COLS = 20, ROWS = 12, WW = COLS * TILE, WH = ROWS * TILE;
const FLOOR = 0, WALL = 1, CRATE = 2, PIT = 3, TREE = 4, GRASS = 5, ICE = 6, PAD = 7;
const TEAM_COLORS = ['#ff5d73', '#43a8ff'], TEAM_NAMES = ['Red', 'Blue'];
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
  boom:     { sprite: 'boom',     name: 'Explosive!' },
  fire:     { sprite: 'fire',     name: 'Fire Trail!' },
  ice:      { sprite: 'ice',      name: 'Ice Trail!' },
  multi:    { sprite: 'multi',    name: 'Triple Throw!' },
  tele:     { sprite: 'crystal',  name: 'Telekinesis!' },
  teleport: { sprite: 'sparkles', name: 'Teleport!' },
  drill:    { sprite: 'drill',    name: 'Drill Rang!' },
  feet:     { sprite: 'shoe',     name: 'Speedy Feet!' },
  shield:   { sprite: 'shield',   name: 'Shield!' },
  disguise: { sprite: 'mask',     name: 'Disguise!' },
  decoy:    { sprite: 'decoy',    name: 'Decoy!' },
  bamboo:   { sprite: 'dizzy',    name: 'Bamboozled!' }, // bad pickup: flips your controls for a few seconds
};
const POWER_KEYS = Object.keys(POWERS);
const MAX_POWERS = 3;
const BOT_DIFF = {
  cpu1: { react: 0.5, err: 0.32, dodge: 0.25, aggro: 0.5 },
  cpu2: { react: 0.28, err: 0.16, dodge: 0.6, aggro: 0.8 },
  cpu3: { react: 0.13, err: 0.06, dodge: 0.92, aggro: 1 },
};
// Tuning
const T = {
  run: 200, chargeSlow: 0.55, dashSpeed: 640, dashTime: 0.17, dashCd: 0.8,
  minRange: 170, maxRange: 510, minSpeed: 560, maxSpeed: 780, fullCharge: 0.6,
  returnSpeed: 620, maxBounces: 3, minSpeed2: 150, maxFlight: 4, maxReturn: 2.6,
  recallMax: 720, recallAccel: 1300, teleRadius: 380, teleSpeed: 520,
  slashCd: 0.4, slashReach: 58, slashArc: 1.3, lunge: 260, shove: 520, rangR: 13,
  trailLife: 2.2, trailGap: 24, freeze: 1.3, explodeR: 78,
  curve: 2.6, holdToCall: 0.2, iceGrip: 2.2, bamboo: 5, disguiseAfter: 1.2, decoyLife: 5, padCd: 0.8, revealDist: 80,
};
// Quadrant maps (10x6), mirrored both ways into a fair 20x12 arena.
// # wall  t tree  c box  o hot-sauce pit  S spawn  . floor
const MAPS = [
  { name: 'Picnic', q: ['##########', '#S........', '#..##..c..', '#..#...c..', '#....c....', '#.c...o...'] },
  { name: 'Kitchen', q: ['##########', '#S...c....', '#.##...##.', '#.#..c....', '#...##..cc', '#.c..#....'] },
  { name: 'Sauce Pit', q: ['##########', '#S..c.....', '#..ooo..#.', '#..o....#.', '#..o..c...', '#.c....ooo'] },
  { name: 'Garden', q: ['##########', '#S...t....', '#.c.....c.', '#..t.cc.t.', '#.....t...', '#.tc......'] },
  { name: 'Open Plate', q: ['##########', '#S........', '#.........', '#...c..#..', '#.........', '#......c..'] },
  // g tall grass (hide)  i slippery ice  p teleporter pad (warps to the opposite pad)
  { name: 'Salad Bar', q: ['##########', '#S..ggg...', '#.c.ggg.#.', '#...c...#.', '#gg....gg.', '#gg..c.gg.'] },
  { name: 'Freezer', q: ['##########', '#S..iiii..', '#.##iiii#.', '#..iiiiii.', '#.ciiiii..', '#..iiii.c.'] },
  { name: 'Portal Pantry', q: ['##########', '#S...#....', '#.p..#..c.', '#....#....', '#.c.....##', '#.....c...'] },
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
const angDiff = (a, b) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
const NO_INPUT = { mx: 0, my: 0, ax: 0, ay: 0, throw: false, dash: false, slash: false };
const has = (p, k) => k === 'shield' ? p.shield : p.powers.indexOf(k) >= 0;
const walkable = (v) => v === FLOOR || v === GRASS || v === ICE || v === PAD;
const teamOf = (p) => (game && game.opts.mode === 'teams' ? p.i % 2 : p.i);
const sameTeam = (a, b) => a && b && a !== b && game.opts.mode === 'teams' && teamOf(a) === teamOf(b);

let game = null;
const emit = (type, d) => { game.events.push([type, d === undefined ? 0 : d]); };
const R0 = (v) => Math.round(v);

function create() {
  return {
    grid: [], spawns: [], mapIndex: 0, players: [], rangs: [], pickups: [], trails: [], events: [],
    round: 0, phase: 'intro', phaseT: 0, timeScale: 1, slowT: 0, powerTimer: 0, time: 0, decoys: [],
    points: 5, mapSetting: -1, nextId: 1, over: false, opts: { mode: 'ffa', pull: true, pw: 1 },
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
      else if (ch === 'g') v = GRASS; else if (ch === 'i') v = ICE; else if (ch === 'p') v = PAD;
      else if (ch === 'S') spawns.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, q: (x < 10 ? 0 : 1) + (y < 6 ? 0 : 2) });
      g[y].push(v);
    }
  }
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

// opts: { mode: 'ffa' | 'teams', pull: call-back on/off, pw: power-up frequency 0 | 0.5 | 1 | 2 }
function newMatch(g, specs, points, mapSetting, opts) {
  use(g);
  g.points = points; g.mapSetting = mapSetting; g.over = false;
  g.opts = Object.assign({ mode: 'ffa', pull: true, pw: 1 }, opts || {});
  if (g.opts.mode === 'teams' && new Set(specs.map(sp => sp.i % 2)).size < 2) g.opts.mode = 'ffa'; // need two teams
  g.players = specs.map(s => ({
    i: s.i, type: s.type, char: CHARS[s.char], charIndex: s.char, color: PCOLORS[s.i], score: 0,
    bot: s.type.startsWith('cpu') ? makeBot(s.type) : null, input: NO_INPUT, powers: [], shield: false,
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
  game.rangs = []; game.pickups = []; game.trails = []; game.decoys = [];
  game.players.forEach((p, n) => {
    const s = game.spawns[n];
    // Power-ups last the whole match (like the genre standard); positions and state reset each round.
    Object.assign(p, {
      x: s.x, y: s.y, vx: 0, vy: 0, kbx: 0, kby: 0, face: Math.atan2(WH / 2 - s.y, WW / 2 - s.x), aim: 0, aimStick: false,
      alive: true, hasRang: true, charging: false, charge: 0, slashT: 0, slashCd: 0, slashArmed: true,
      dashT: 0, dashCd: 0, dashDir: 0, falling: 0, walkT: 0, prevThrow: false, prevDash: false, prevSlash: false,
      inv: 0, frozen: 0, recalling: false, steering: false, holdT: 0, bamboo: 0, hidden: false, disguised: false, stillT: 0,
      decoyUsed: false, onPad: false, padCd: 0, team: teamOf(p),
    });
    p.aim = p.face;
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
    for (const p of g.players) { p.prevThrow = p.input.throw; p.prevDash = p.input.dash; p.prevSlash = p.input.slash; }
    if (g.phaseT <= 0) { g.phase = 'fight'; emit('go'); }
    return;
  }
  for (const p of g.players) if (p.bot && p.alive) updateBot(p, sdt);
  for (const p of g.players) updatePlayer(p, sdt);
  separatePlayers();
  for (const r of g.rangs.slice()) updateRang(r, sdt);
  rangClashes();
  updateTrails(sdt);
  updateDecoys(sdt);
  updatePickups(sdt);

  if (g.phase === 'fight') {
    const teams = new Set(g.players.filter(p => p.alive).map(teamOf));
    const total = new Set(g.players.map(teamOf)).size;
    if (teams.size <= (total > 1 ? 1 : 0)) { g.phase = 'end'; g.phaseT = 1.6; }
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
  if (alive.length && new Set(alive.map(teamOf)).size === 1) {
    const w = alive[0], team = game.opts.mode === 'teams';
    // in teams, every member of the surviving team scores (dead teammates included)
    for (const p of game.players) if (team ? teamOf(p) === teamOf(w) : p === w) p.score++;
    const ev = { w: w.i, scores: scores(), team: team ? teamOf(w) : -1 };
    if (w.score >= game.points) { game.over = true; game.phase = 'over'; emit('result', ev); return; }
    emit('score', ev);
  } else emit('draw', { scores: scores() });
  game.phase = 'between'; game.phaseT = 1.2;
}

// Movement + aiming only. Shared with client-side prediction, so it only touches the player itself.
function movePlayer(p, inp, dt, quiet) {
  p.dashCd = Math.max(0, p.dashCd - dt);
  const frozen = p.frozen > 0;
  let mx = frozen || p.steeringNoMove ? 0 : inp.mx, my = frozen || p.steeringNoMove ? 0 : inp.my;
  if (p.bamboo > 0) { mx = -mx; my = -my; } // Bamboozled: controls flipped
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  const stick = Math.hypot(inp.ax, inp.ay) > 0.3;

  // Aim: an aim stick (touch drag / right stick) wins and is remembered after release;
  // otherwise aim follows the way you're running.
  if (stick) { p.aim = Math.atan2(inp.ay, inp.ax); if (p.charging) p.aimStick = true; }
  else if (ml > 0.25 && !(p.charging && p.aimStick)) p.aim = Math.atan2(my, mx);
  if (!frozen) p.face = p.aim;

  if (inp.dash && !p.prevDash && p.dashCd <= 0 && !frozen && !p.teleportNow) {
    p.dashT = T.dashTime; p.dashCd = T.dashCd; p.dashDir = ml > 0.25 ? Math.atan2(my, mx) : p.face;
    if (!quiet) emit('dash', { x: R0(p.x), y: R0(p.y) });
  }
  p.prevDash = inp.dash;
  const speed = T.run * (has(p, 'feet') ? 1.35 : 1) * (p.charging ? T.chargeSlow : 1);
  if (p.dashT > 0) {
    p.dashT -= dt; p.vx = Math.cos(p.dashDir) * T.dashSpeed; p.vy = Math.sin(p.dashDir) * T.dashSpeed;
  } else {
    const a = Math.min(1, dt * (tileAt(p.x, p.y) === ICE ? T.iceGrip : 14)); // ice: barely any grip
    p.vx = lerp(p.vx, mx * speed, a); p.vy = lerp(p.vy, my * speed, a);
  }
  // knockback (from shoves and lunges) decays quickly
  const kd = Math.exp(-dt * 9); p.kbx *= kd; p.kby *= kd;
  if (Math.abs(p.kbx) < 1) p.kbx = 0; if (Math.abs(p.kby) < 1) p.kby = 0;
  moveCircle(p, (p.vx + p.kbx) * dt, (p.vy + p.kby) * dt, PLAYER_R);
  if (Math.hypot(p.vx, p.vy) > 30) p.walkT += dt * 12;
}

function mainRang(p) { return game.rangs.find(r => r.owner === p && r.main); }

function updatePlayer(p, dt) {
  if (!p.alive) return;
  if (p.falling > 0) { p.falling -= dt; if (p.falling <= 0) kill(p, null, true); return; }
  const inp = game.phase === 'between' ? NO_INPUT : p.input;
  p.slashT = Math.max(0, p.slashT - dt); p.slashCd = Math.max(0, p.slashCd - dt);
  p.inv = Math.max(0, p.inv - dt); p.frozen = Math.max(0, p.frozen - dt); p.bamboo = Math.max(0, p.bamboo - dt);
  p.padCd = Math.max(0, p.padCd - dt);
  const frozen = p.frozen > 0;
  const stick = Math.hypot(inp.ax, inp.ay) > 0.3;

  // Teleport power: dash while your boomerang is out -> warp to it
  const mine = !p.hasRang ? mainRang(p) : null;
  p.teleportNow = false;
  if (inp.dash && !p.prevDash && !frozen && mine && has(p, 'teleport') && p.dashCd <= 0 && !solidAt(mine.x, mine.y)) {
    emit('teleport', { x: R0(p.x), y: R0(p.y), x2: R0(mine.x), y2: R0(mine.y) });
    p.disguised = false;
    p.x = mine.x; p.y = mine.y; p.dashCd = T.dashCd; p.teleportNow = true;
    catchRang(p, mine);
  }
  // Decoy: your first dash each round leaves a fake copy running the other way
  if (inp.dash && !p.prevDash && !frozen && has(p, 'decoy') && !p.decoyUsed && p.dashCd <= 0 && !p.teleportNow) {
    p.decoyUsed = true;
    const a = Math.hypot(inp.mx, inp.my) > 0.25 ? Math.atan2(inp.my, inp.mx) + Math.PI : p.face + Math.PI;
    game.decoys.push({ id: game.nextId++, owner: p, x: p.x, y: p.y, vx: Math.cos(a) * T.run, vy: Math.sin(a) * T.run, face: a, t: 0, turnT: rand(0.5, 1.2) });
    emit('decoy', { x: R0(p.x), y: R0(p.y) });
  }
  // Holding throw while unarmed = call it back (after a short hold, so a quick drag can curve it instead),
  // or steer it with telekinesis
  const holding = inp.throw && !p.hasRang && !frozen;
  p.holdT = holding ? p.holdT + dt : 0;
  const canCall = game.opts.pull && p.holdT > T.holdToCall;
  p.steering = holding && has(p, 'tele') && mine && mine.state !== 'dropped';
  p.recalling = canCall && !p.steering && !(stick && mine && mine.state === 'out');
  p.steeringNoMove = p.steering && Math.hypot(inp.ax, inp.ay) < 0.3; // no aim stick: movement keys steer instead

  movePlayer(p, inp, dt);
  const here = tileAt(p.x, p.y);
  if (p.dashT <= 0 && here === PIT) { p.falling = 0.45; p.vx = p.vy = 0; p.charging = false; emit('sfx', 'fall'); return; }
  // Teleporter pads warp you to the opposite pad
  if (here === PAD && !p.onPad && p.padCd <= 0) {
    const tx = COLS - 1 - Math.floor(p.x / TILE), ty = ROWS - 1 - Math.floor(p.y / TILE);
    if (game.grid[ty] && game.grid[ty][tx] === PAD) {
      emit('pad', { x: R0(p.x), y: R0(p.y), x2: tx * TILE + TILE / 2, y2: ty * TILE + TILE / 2 });
      p.x = tx * TILE + TILE / 2; p.y = ty * TILE + TILE / 2; p.padCd = T.padCd;
    }
  }
  p.onPad = tileAt(p.x, p.y) === PAD;
  p.hidden = tileAt(p.x, p.y) === GRASS;
  // Disguise: stand still for a moment to turn into a box; any action breaks it
  const acting = Math.hypot(inp.mx, inp.my) > 0.2 || inp.throw || inp.slash || inp.dash || p.dashT > 0;
  p.stillT = acting ? 0 : p.stillT + dt;
  if (acting) p.disguised = false;
  else if (has(p, 'disguise') && p.stillT > T.disguiseAfter && !p.disguised) { p.disguised = true; emit('disguise', { x: R0(p.x), y: R0(p.y) }); }

  // Throw: hold to charge, release to throw at the locked aim
  if (!frozen && inp.throw && !p.prevThrow && p.hasRang) {
    p.charging = true; p.charge = 0; p.aimStick = Math.hypot(inp.ax, inp.ay) > 0.3;
    if (p.aimStick) p.aim = Math.atan2(inp.ay, inp.ax);
  }
  if (p.charging) {
    if (!p.hasRang || frozen) p.charging = false;
    else if (inp.throw) p.charge += dt;
    else { p.charging = false; throwRang(p, clamp(p.charge / T.fullCharge, 0, 1)); }
  }
  // Slash: its own button
  if (inp.slash && !p.prevSlash && p.slashCd <= 0 && !frozen) slash(p);

  p.prevThrow = inp.throw; p.prevSlash = inp.slash;

  for (const k of game.pickups.slice()) {
    if (dist2(p.x, p.y, k.x, k.y) < (PLAYER_R + 16) ** 2) {
      game.pickups.splice(game.pickups.indexOf(k), 1);
      if (k.type === 'shield') p.shield = true;
      else if (k.type === 'bamboo') p.bamboo = T.bamboo;
      else {
        p.powers = p.powers.filter(x => x !== k.type); p.powers.push(k.type);
        if (p.powers.length > MAX_POWERS) p.powers.shift(); // oldest drops off
      }
      emit('pickup', { x: R0(p.x), y: R0(p.y), k: k.type });
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

// Slash: deadly with a boomerang in hand, a knockback shove without one. Always parries.
function slash(p) {
  const armed = p.hasRang;
  p.slashT = 0.2; p.slashCd = T.slashCd; p.slashArmed = armed;
  p.kbx += Math.cos(p.face) * T.lunge; p.kby += Math.sin(p.face) * T.lunge;
  p.charging = false;
  emit('slash', { i: p.i, a: armed ? 1 : 0 });
  const reach = T.slashReach;
  for (const q of game.players) {
    if (q === p || !q.alive || q.falling) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d < reach && (d < 24 || Math.abs(angDiff(Math.atan2(q.y - p.y, q.x - p.x), p.face)) < T.slashArc)) {
      if (armed && !sameTeam(p, q)) kill(q, p);
      else {
        const a = Math.atan2(q.y - p.y, q.x - p.x);
        q.kbx += Math.cos(a) * T.shove; q.kby += Math.sin(a) * T.shove; q.charging = false;
        emit('shove', { x: R0(q.x), y: R0(q.y) });
      }
    }
  }
  for (const d of game.decoys.slice()) if (d.owner !== p && Math.hypot(d.x - p.x, d.y - p.y) < reach) popDecoy(d);
  for (const r of game.rangs) { // parry
    if (r.owner === p || r.state === 'dropped') continue;
    const d = Math.hypot(r.x - p.x, r.y - p.y);
    if (d < reach + 12 && (d < 26 || Math.abs(angDiff(Math.atan2(r.y - p.y, r.x - p.x), p.face)) < 1.6)) {
      const sp = Math.max(560, Math.hypot(r.vx, r.vy));
      r.vx = Math.cos(p.face) * sp; r.vy = Math.sin(p.face) * sp; r.speed = sp;
      r.state = 'out'; r.traveled = 0; r.maxDist = 320; r.bounces = 0; r.t = 0;
      r.immune = p; r.immuneT = 0.5; r.parried = true;
      emit('spark', { x: R0(r.x), y: R0(r.y), s: 1 });
    }
  }
  const fx = p.x + Math.cos(p.face) * 38, fy = p.y + Math.sin(p.face) * 38;
  if (tileAt(fx, fy) === CRATE) breakCrate(Math.floor(fx / TILE), Math.floor(fy / TILE));
}

function newRang(o) {
  return Object.assign({ id: game.nextId++, spin: 0, t: 0, immune: null, immuneT: 0, bounces: 0, stateT: 0, trailD: 0, parried: false, exploded: false }, o);
}

function throwRang(p, power) {
  const maxDist = T.minRange + (T.maxRange - T.minRange) * power;
  const speed = T.minSpeed + (T.maxSpeed - T.minSpeed) * power;
  const angles = has(p, 'multi') ? [0, -0.3, 0.3] : [0];
  angles.forEach((da, n) => {
    const a = p.aim + da;
    game.rangs.push(newRang({
      owner: p, x: p.x + Math.cos(a) * 14, y: p.y + Math.sin(a) * 14, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      speed, state: 'out', traveled: 0, maxDist, main: n === 0,
      drill: has(p, 'drill'), boom: has(p, 'boom'), fire: has(p, 'fire'), ice: has(p, 'ice'),
    }));
  });
  p.face = p.aim; p.hasRang = false; emit('sfx', 'throw');
}

function catchRang(p, r) {
  const i = game.rangs.indexOf(r); if (i >= 0) game.rangs.splice(i, 1);
  if (r.main) { p.hasRang = true; emit('sfx', 'catch'); }
}
function dropRang(r) {
  if (!r.main) { const i = game.rangs.indexOf(r); if (i >= 0) game.rangs.splice(i, 1); return; }
  r.state = 'dropped'; r.vx = r.vy = 0; r.stateT = 0;
  emit('drop', { x: R0(r.x), y: R0(r.y) });
}
function setState(r, s) { if (r.state !== s) { r.state = s; r.stateT = 0; } }

// Move a flying boomerang one step, bouncing off solid tiles. Returns true if it bounced.
function flyStep(r, dt) {
  const nx = r.x + r.vx * dt, ny = r.y + r.vy * dt;
  if (r.drill) { // drills straight through everything, breaking boxes
    if (tileAt(nx, ny) === CRATE) breakCrate(Math.floor(nx / TILE), Math.floor(ny / TILE));
    r.x = clamp(nx, 4, WW - 4); r.y = clamp(ny, 4, WH - 4); return false;
  }
  if (!solidAt(nx, ny)) { r.x = clamp(nx, 4, WW - 4); r.y = clamp(ny, 4, WH - 4); return false; }
  const tx = Math.floor(nx / TILE), ty = Math.floor(ny / TILE);
  if (game.grid[ty] && game.grid[ty][tx] === CRATE) breakCrate(tx, ty);
  if (r.boom) explode(r, nx, ny);
  const hx = solidAt(nx, r.y), hy = solidAt(r.x, ny);
  if (hx) r.vx = -r.vx;
  if (hy) r.vy = -r.vy;
  if (!hx && !hy) { r.vx = -r.vx; r.vy = -r.vy; } // corner
  r.vx *= 0.7; r.vy *= 0.7; r.speed *= 0.7; r.bounces++;
  emit('spark', { x: R0(r.x), y: R0(r.y), s: 1 });
  return true;
}

function updateRang(r, dt) {
  r.t += dt; r.stateT += dt;
  if (r.immuneT > 0) { r.immuneT -= dt; if (r.immuneT <= 0) r.immune = null; }
  const o = r.owner;

  if (r.state === 'dropped') {
    if (o.alive && !o.falling) {
      if (o.recalling && r.main) { setState(r, 'recall'); r.speed = 120; emit('sfx', 'recall'); }
      else if (!o.hasRang && dist2(o.x, o.y, r.x, r.y) < (PLAYER_R + 14) ** 2) { catchRang(o, r); return; }
    }
    if (r.state === 'dropped') return;
  }
  if (!o.alive || o.falling) { if (r.state !== 'dropped') dropRang(r); return; }

  // Owner holding throw: summon (or steer with telekinesis)
  if (r.main && o.recalling && r.state !== 'recall') { setState(r, 'recall'); r.speed = Math.max(200, Math.hypot(r.vx, r.vy) * 0.5); emit('sfx', 'recall'); }
  if (r.state === 'recall' && !o.recalling) { setState(r, 'return'); r.bounces = 0; }
  if (r.main && o.steering) setState(r, 'tele');
  else if (r.state === 'tele') { setState(r, 'return'); r.bounces = 0; }

  if (r.state === 'out') {
    const f = 1 - 0.55 * (r.traveled / r.maxDist) ** 2;
    const sp = Math.hypot(r.vx, r.vy) || 1, want = r.speed * f;
    let ang = Math.atan2(r.vy, r.vx);
    // Curve: push the aim stick after throwing to bend it around corners
    const ci = o.input;
    if (!o.bot && !r.parried && Math.hypot(ci.ax, ci.ay) > 0.3) {
      const d = angDiff(Math.atan2(ci.ay, ci.ax), ang), maxTurn = T.curve * dt;
      ang += clamp(d, -maxTurn, maxTurn);
    }
    r.vx = Math.cos(ang) * want; r.vy = Math.sin(ang) * want;
    flyStep(r, dt);
    r.traveled += want * dt;
    if (r.traveled >= r.maxDist) { setState(r, 'return'); if (r.boom) explode(r, r.x, r.y); }
  } else if (r.state === 'return') {
    const dx = o.x - r.x, dy = o.y - r.y, d = Math.hypot(dx, dy) || 1;
    r.speed = Math.min(r.speed + 900 * dt, T.returnSpeed);
    const k = Math.min(1, dt * (d < 70 ? 16 : 5));
    r.vx = lerp(r.vx, dx / d * r.speed, k); r.vy = lerp(r.vy, dy / d * r.speed, k);
    if (r.parried) r.parried = false;
    // still inside a wall (e.g. a recall was let go over one)? drift out before colliding again
    if (solidAt(r.x, r.y) && !r.drill) { r.x += r.vx * dt; r.y += r.vy * dt; }
    else flyStep(r, dt);
    if (d < PLAYER_R + 12 && (!o.hasRang || !r.main)) { catchRang(o, r); return; }
    if (r.stateT > T.maxReturn && !r.drill) { dropRang(r); return; }
  } else if (r.state === 'recall') {
    // Summon: straight to the owner, over walls, accelerating. Deadly on the way.
    const dx = o.x - r.x, dy = o.y - r.y, d = Math.hypot(dx, dy) || 1;
    r.speed = Math.min(r.speed + T.recallAccel * dt, T.recallMax);
    r.vx = dx / d * r.speed; r.vy = dy / d * r.speed;
    r.x += r.vx * dt; r.y += r.vy * dt;
    if (d < PLAYER_R + 14) { catchRang(o, r); return; }
  } else if (r.state === 'tele') {
    // Telekinesis: steer with the aim stick (or movement if none), within a radius of the owner.
    const inp = o.input; let sx = inp.ax, sy = inp.ay;
    if (Math.hypot(sx, sy) < 0.3) { sx = inp.mx; sy = inp.my; }
    const sl = Math.hypot(sx, sy);
    const tvx = sl > 0.2 ? sx / sl * T.teleSpeed : 0, tvy = sl > 0.2 ? sy / sl * T.teleSpeed : 0;
    r.vx = lerp(r.vx, tvx, Math.min(1, dt * 6)); r.vy = lerp(r.vy, tvy, Math.min(1, dt * 6));
    const ox = r.x - o.x, oy = r.y - o.y, od = Math.hypot(ox, oy);
    if (od > T.teleRadius) { r.vx -= ox / od * 900 * dt; r.vy -= oy / od * 900 * dt; }
    r.speed = Math.hypot(r.vx, r.vy);
    flyStep(r, dt); r.bounces = 0;
  }
  if (!game.rangs.includes(r)) return;

  // Stuck: too many bounces, too slow, or out too long -> it drops to the floor
  if ((r.state === 'out' || r.state === 'return') && !r.drill &&
      (r.bounces >= T.maxBounces || (r.speed < T.minSpeed2 && r.stateT > 0.2) || r.t > T.maxFlight)) { dropRang(r); return; }

  // Trails
  if ((r.fire || r.ice) && r.state !== 'dropped') {
    r.trailD += Math.hypot(r.vx, r.vy) * dt;
    if (r.trailD > T.trailGap) {
      r.trailD = 0;
      if (walkable(tileAt(r.x, r.y))) game.trails.push({ id: game.nextId++, x: r.x, y: r.y, t: 0, k: r.fire ? 'fire' : 'ice', owner: o });
      if (game.trails.length > 180) game.trails.shift();
    }
  }
  // Hits — on the way out, on the way back, and while being summoned
  for (const q of game.players) {
    if (q === r.immune || !q.alive || q.falling) continue;
    if (q === o && !r.parried) continue;
    if (sameTeam(o, q)) continue; // no friendly fire
    if (dist2(q.x, q.y, r.x, r.y) < (PLAYER_R + T.rangR) ** 2) {
      if (r.boom && !r.exploded) explode(r, r.x, r.y);
      else kill(q, o, false, r);
    }
  }
  for (const d of game.decoys.slice()) if (d.owner !== o && dist2(d.x, d.y, r.x, r.y) < (PLAYER_R + T.rangR) ** 2) popDecoy(d);
}

function popDecoy(d) {
  const i = game.decoys.indexOf(d); if (i < 0) return;
  game.decoys.splice(i, 1); emit('poof', { x: R0(d.x), y: R0(d.y) });
}
function updateDecoys(dt) {
  for (const d of game.decoys.slice()) {
    d.t += dt; d.turnT -= dt;
    if (d.turnT <= 0) { const a = d.face + rand(-1.2, 1.2); d.face = a; d.vx = Math.cos(a) * T.run; d.vy = Math.sin(a) * T.run; d.turnT = rand(0.5, 1.2); }
    const ox = d.x, oy = d.y;
    moveCircle(d, d.vx * dt, d.vy * dt, PLAYER_R);
    if (Math.hypot(d.x - ox, d.y - oy) < T.run * dt * 0.3) d.turnT = 0; // bumped a wall
    if (tileAt(d.x + d.vx * 0.15, d.y + d.vy * 0.15) === PIT) d.turnT = 0;
    if (d.t > T.decoyLife || !d.owner.alive) popDecoy(d);
  }
}

function rangClashes() {
  const rs = game.rangs.filter(r => r.state === 'out' || r.state === 'return' || r.state === 'tele');
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j];
    if (a.owner === b.owner) continue;
    if (dist2(a.x, a.y, b.x, b.y) < 22 * 22) {
      for (const r of [a, b]) { setState(r, 'return'); r.speed = 260; r.vx = -r.vx * 0.4; r.vy = -r.vy * 0.4; r.bounces++; }
      emit('spark', { x: R0((a.x + b.x) / 2), y: R0((a.y + b.y) / 2), s: 1 });
    }
  }
}

function updateTrails(dt) {
  for (const t of game.trails) t.t += dt;
  game.trails = game.trails.filter(t => t.t < T.trailLife);
  for (const t of game.trails) {
    for (const q of game.players) {
      if (q === t.owner || sameTeam(t.owner, q) || !q.alive || q.falling) continue;
      if (dist2(q.x, q.y, t.x, t.y) < (PLAYER_R + 10) ** 2) {
        if (t.k === 'fire') kill(q, t.owner);
        else if (q.frozen <= 0 && q.inv <= 0) { q.frozen = T.freeze; q.charging = false; emit('freeze', { i: q.i, x: R0(q.x), y: R0(q.y) }); }
      }
    }
  }
}

function explode(r, x, y) {
  if (r.exploded) return; r.exploded = true;
  const R = T.explodeR;
  emit('boom', { x: R0(x), y: R0(y), R });
  for (const q of game.players) if (q !== r.owner && !sameTeam(r.owner, q) && q.alive && dist2(q.x, q.y, x, y) < (R + PLAYER_R) ** 2) kill(q, r.owner);
  for (const d of game.decoys.slice()) if (dist2(d.x, d.y, x, y) < (R + PLAYER_R) ** 2) popDecoy(d);
  for (let ty = 0; ty < ROWS; ty++) for (let tx = 0; tx < COLS; tx++)
    if (game.grid[ty][tx] === CRATE && dist2(tx * TILE + TILE / 2, ty * TILE + TILE / 2, x, y) < (R + 20) ** 2) breakCrate(tx, ty);
}

function breakCrate(tx, ty) {
  if (game.grid[ty][tx] !== CRATE) return;
  game.grid[ty][tx] = FLOOR;
  emit('crate', { tx, ty });
  if (Math.random() < 0.4 * powerRate()) game.pickups.push({ id: game.nextId++, x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2, type: randomPower(), t: 0 });
}

// Power-ups get rarer as players collect them (20% per power held), scaled by the match option.
function powerRate() {
  const held = game.players.reduce((n, p) => n + p.powers.length, 0);
  return game.opts.pw * Math.pow(0.8, held);
}
function randomPower() {
  const anyPowers = game.players.some(p => p.powers.length);
  let k;
  do { k = POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)]; } while (k === 'bamboo' && !anyPowers); // never the first pickup
  return k;
}

function kill(q, by, fell, rang) {
  if (!q.alive) return;
  if (!fell && sameTeam(by, q)) return;
  if (!fell && q.inv > 0) return;
  if (!fell && q.shield) {
    q.shield = false; q.inv = 0.6;
    if (rang) { setState(rang, 'return'); rang.speed = 400; rang.parried = false; }
    emit('shield', { x: R0(q.x), y: R0(q.y) });
    return;
  }
  q.alive = false; q.charging = false;
  if (q.hasRang && !fell) game.rangs.push(newRang({ owner: q, x: q.x, y: q.y, vx: 0, vy: 0, speed: 0, state: 'dropped', traveled: 0, maxDist: 0, spin: rand(0, 6), main: true }));
  q.hasRang = false;
  emit('kill', { i: q.i, x: R0(q.x), y: R0(q.y), f: fell ? 1 : 0 });
  if (game.players.filter(p => p.alive).length <= 1) game.slowT = 0.7;
}

function updatePickups(dt) {
  for (const k of game.pickups) k.t += dt;
  if (game.phase !== 'fight') return;
  if (game.opts.pw <= 0) return;
  game.powerTimer -= dt;
  if (game.powerTimer > 0) return;
  game.powerTimer = rand(7, 11) / powerRate();
  if (game.pickups.length >= 2) return;
  for (let tries = 0; tries < 40; tries++) {
    const tx = 1 + Math.floor(Math.random() * (COLS - 2)), ty = 1 + Math.floor(Math.random() * (ROWS - 2));
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    if (game.grid[ty][tx] !== FLOOR || game.players.some(p => p.alive && dist2(p.x, p.y, cx, cy) < 90 * 90)) continue;
    game.pickups.push({ id: game.nextId++, x: cx, y: cy, type: randomPower(), t: 0 });
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
      if (f[n] >= 0 || !walkable(game.grid[ny][nx])) continue;
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
    if (dx && dy && (!walkable(game.grid[cy][nx]) || !walkable(game.grid[ny][cx]))) continue;
    const v = f[nx + ny * COLS];
    if (v >= 0 && v < bv) { bv = v; best = [nx, ny]; }
  }
  if (!best) return direct(false);
  const wx = best[0] * TILE + TILE / 2 - p.x, wy = best[1] * TILE + TILE / 2 - p.y, d = Math.hypot(wx, wy) || 1;
  return [wx / d, wy / d, true];
}

function updateBot(p, dt) {
  const b = p.bot, D = b.diff, inp = { mx: 0, my: 0, ax: 0, ay: 0, throw: false, dash: false, slash: false };
  b.think -= dt; b.fieldAge += dt; b.strafeT -= dt;
  if (b.strafeT <= 0) { b.strafe = Math.random() < 0.5 ? 1 : -1; b.strafeT = rand(0.8, 2); }
  // Bots can't see snacks hiding in grass or disguised as boxes unless they're close
  const enemies = game.players.filter(q => q !== p && q.alive && !q.falling && !sameTeam(p, q) &&
    (!(q.hidden || q.disguised) || Math.hypot(q.x - p.x, q.y - p.y) < 90));
  if (!enemies.length || game.phase === 'between') { // nobody visible: wander toward the middle
    if (game.phase !== 'between' && !p.hasRang) { const m = mainRang(p); if (m && m.state === 'dropped') inp.throw = true; }
    else if (game.phase !== 'between') { const [dx, dy] = pathDir(p, b, WW / 2 + b.strafe * 120, WH / 2); inp.mx = dx * 0.6; inp.my = dy * 0.6; }
    p.input = inp; return;
  }
  let tgt = enemies[0], td = Infinity;
  for (const q of enemies) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < td) { td = d; tgt = q; } }

  if (b.think <= 0) { // incoming boomerangs (reaction-delayed)
    b.danger = null;
    for (const r of game.rangs) {
      if (r.owner === p || r.state === 'dropped' || sameTeam(r.owner, p)) continue;
      const rx = p.x - r.x, ry = p.y - r.y, vv = r.vx * r.vx + r.vy * r.vy; if (vv < 1) continue;
      const t = clamp((rx * r.vx + ry * r.vy) / vv, 0, 0.45);
      const cx = r.x + r.vx * t - p.x, cy = r.y + r.vy * t - p.y;
      if (cx * cx + cy * cy < 38 * 38 && Math.random() < D.dodge) {
        const sp = Math.sqrt(vv); let px = -r.vy / sp, py = r.vx / sp;
        if (px * -cx + py * -cy < 0) { px = -px; py = -py; }
        // close and armed? parry it instead of running
        b.danger = { px, py, t: 0.35, parry: Math.hypot(rx, ry) < 70 && Math.random() < D.dodge * 0.6, rx: r.x, ry: r.y };
      }
    }
  }
  if (b.danger) {
    inp.mx = b.danger.px; inp.my = b.danger.py; b.danger.t -= dt;
    if (b.danger.parry && p.slashCd <= 0) { inp.ax = b.danger.rx - p.x; inp.ay = b.danger.ry - p.y; inp.slash = true; b.danger.parry = false; }
    else if (p.dashCd <= 0 && Math.random() < D.dodge) inp.dash = true;
    if (b.danger.t <= 0) b.danger = null;
  } else {
    let goal = null;
    const nearPow = game.pickups.reduce((best, k) => { const d = Math.hypot(k.x - p.x, k.y - p.y); return d < 220 && (!best || d < best.d) ? { k, d } : best; }, null);
    if (!p.hasRang) {
      const mine = mainRang(p);
      if (mine && mine.state === 'dropped') {
        const d = Math.hypot(mine.x - p.x, mine.y - p.y);
        if (d > 160 || !lineClear(p.x, p.y, mine.x, mine.y) || tileAt(mine.x, mine.y) === PIT) inp.throw = true; // summon it
        else goal = mine;
      } else if (mine && mine.state === 'recall') inp.throw = true;
      else if (mine && has(p, 'tele') && mine.state !== 'dropped') { // steer it at the target
        inp.throw = true; inp.ax = tgt.x - mine.x; inp.ay = tgt.y - mine.y;
      }
      if (!goal && !inp.throw) {
        if (td < 50 && p.slashCd <= 0 && Math.random() < D.aggro) { inp.slash = true; inp.ax = tgt.x - p.x; inp.ay = tgt.y - p.y; } // shove
        if (nearPow) goal = nearPow.k;
        else {
          const d = td || 1;
          inp.mx = (p.x - tgt.x) / d * 0.6 - (tgt.y - p.y) / d * 0.5 * b.strafe;
          inp.my = (p.y - tgt.y) / d * 0.6 + (tgt.x - p.x) / d * 0.5 * b.strafe;
        }
      }
    } else {
      const los = has(p, 'drill') || lineClear(p.x, p.y, tgt.x, tgt.y);
      if (nearPow && nearPow.d < 120) goal = nearPow.k;
      else if (!los || td > 380) goal = tgt;
      else {
        const d = td || 1, ox = (tgt.x - p.x) / d, oy = (tgt.y - p.y) / d;
        const want = td > 240 ? 0.6 : td < 120 ? -0.6 : 0;
        inp.mx = ox * want - oy * b.strafe * 0.8; inp.my = oy * want + ox * b.strafe * 0.8;
      }
      if (b.mode === 'idle' && b.think <= 0) {
        if (td < 60 && p.slashCd <= 0 && Math.random() < D.aggro) { b.mode = 'tap'; b.tap = 1; }
        else if (los && td < 560 && Math.random() < D.aggro * 0.9) {
          b.mode = 'charge'; b.aimErr = rand(-D.err, D.err);
          b.chargeGoal = clamp((td - T.minRange + 40) / (T.maxRange - T.minRange), 0, 1) * T.fullCharge + rand(0, 0.06);
        } else if (!los && b.noPathT > 0.6) { b.mode = 'charge'; b.aimErr = 0; b.chargeGoal = 0.15; b.noPathT = 0; }
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
    inp.ax = tgt.x - p.x; inp.ay = tgt.y - p.y; inp.slash = true; b.mode = 'idle'; b.think = D.react;
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
const RSTATE = ['out', 'return', 'dropped', 'recall', 'tele'];
function powerBits(p) { let m = 0; for (const k of p.powers) m |= 1 << POWER_KEYS.indexOf(k); return m; }
function bitsToPowers(m) { return POWER_KEYS.filter((k, i) => k !== 'shield' && k !== 'bamboo' && (m & (1 << i))); }
function encodeSnapshot(g) {
  const P = g.players.map(p => [
    p.i, R0(p.x), R0(p.y), R0(p.face * 100),
    (p.alive ? 1 : 0) | (p.hasRang ? 2 : 0) | (p.charging ? 4 : 0) | (p.shield ? 8 : 0) | (p.dashT > 0 ? 16 : 0) | (p.inv > 0 ? 32 : 0) | (p.frozen > 0 ? 64 : 0) | (p.recalling || p.steering ? 128 : 0) |
      (p.hidden ? 256 : 0) | (p.disguised ? 512 : 0) | (p.bamboo > 0 ? 1024 : 0),
    p.charging ? R0(p.charge * 100) : 0, powerBits(p),
    R0(p.vx), R0(p.vy), R0(p.falling * 100), R0(p.aim * 100),
  ]);
  const R = g.rangs.map(r => [r.id, R0(r.x), R0(r.y), r.owner.i,
    RSTATE.indexOf(r.state) | (r.fire ? 8 : 0) | (r.drill ? 16 : 0) | (r.ice ? 32 : 0) | (r.boom ? 64 : 0)]);
  const K = g.pickups.map(k => [k.id, k.x, k.y, POWER_KEYS.indexOf(k.type)]);
  const L = g.trails.map(t => [t.id, R0(t.x), R0(t.y), t.k === 'fire' ? 0 : 1, R0(t.t * 10)]);
  const D = g.decoys.map(d => [d.id, R0(d.x), R0(d.y), d.owner.i, R0(d.face * 100)]);
  return { P, R, K, L, D, ph: g.phase };
}
// Prediction state the owning client needs to replay its own inputs.
function encodeSelf(p) {
  return [R0(p.vx * 10), R0(p.vy * 10), R0(p.dashT * 1000), R0(p.dashCd * 1000), p.prevDash ? 1 : 0, R0(p.dashDir * 1000), R0(p.x * 10), R0(p.y * 10),
    R0(p.kbx * 10), R0(p.kby * 10), R0(p.aim * 1000), p.aimStick ? 1 : 0, R0(p.frozen * 1000), p.steeringNoMove ? 1 : 0, R0(p.bamboo * 1000)];
}
function encodeInput(seq, inp) {
  return [seq, R0(inp.mx * 100), R0(inp.my * 100), R0(inp.ax * 100), R0(inp.ay * 100), (inp.throw ? 1 : 0) | (inp.dash ? 2 : 0) | (inp.slash ? 4 : 0)];
}
function decodeInput(a) {
  const n = (v) => clamp((+v || 0) / 100, -1, 1);
  return { seq: a[0] | 0, mx: n(a[1]), my: n(a[2]), ax: n(a[3]), ay: n(a[4]), throw: !!(a[5] & 1), dash: !!(a[5] & 2), slash: !!(a[5] & 4) };
}

const Sim = {
  TILE, COLS, ROWS, WW, WH, FLOOR, WALL, CRATE, PIT, TREE, GRASS, ICE, PAD, TEAM_COLORS, TEAM_NAMES, PLAYER_R, PCOLORS, CHARS, POWERS, POWER_KEYS, BOT_DIFF, MAPS, T, RSTATE,
  clamp, lerp, rand, dist2, angDiff, NO_INPUT, has, walkable,
  create, use, buildMap, gridFromString, gridToString, newMatch, step, movePlayer, makeBot, tileAt,
  encodeSnapshot, encodeSelf, encodeInput, decodeInput, bitsToPowers,
};
if (typeof module !== 'undefined' && module.exports) module.exports = Sim; else root.Sim = Sim;
})(typeof self !== 'undefined' ? self : this);
