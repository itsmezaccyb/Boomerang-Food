/* Boomerang Bites — shared simulation.
   Runs in the browser (offline / local play) and in Node (server-authoritative online play).
   No DOM, no audio: anything visual or audible is pushed to game.events for the client to present.
   See docs/mechanics.md for the rules this implements. */
(function (root) {
'use strict';

const TILE = 48;
// Arena size varies per map; these track the arena currently being simulated (set by use()/buildMap()).
let COLS = 20, ROWS = 12, WW = COLS * TILE, WH = ROWS * TILE;
function setDims(c, r) { COLS = c; ROWS = r; WW = c * TILE; WH = r * TILE; }
const MAX_PLAYERS = 8;
const FLOOR = 0, WALL = 1, CRATE = 2, PIT = 3, TREE = 4, GRASS = 5, ICE = 6, PAD = 7;
const TEAM_COLORS = ['#ff5d73', '#43a8ff'], TEAM_NAMES = ['Red', 'Blue'];
const PLAYER_R = 16;
const PCOLORS = ['#ff5d73', '#43a8ff', '#ffd23f', '#5ee06b', '#b57bff', '#ff9f43', '#2ee6d6', '#ff7ad9'];
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
  extra:    { sprite: 'boomerang', name: 'Extra Boomerang!' }, // carry two
};
const POWER_KEYS = Object.keys(POWERS);
const MAX_POWERS = 3;
const MAX_AMMO = 2; // boomerangs you can carry (one per hand)
const BOT_DIFF = {
  cpu1: { react: 0.5, err: 0.32, dodge: 0.25, aggro: 0.5 },
  cpu2: { react: 0.28, err: 0.16, dodge: 0.6, aggro: 0.8 },
  cpu3: { react: 0.13, err: 0.06, dodge: 0.92, aggro: 1 },
};
// Tuning
const T = {
  run: 200, chargeSlow: 0.55, dashSpeed: 640, dashTime: 0.17, dashCd: 0.8,
  minRange: 170, maxRange: 510, minSpeed: 560, maxSpeed: 780, fullCharge: 0.6,
  returnSpeed: 620,
  recallMax: 720, recallAccel: 1300, teleRadius: 380, teleSpeed: 520,
  recallReach: 5, slashCd: 0.4, slashReach: 58, slashArc: 1.3, lunge: 260, shove: 520, rangR: 13,
  trailLife: 2.2, trailGap: 24, freeze: 1.3, explodeR: 78,
  firstCountdown: 4, countdown: 2.6, between: 3, firstPower: 4, powerEvery: 8, maxPickups: 2, regen: 1.4, creditTime: 3, bounceKeep: 0.85, maxBounces: 8,
  curve: 2.6, holdToCall: 0.2, iceGrip: 2.2, bamboo: 5, disguiseAfter: 1.2, decoyLife: 5, padCd: 0.8, revealDist: 80,
};
// Quadrant maps (10x6), mirrored both ways into a fair 20x12 arena.
// # wall  t tree  c box  o hot-sauce pit  S spawn  . floor
const MAPS = [
  // Each arena: q = top-left quarter of the tile grid (mirrored into the other three), shapes = custom solid
  // pieces in tile units (mirrored too unless mirror: false), shapeColor = default colour for its shapes.
  // Tiles: # wall  t tree  c box  o hot-sauce pit  g tall grass  i ice  p teleporter  S spawn  . floor
  { name: 'Picnic', shapeColor: '#b9773f', q: [
    '##########',
    '#S........',
    '#.........',
    '#.........',
    '#.........',
    '#........o'],
    shapes: [
      { type: 'circle', x: 4.2, y: 3.6, r: 0.8 },                                   // picnic tables
      { type: 'arc', x: 10, y: 6, r: 2.8, from: 205, to: 240, width: 0.4 },          // benches curving round the sauce pond
      { type: 'path', points: [[6, 2.4], [7.4, 2.4]], width: 0.35, color: '#8a5a2b' }, // little fences
    ] },
  { name: 'Kitchen', shapeColor: '#8d93a3', q: [
    '##########',
    '#S........',
    '#.........',
    '#.........',
    '#.........',
    '#.....c...'],
    shapes: [
      { type: 'poly', points: [[3, 2], [6.2, 2], [6.2, 2.8], [3.8, 2.8], [3.8, 4.4], [3, 4.4]] }, // L-shaped counters
      { type: 'circle', x: 8.2, y: 3.9, r: 0.6, color: '#5a5f6b' },                  // stove tops
      { type: 'poly', points: [[8.4, 5.2], [11.6, 5.2], [11.6, 6.8], [8.4, 6.8]], mirror: false }, // centre island
    ] },
  { name: 'Sauce Pit', shapeColor: '#c98a4a', q: [
    '##########',
    '#S........',
    '#..ooo....',
    '#..o......',
    '#..o......',
    '#.......oo'],
    shapes: [
      { type: 'circle', x: 6.6, y: 2.2, r: 0.55 },                                   // pillars
      { type: 'circle', x: 8.5, y: 3.4, r: 0.45 },
      { type: 'path', points: [[5.6, 4.6], [6.4, 4.1]], width: 0.35 },              // a bit of railing
    ] },
  { name: 'Garden', shapeColor: '#4f8f3a', q: [
    '##########',
    '#S...t....',
    '#.........',
    '#.....gg..',
    '#.t...gg..',
    '#.........'],
    shapes: [
      { type: 'arc', x: 2.6, y: 5.6, r: 1.9, from: 270, to: 355, width: 0.45 },      // curved hedges
      { type: 'arc', x: 8.6, y: 1.4, r: 1.6, from: 95, to: 175, width: 0.45 },
      { type: 'circle', x: 10, y: 6, r: 1.1, mirror: false, color: '#7fb8d8' },      // fountain
    ] },
  { name: 'Open Plate', shapeColor: '#c9a46a', q: [
    '##########',
    '#S........',
    '#.........',
    '#.........',
    '#....c....',
    '#.........'],
    shapes: [
      { type: 'arc', x: 10, y: 6, r: 4.2, from: 200, to: 250, width: 0.45 },         // broken plate rim (4 pieces)
      { type: 'circle', x: 10, y: 6, r: 0.9, mirror: false, color: '#e8d5b0' },      // the plate in the middle
      { type: 'circle', x: 3.4, y: 3.3, r: 0.5 },                                    // salt shakers
    ] },
  { name: 'Salad Bar', shapeColor: '#6aa84f', q: [
    '##########',
    '#S..ggg...',
    '#...ggg...',
    '#.........',
    '#gg.......',
    '#gg.......'],
    shapes: [
      { type: 'circle', x: 7, y: 2.6, r: 0.7, color: '#d9c7a1' },                    // salad bowls
      { type: 'path', points: [[3.2, 4.4], [4.6, 3.7], [6.2, 4.4]], width: 0.35, color: '#a9d8e8' }, // sneeze guards
      { type: 'arc', x: 10, y: 6, r: 1.6, from: 230, to: 310, width: 0.4 },          // little hedges round the middle
    ] },
  { name: 'Freezer', shapeColor: '#9fd6ee', q: [
    '##########',
    '#S..iiii..',
    '#..iiiiii.',
    '#.iiiiiii.',
    '#.iiiiii..',
    '#..iiiii..'],
    shapes: [
      { type: 'poly', points: [[5, 2.1], [5.9, 3], [5, 3.9], [4.1, 3]] },             // ice blocks
      { type: 'poly', points: [[8, 1.1], [9.2, 1.1], [8.6, 2.5]] },                   // icicles hanging from the wall
      { type: 'circle', x: 10, y: 6, r: 0.8, mirror: false, color: '#c9ecfa' },      // frozen pillar
    ] },
  { name: 'Portal Pantry', shapeColor: '#9c6b3f', q: [
    '##########',
    '#S........',
    '#.p.......',
    '#.........',
    '#.........',
    '#.....c...'],
    shapes: [
      { type: 'path', points: [[4.5, 1], [4.5, 3.4]], width: 0.5 },                   // shelves
      { type: 'path', points: [[6.6, 4.3], [8.4, 4.3]], width: 0.5 },
      { type: 'circle', x: 7.6, y: 2.1, r: 0.5, color: '#7a4a2a' },                  // barrels
    ] },
  // Custom collision shapes (see docs/custom-maps.md): curved walls, round tables, an odd-shaped island.
  { name: 'Curvy Cafe', shapeColor: '#a8553d', q: ['##########', '#S........', '#.........', '#.....c...', '#.........', '#.........'],
    shapes: [
      { type: 'arc', x: 1, y: 1, r: 4.2, from: 15, to: 75, width: 0.45 },             // curved wall around each corner
      { type: 'circle', x: 6.5, y: 2.5, r: 0.75, color: '#b9773f' },                   // round tables
      { type: 'arc', x: 10, y: 6, r: 2.4, from: 205, to: 335, width: 0.45, mirror: false }, // centre crescents
      { type: 'arc', x: 10, y: 6, r: 2.4, from: 25, to: 155, width: 0.45, mirror: false },
      { type: 'poly', points: [[2.6, 5], [4.2, 5.6], [4.2, 6.4], [2.6, 7]] },          // wedge islands left/right
    ] },
  // Big arenas (28x18) for 5-8 players. Extra spawns are placed automatically.
  { name: 'Banquet Hall', big: true, shapeColor: '#a0603a', q: [
    '##############',
    '#S............',
    '#.............',
    '#.............',
    '#.............',
    '#.............',
    '#.............',
    '#..........c..',
    '#.............'],
    shapes: [
      { type: 'path', points: [[3.2, 4], [8.2, 4]], width: 1.0 },                     // long banquet tables
      { type: 'circle', x: 11, y: 3, r: 0.9, color: '#b9773f' },                       // round tables
      { type: 'circle', x: 6, y: 7.2, r: 0.8, color: '#b9773f' },
      { type: 'arc', x: 14, y: 9, r: 3.2, from: 200, to: 250, width: 0.45 },          // dance-floor ring
    ] },
  { name: 'Farmers Market', big: true, shapeColor: '#c48a3a', q: [
    '##############',
    '#S...ggg......',
    '#....ggg......',
    '#.............',
    '#.........gg..',
    '#ggg......gg..',
    '#ggg..........',
    '#.............',
    '#.............'],
    shapes: [
      { type: 'poly', points: [[4.4, 5.4], [7.6, 5.4], [7.6, 6.4], [4.4, 6.4]] },     // market stalls
      { type: 'circle', x: 11.2, y: 2.6, r: 0.7, color: '#8a5a2b' },                  // carts
      { type: 'path', points: [[9.2, 7.2], [11, 8], [12.8, 8]], width: 0.4, color: '#5d8f3a' }, // hedge rows
      { type: 'circle', x: 14, y: 9, r: 1.2, mirror: false, color: '#7fb8d8' },       // well in the square
    ] },
  { name: 'Food Court', big: true, shapeColor: '#8d93a3', q: [
    '##############',
    '#S............',
    '#.p...........',
    '#.............',
    '#.........oo..',
    '#.........oo..',
    '#.............',
    '#.............',
    '#.............'],
    shapes: [
      { type: 'arc', x: 14, y: 9, r: 4.6, from: 200, to: 250, width: 0.45 },          // curved counters round the middle
      { type: 'path', points: [[5.2, 1], [5.2, 3.8]], width: 0.5 },                   // divider walls
      { type: 'circle', x: 8, y: 7, r: 0.8, color: '#b9773f' },                        // tables
      { type: 'poly', points: [[2.2, 6.4], [4.2, 6.4], [3.2, 7.9]] },                  // planters
    ] },
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
  return { cols: 20, rows: 12,
    grid: [], spawns: [], mapIndex: 0, players: [], rangs: [], pickups: [], trails: [], events: [],
    round: 0, phase: 'intro', phaseT: 0, timeScale: 1, slowT: 0, powerTimer: 0, time: 0, decoys: [],
    points: 5, mapSetting: -1, nextId: 1, over: false, opts: { mode: 'ffa', pull: true, pw: 1 },
  };
}
function use(g) { game = g; if (g.cols) setDims(g.cols, g.rows); }

// Builds the full arena by mirroring the quadrant both ways. `need` = number of spawn points wanted.
function buildMap(idx, need) {
  const m = MAPS[idx], g = [], spawns = [];
  const qw = m.q[0].length, qh = m.q.length;
  setDims(qw * 2, qh * 2);
  for (let y = 0; y < ROWS; y++) {
    g.push([]);
    for (let x = 0; x < COLS; x++) {
      const ch = m.q[y < qh ? y : ROWS - 1 - y][x < qw ? x : COLS - 1 - x];
      let v = FLOOR;
      if (ch === '#') v = WALL; else if (ch === 'c') v = CRATE; else if (ch === 'o') v = PIT; else if (ch === 't') v = TREE;
      else if (ch === 'g') v = GRASS; else if (ch === 'i') v = ICE; else if (ch === 'p') v = PAD;
      else if (ch === 'S') spawns.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, q: (x < qw ? 0 : 1) + (y < qh ? 0 : 2) });
      g[y].push(v);
    }
  }
  const shapes = buildShapes(m), nav = buildNav(shapes);
  const out = [0, 3, 1, 2].map(q => spawns.find(s => s.q === q)); // TL, BR, TR, BL — a 1v1 starts in opposite corners
  // More players than corners: add spawns on open floor as far as possible from everyone else
  while (out.length < (need || 4)) {
    let best = null, bestD = -1;
    for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) {
      if (g[y][x] !== FLOOR || nav.b[x + y * COLS] || shapeHit(x * TILE + TILE / 2, y * TILE + TILE / 2, PLAYER_R + 12, shapes)) continue; // room to stand
      let near = false; // keep away from pits and walls on all sides
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (g[y + dy][x + dx] === PIT) near = true;
      if (near) continue;
      const px = x * TILE + TILE / 2, py = y * TILE + TILE / 2;
      const d = Math.min(...out.map(s => dist2(s.x, s.y, px, py)));
      if (d > bestD) { bestD = d; best = { x: px, y: py }; }
    }
    if (!best) break;
    out.push(best);
  }
  return { grid: g, spawns: out, cols: COLS, rows: ROWS, shapes, nav };
}
// Arenas that suit a player count: big ones for crowds, regular ones for small games.
function mapPool(n) {
  const all = MAPS.map((m, i) => i);
  if (n >= 7) return all.filter(i => MAPS[i].big);
  if (n >= 5) return all;
  return all.filter(i => !MAPS[i].big);
}
const gridToString = (g) => g.map(r => r.join('')).join('');
const gridFromString = (s, cols, rows) => { const g = []; for (let y = 0; y < rows; y++) { g.push([]); for (let x = 0; x < cols; x++) g[y].push(+s[y * cols + x]); } return g; };

// ---------------------------------------------------------------- custom collision shapes
// Maps can add solid shapes on top of the tile grid, in tile units (so they line up with custom art):
//   { type: 'circle', x, y, r }                      round table / pillar
//   { type: 'poly', points: [[x, y], ...] }          any outline (concave is fine)
//   { type: 'path', points: [[x, y], ...], width }   thick line through points (walls of any route)
//   { type: 'arc', x, y, r, from, to, width }        curved wall (degrees, 0 = right, 90 = down)
// Optional: mirror: false (default true copies it into all four quadrants like the tiles),
//           art: { src, x, y, w, h } image drawn for it (tile units), color: fill colour if no art.
function buildShapes(m) {
  const out = [], seen = new Set();
  for (const s0 of m.shapes || []) {
    let base = s0;
    if (s0.type === 'arc') {
      const n = Math.max(6, Math.ceil(Math.abs(s0.to - s0.from) / 8)), pts = [];
      for (let i = 0; i <= n; i++) { const a = (s0.from + (s0.to - s0.from) * i / n) * Math.PI / 180; pts.push([s0.x + Math.cos(a) * s0.r, s0.y + Math.sin(a) * s0.r]); }
      base = Object.assign({}, s0, { type: 'path', points: pts });
    }
    const variants = s0.mirror === false ? [[false, false]] : [[false, false], [true, false], [false, true], [true, true]];
    for (const [fx, fy] of variants) {
      const X = (v) => (fx ? COLS - v : v) * TILE, Y = (v) => (fy ? ROWS - v : v) * TILE;
      const sh = { type: base.type, color: s0.color || m.shapeColor, art: s0.art, fx, fy };
      if (base.type === 'circle') { sh.x = X(base.x); sh.y = Y(base.y); sh.r = base.r * TILE; }
      else { sh.points = base.points.map(([x, y]) => [X(x), Y(y)]); sh.w = (base.width || 0.5) * TILE; }
      const key = JSON.stringify([sh.type, sh.x, sh.y, sh.r, sh.points && sh.points.map(p => p.map(Math.round)).sort()]);
      if (seen.has(key)) continue; // a shape on a mirror line would otherwise be duplicated
      seen.add(key);
      const pad = sh.type === 'path' ? sh.w / 2 : 0;
      if (sh.type === 'circle') sh.box = [sh.x - sh.r, sh.y - sh.r, sh.x + sh.r, sh.y + sh.r];
      else {
        const xs = sh.points.map(p => p[0]), ys = sh.points.map(p => p[1]);
        sh.box = [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad];
      }
      out.push(sh);
    }
  }
  return out;
}
function segClosest(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  const t = l ? clamp(((px - ax) * dx + (py - ay) * dy) / l, 0, 1) : 0;
  return [ax + dx * t, ay + dy * t];
}
function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Does a circle (x, y, rad) overlap any shape? Returns the push-out normal and depth of the deepest overlap.
function shapeHit(x, y, rad, shapes) {
  shapes = shapes || (game && game.shapes);
  if (!shapes || !shapes.length) return null;
  let best = null;
  for (const s of shapes) {
    if (x + rad < s.box[0] || x - rad > s.box[2] || y + rad < s.box[1] || y - rad > s.box[3]) continue;
    let nx = 1, ny = 0, depth;
    if (s.type === 'circle') {
      const dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy);
      depth = s.r + rad - d; if (depth <= 0) continue;
      if (d) { nx = dx / d; ny = dy / d; }
    } else {
      let bd = Infinity, q = null;
      const n = s.points.length, closed = s.type === 'poly';
      for (let i = 0; i < (closed ? n : n - 1); i++) {
        const a = s.points[i], b = s.points[(i + 1) % n], c = segClosest(x, y, a[0], a[1], b[0], b[1]);
        const d = dist2(x, y, c[0], c[1]); if (d < bd) { bd = d; q = c; }
      }
      const d = Math.sqrt(bd);
      if (s.type === 'path') {
        depth = s.w / 2 + rad - d; if (depth <= 0) continue;
        if (d) { nx = (x - q[0]) / d; ny = (y - q[1]) / d; }
      } else if (pointInPoly(x, y, s.points)) {
        depth = d + rad; if (d) { nx = (q[0] - x) / d; ny = (q[1] - y) / d; }
      } else {
        depth = rad - d; if (depth <= 0) continue;
        if (d) { nx = (x - q[0]) / d; ny = (y - q[1]) / d; }
      }
    }
    if (!best || depth > best.depth) best = { nx, ny, depth };
  }
  return best;
}
// Navigation around shapes for bots/spawns: b = tile centre covered by a shape,
// r / d = can't walk from this tile to the one on the right / below (a shape is in the way).
function buildNav(shapes) {
  const n = COLS * ROWS, nav = { b: new Uint8Array(n), r: new Uint8Array(n), d: new Uint8Array(n) };
  if (!shapes.length) return nav;
  const clear = (ax, ay, bx, by) => { for (let t = 0; t <= 1.001; t += 0.125) if (shapeHit(lerp(ax, bx, t), lerp(ay, by, t), PLAYER_R * 0.75, shapes)) return false; return true; };
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2, i = x + y * COLS;
    if (shapeHit(cx, cy, 6, shapes)) nav.b[i] = 1;
    if (x + 1 < COLS && !clear(cx, cy, cx + TILE, cy)) nav.r[i] = 1;
    if (y + 1 < ROWS && !clear(cx, cy, cx, cy + TILE)) nav.d[i] = 1;
  }
  return nav;
}
// Can a fighter step between two neighbouring tiles (straight or diagonal) without a shape in the way?
function stepOk(cx, cy, nx, ny) {
  const nav = game.nav; if (!nav) return true;
  const e = (ax, ay, bx, by) => bx > ax ? !nav.r[ax + ay * COLS] : bx < ax ? !nav.r[bx + by * COLS] : by > ay ? !nav.d[ax + ay * COLS] : !nav.d[bx + by * COLS];
  if (nx !== cx && ny !== cy) return e(cx, cy, nx, cy) && e(nx, cy, nx, ny) && e(cx, cy, cx, ny) && e(cx, ny, nx, ny);
  return e(cx, cy, nx, ny);
}

const tileAt = (px, py) => {
  const x = Math.floor(px / TILE), y = Math.floor(py / TILE);
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return WALL;
  return game.grid[y][x];
};
const solidT = (v) => v === WALL || v === CRATE || v === TREE;
const solidAt = (px, py) => solidT(tileAt(px, py)) || !!shapeHit(px, py, 0);
// walkable tile that no custom shape covers (for pathing, spawning, resting places)
const openTile = (tx, ty) => tx >= 0 && ty >= 0 && tx < COLS && ty < ROWS && walkable(game.grid[ty][tx]) && !(game.nav && game.nav.b[tx + ty * COLS]);

function makeBot(type) {
  return { diff: BOT_DIFF[type] || BOT_DIFF.cpu2, think: 0, mode: 'idle', aimErr: 0, chargeGoal: 0, tap: 0, field: null, fieldKey: '', fieldAge: 0, strafe: 1, strafeT: 0, noPathT: 0, danger: null };
}

// opts: { mode: 'ffa' | 'teams', pull: call-back on/off, pw: power-up frequency 0 | 0.5 | 1 | 2 }
function newMatch(g, specs, points, mapSetting, opts) {
  use(g);
  g.points = points; g.mapSetting = mapSetting; g.over = false; g.winner = null;
  g.opts = Object.assign({ mode: 'ffa', pull: true, pw: 1 }, opts || {});
  if (g.opts.mode === 'teams' && new Set(specs.map(sp => sp.i % 2)).size < 2) g.opts.mode = 'ffa'; // need two teams
  g.players = specs.map(s => ({
    i: s.i, type: s.type, char: CHARS[s.char], charIndex: s.char, color: PCOLORS[s.i], score: 0,
    bot: s.type.startsWith('cpu') ? makeBot(s.type) : null, input: NO_INPUT, powers: [], shield: false, kills: 0, deaths: 0,
  }));
  g.round = 0;
  newRound();
}

function newRound() {
  game.round++;
  let idx = game.mapSetting;
  if (idx < 0 || idx >= MAPS.length) { // random, never the same arena twice in a row
    const pool = mapPool(game.players.length);
    const choices = pool.length > 1 ? pool.filter(i => i !== game.mapIndex || game.round === 1) : pool;
    idx = choices[Math.floor(Math.random() * choices.length)];
  }
  const m = buildMap(idx, game.players.length);
  game.grid = m.grid; game.spawns = m.spawns; game.mapIndex = idx; game.cols = m.cols; game.rows = m.rows; game.shapes = m.shapes; game.nav = m.nav;
  game.rangs = []; game.pickups = []; game.trails = []; game.decoys = [];
  game.players.forEach((p, n) => {
    const s = game.spawns[n];
    // Power-ups last the whole match (like the genre standard); positions and state reset each round.
    Object.assign(p, {
      x: s.x, y: s.y, vx: 0, vy: 0, kbx: 0, kby: 0, face: Math.atan2(WH / 2 - s.y, WW / 2 - s.x), aim: 0, aimStick: false,
      alive: true, hasRang: true, charging: false, charge: 0, slashT: 0, slashCd: 0, slashArmed: true,
      dashT: 0, dashCd: 0, dashDir: 0, falling: 0, walkT: 0, prevThrow: false, prevDash: false, prevSlash: false,
      inv: 0, frozen: 0, recalling: false, steering: false, holdT: 0, bamboo: 0, hidden: false, disguised: false, stillT: 0,
      decoyUsed: false, onPad: false, padCd: 0, team: teamOf(p), regenT: 0, lastHitBy: null, lastHitT: -9,
    });
    setAmmo(p, has(p, 'extra') ? 2 : 1);
    p.aim = p.face;
    if (p.bot) Object.assign(p.bot, { think: 0.3 + Math.random() * 0.3, mode: 'idle', tap: 0, field: null, fieldKey: '', danger: null });
  });
  // first round: a proper 3-2-1 so people can turn their phones sideways; later rounds a shorter one
  game.phase = 'intro'; game.phaseT = game.round === 1 ? T.firstCountdown : T.countdown; game.lastCount = 0; game.powerTimer = rand(T.firstPower, T.firstPower + 2); game.timeScale = 1; game.slowT = 0;
  emit('round', { n: game.round, map: idx, grid: gridToString(game.grid), cols: COLS, rows: ROWS });
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
    const c = Math.ceil(g.phaseT);
    if (c > 0 && c <= (g.round === 1 ? 3 : 2) && c !== g.lastCount) { g.lastCount = c; emit('count', c); } // 3-2-1 first round, 2-1 after
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

// Scoring is by kills (see kill()). A round ends when one snack/team is left; the match ends when someone hits the target.
function endRound() {
  const scores = game.players.map(p => p.score);
  if (game.winner) {
    const w = game.winner, team = game.opts.mode === 'teams';
    game.over = true; game.phase = 'over';
    emit('result', { w: w.i, scores, team: team ? teamOf(w) : -1, kills: game.players.map(p => p.kills), deaths: game.players.map(p => p.deaths) });
    return;
  }
  const alive = game.players.filter(p => p.alive);
  emit('roundend', { scores, last: alive.length === 1 ? alive[0].i : -1 });
  game.phase = 'between'; game.phaseT = T.between; // time to show the scoreboard
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

function setAmmo(p, n) { p.ammo = clamp(n, 0, MAX_AMMO); p.hasRang = p.ammo > 0; }
// Your own boomerangs that are out in the world (not grey ones, not Triple's temporary extras)
function ownRangs(p) { return game.rangs.filter(r => r.owner === p && !r.temp && !r.neutral); }
function mainRang(p) { const own = ownRangs(p); return own.find(r => r.state !== 'dropped') || own[0]; }

function updatePlayer(p, dt) {
  if (!p.alive) return;
  if (p.falling > 0) { p.falling -= dt; if (p.falling <= 0) kill(p, null, true); return; }
  const inp = game.phase === 'between' ? NO_INPUT : p.input;
  p.slashT = Math.max(0, p.slashT - dt); p.slashCd = Math.max(0, p.slashCd - dt);
  p.inv = Math.max(0, p.inv - dt); p.frozen = Math.max(0, p.frozen - dt); p.bamboo = Math.max(0, p.bamboo - dt);
  p.padCd = Math.max(0, p.padCd - dt);
  const frozen = p.frozen > 0;
  const stick = Math.hypot(inp.ax, inp.ay) > 0.3;
  // Explosive boomerangs are used up: a fresh one appears in your hand shortly after
  if (p.regenT > 0) { p.regenT -= dt; if (p.regenT <= 0) { setAmmo(p, p.ammo + 1); emit('regen', { i: p.i, x: R0(p.x), y: R0(p.y) }); } }

  // Teleport power: dash while your boomerang is out -> warp to it
  const mine = mainRang(p);
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
  const holding = inp.throw && p.ammo === 0 && !frozen; // both hands empty
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
  if (!frozen && inp.throw && !p.prevThrow && p.ammo > 0) {
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
        if (k.type === 'extra' && !has(p, 'extra')) setAmmo(p, p.ammo + 1); // second boomerang right away
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
    for (let k = 0; k < 3; k++) { const h = shapeHit(e.x, e.y, r); if (!h) break; e.x += h.nx * h.depth; e.y += h.ny * h.depth; }
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
  const armed = p.ammo > 0;
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
        q.lastHitBy = p; q.lastHitT = game.time; // shoved into a pit = your kill
        emit('shove', { x: R0(q.x), y: R0(q.y) });
      }
    }
  }
  for (const d of game.decoys.slice()) if (d.owner !== p && Math.hypot(d.x - p.x, d.y - p.y) < reach) popDecoy(d);
  for (const r of game.rangs.slice()) { // swat: knock incoming boomerangs out of the air
    if (r.owner === p || r.state === 'dropped') continue;
    const d = Math.hypot(r.x - p.x, r.y - p.y);
    if (d < reach + 12 && (d < 26 || Math.abs(angDiff(Math.atan2(r.y - p.y, r.x - p.x), p.face)) < 1.6)) {
      emit('spark', { x: R0(r.x), y: R0(r.y), s: 1 });
      dropRang(r);
    }
  }
  const fx = p.x + Math.cos(p.face) * 38, fy = p.y + Math.sin(p.face) * 38;
  if (tileAt(fx, fy) === CRATE) breakCrate(Math.floor(fx / TILE), Math.floor(fy / TILE));
}

function newRang(o) {
  return Object.assign({ id: game.nextId++, spin: 0, t: 0, immune: null, immuneT: 0, stateT: 0, trailD: 0, exploded: false, temp: false, neutral: false }, o);
}

function throwRang(p, power) {
  const maxDist = T.minRange + (T.maxRange - T.minRange) * power;
  const speed = T.minSpeed + (T.maxSpeed - T.minSpeed) * power;
  const angles = has(p, 'multi') ? [0, -0.3, 0.3] : [0];
  angles.forEach((da, n) => {
    const a = p.aim + da;
    let sx = p.x + Math.cos(a) * 14, sy = p.y + Math.sin(a) * 14;
    if (solidAt(sx, sy)) { sx = p.x; sy = p.y; } // hugging a wall: start from the thrower instead of inside it
    game.rangs.push(newRang({
      owner: p, x: sx, y: sy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      speed, state: 'out', traveled: 0, maxDist, temp: n > 0, // Triple's side boomerangs vanish when they're done
      drill: has(p, 'drill'), boom: has(p, 'boom'), fire: has(p, 'fire'), ice: has(p, 'ice'),
    }));
  });
  p.face = p.aim; setAmmo(p, p.ammo - 1); emit('sfx', 'throw');
}

function removeRang(r) { const i = game.rangs.indexOf(r); if (i >= 0) game.rangs.splice(i, 1); }
// A player takes a boomerang into their hand (if they have a free hand)
function catchRang(p, r) {
  if (r.temp) { removeRang(r); return; }
  if (p.ammo >= MAX_AMMO) { if (r.state !== 'dropped') dropRang(r); return; } // hands full: it lands at your feet
  removeRang(r);
  r.owner = p; r.neutral = false;
  setAmmo(p, p.ammo + 1); emit('sfx', 'catch');
}
// Nearest open (walkable) tile centre to a point, searching outward. Used so nothing ever rests inside a wall.
function nearestOpen(x, y) {
  const sx = clamp(Math.floor(x / TILE), 0, COLS - 1), sy = clamp(Math.floor(y / TILE), 0, ROWS - 1);
  let best = null, bd = Infinity;
  for (let rad = 1; rad < Math.max(COLS, ROWS) && !best; rad++) {
    for (let ty = sy - rad; ty <= sy + rad; ty++) for (let tx = sx - rad; tx <= sx + rad; tx++) {
      if (!openTile(tx, ty)) continue;
      const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2, d = dist2(cx, cy, x, y);
      if (d < bd) { bd = d; best = { x: cx, y: cy }; }
    }
  }
  return best || { x, y };
}
// It falls to the floor and stays there until someone picks it up (or the owner calls it back)
function dropRang(r) {
  if (r.temp) { removeRang(r); return; }
  if (!walkable(tileAt(r.x, r.y)) || solidAt(r.x, r.y)) { const o = nearestOpen(r.x, r.y); r.x = o.x; r.y = o.y; } // never rest inside a wall, a shape or on a pit
  r.state = 'dropped'; r.vx = r.vy = 0; r.stateT = 0;
  emit('drop', { x: R0(r.x), y: R0(r.y) });
}
function setState(r, s) { if (r.state !== s) { r.state = s; r.stateT = 0; } }

// Outbound/steered flight: bounces off walls, boxes, trees and custom shapes. Returns true if it bounced.
function flyStep(r, dt) {
  const nx = r.x + r.vx * dt, ny = r.y + r.vy * dt;
  const move = () => { r.x = clamp(nx, 4, WW - 4); r.y = clamp(ny, 4, WH - 4); };
  if (r.drill) { // drills straight through everything, breaking boxes
    if (tileAt(nx, ny) === CRATE) breakCrate(Math.floor(nx / TILE), Math.floor(ny / TILE));
    move(); return false;
  }
  if (solidAt(r.x, r.y)) { move(); return false; } // somehow inside one: drift out
  if (!solidAt(nx, ny)) { move(); return false; }
  const tx = Math.floor(nx / TILE), ty = Math.floor(ny / TILE);
  if (game.grid[ty] && game.grid[ty][tx] === CRATE) breakCrate(tx, ty);
  if (r.boom) { explode(r, nx, ny); return true; }
  const h = !solidT(tileAt(nx, ny)) && (shapeHit(nx, ny, 0) || shapeHit(nx, ny, 3));
  if (h) { // custom shape: reflect off its surface
    const dot = r.vx * h.nx + r.vy * h.ny;
    if (dot < 0) { r.vx -= 2 * dot * h.nx; r.vy -= 2 * dot * h.ny; } else { r.vx = -r.vx; r.vy = -r.vy; }
  } else { // tile: flip the axis that hit
    const hx = solidAt(nx, r.y), hy = solidAt(r.x, ny);
    if (hx) r.vx = -r.vx;
    if (hy) r.vy = -r.vy;
    if (!hx && !hy) { r.vx = -r.vx; r.vy = -r.vy; } // corner
  }
  r.vx *= T.bounceKeep; r.vy *= T.bounceKeep; r.speed *= T.bounceKeep; r.bounces = (r.bounces || 0) + 1;
  emit('spark', { x: R0(r.x), y: R0(r.y), s: 1 });
  return true;
}

// Move a boomerang, sliding along walls and shapes instead of stopping dead.
function slideStep(r, dt) {
  const nx = r.x + r.vx * dt, ny = r.y + r.vy * dt;
  if (!solidAt(nx, ny) || solidAt(r.x, r.y)) { r.x = clamp(nx, 4, WW - 4); r.y = clamp(ny, 4, WH - 4); return; }
  const h = !solidT(tileAt(nx, ny)) && (shapeHit(nx, ny, 0) || shapeHit(nx, ny, 3));
  if (h) { // shape: drop the part of the motion going into the surface
    const dot = r.vx * h.nx + r.vy * h.ny;
    if (dot < 0) { r.vx -= dot * h.nx; r.vy -= dot * h.ny; }
    const sx = r.x + r.vx * dt, sy = r.y + r.vy * dt;
    if (!solidAt(sx, sy)) { r.x = sx; r.y = sy; }
    return;
  }
  // tile edge: keep only the part of the pull that runs along the wall (zero if pulled straight in -> stuck)
  if (!solidAt(nx, r.y)) r.x = nx;
  else if (!solidAt(r.x, ny)) r.y = ny;
}

// Would a call-back reach the owner from here? (Quick simulation of the pull, for CPUs: a real player can see it.)
function recallWouldReach(r, o) {
  const t = { x: r.x, y: r.y, vx: 0, vy: 0 };
  let speed = 150, stuck = 0;
  for (let i = 0; i < 100; i++) {
    const dx = o.x - t.x, dy = o.y - t.y, d = Math.hypot(dx, dy) || 1;
    if (d < PLAYER_R + 14) return true;
    speed = Math.min(speed + T.recallAccel / 60, T.recallMax);
    t.vx = dx / d * speed; t.vy = dy / d * speed;
    const ox = t.x, oy = t.y;
    slideStep(t, 1 / 60);
    stuck = Math.hypot(t.x - ox, t.y - oy) < 1.5 ? stuck + 1 : 0;
    if (stuck > 6) return false;
  }
  return false;
}

function updateRang(r, dt) {
  r.t += dt; r.stateT += dt;
  const px = r.x, py = r.y; // where it was at the start of this step (hits are checked along the whole path)
  if (r.immuneT > 0) { r.immuneT -= dt; if (r.immuneT <= 0) r.immune = null; }
  const o = r.owner, ownerOk = o.alive && !o.falling && !r.neutral;

  if (r.state === 'dropped') {
    if (ownerOk && o.recalling) { setState(r, 'recall'); r.speed = 150; emit('sfx', 'recall'); }
    else {
      // walk over it to pick it up: your own, or a grey one (its owner is out) if you have a free hand
      for (const p of game.players) {
        if (!p.alive || p.falling || p.ammo >= MAX_AMMO || (!r.neutral && p !== o)) continue;
        if (dist2(p.x, p.y, r.x, r.y) < (PLAYER_R + 14) ** 2) { catchRang(p, r); return; }
      }
      return;
    }
  }
  if (!ownerOk) { dropRang(r); return; }

  // Owner holding throw with empty hands: summon it (or steer it, with telekinesis)
  if (o.recalling && r.state !== 'recall') { setState(r, 'recall'); r.speed = Math.max(200, Math.hypot(r.vx, r.vy) * 0.5); emit('sfx', 'recall'); }
  if (r.state === 'recall' && !o.recalling) setState(r, 'return');
  if (o.steering && r.state !== 'recall' && !(r.clashT > game.time)) setState(r, 'tele');
  else if (r.state === 'tele') setState(r, 'return');

  if (r.state === 'out') {
    const f = 1 - 0.55 * (r.traveled / r.maxDist) ** 2;
    const want = r.speed * f;
    let ang = Math.atan2(r.vy, r.vx);
    // Curve: push the aim stick after throwing to bend it around corners
    const ci = o.input;
    if (!o.bot && Math.hypot(ci.ax, ci.ay) > 0.3) {
      const d = angDiff(Math.atan2(ci.ay, ci.ax), ang), maxTurn = T.curve * dt;
      ang += clamp(d, -maxTurn, maxTurn);
    }
    r.vx = Math.cos(ang) * want; r.vy = Math.sin(ang) * want;
    if (flyStep(r, dt)) { // bounced off something
      if (!game.rangs.includes(r)) return;
      if (r.bounces >= T.maxBounces) { dropRang(r); return; } // rattling around a corner: give up
    }
    r.traveled += want * dt;
    if (r.traveled >= r.maxDist) {
      if (r.boom) { explode(r, r.x, r.y); return; }
      setState(r, 'return'); r.speed = want;
    }
  } else if (r.state === 'return') {
    // Straight back to the owner. Anything solid in the way stops it: it gets stuck on the far side. Deadly on the way.
    const dx = o.x - r.x, dy = o.y - r.y, d = Math.hypot(dx, dy) || 1;
    r.speed = Math.min(r.speed + 1000 * dt, T.returnSpeed);
    r.vx = dx / d * r.speed; r.vy = dy / d * r.speed;
    if (d <= r.speed * dt + PLAYER_R + 10) { catchRang(o, r); return; }
    const nx = r.x + r.vx * dt, ny = r.y + r.vy * dt;
    if (!r.drill && solidAt(nx, ny) && !solidAt(r.x, r.y)) {
      const tx = Math.floor(nx / TILE), ty = Math.floor(ny / TILE);
      if (game.grid[ty] && game.grid[ty][tx] === CRATE) breakCrate(tx, ty); // a box takes the hit
      emit('spark', { x: R0(r.x), y: R0(r.y), s: 1 });
      dropRang(r); return;
    }
    if (r.drill && tileAt(nx, ny) === CRATE) breakCrate(Math.floor(nx / TILE), Math.floor(ny / TILE));
    r.x = nx; r.y = ny;
  } else if (r.state === 'recall') {
    // Call-back works like gravity: it's always pulled straight at you. If something's in the way it slides along
    // the surface, so a wall angled toward you lets it slip past, but pressed into an inside corner it stays stuck
    // until you move to a better angle. Deadly on the way.
    const dx = o.x - r.x, dy = o.y - r.y, d = Math.hypot(dx, dy) || 1;
    r.speed = Math.min(r.speed + T.recallAccel * dt, T.recallMax);
    if (d <= r.speed * dt + PLAYER_R + 10) { catchRang(o, r); return; }
    r.vx = dx / d * r.speed; r.vy = dy / d * r.speed;
    if (r.drill) { r.x = clamp(r.x + r.vx * dt, 4, WW - 4); r.y = clamp(r.y + r.vy * dt, 4, WH - 4); if (tileAt(r.x, r.y) === CRATE) breakCrate(Math.floor(r.x / TILE), Math.floor(r.y / TILE)); }
    else slideStep(r, dt);
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
    flyStep(r, dt); // steered boomerangs bounce too
  }
  if (!game.rangs.includes(r)) return;

  // Trails
  if (r.fire || r.ice) {
    r.trailD += Math.hypot(r.vx, r.vy) * dt;
    if (r.trailD > T.trailGap) {
      r.trailD = 0;
      if (walkable(tileAt(r.x, r.y)) && !solidAt(r.x, r.y)) game.trails.push({ id: game.nextId++, x: r.x, y: r.y, t: 0, k: r.fire ? 'fire' : 'ice', owner: o });
      if (game.trails.length > 180) game.trails.shift();
    }
  }
  // Hits — on the way out, on the way back, and while being summoned. Never the owner.
  // Checked along the line it just travelled (so a fast boomerang can't skip past someone), and a summoned one
  // has a slightly bigger reach so "it hits anyone in its path" is dependable.
  const reach = PLAYER_R + T.rangR + (r.state === 'recall' ? T.recallReach : 0);
  for (const q of game.players) {
    if (q === o || q === r.immune || !q.alive || q.falling || sameTeam(o, q)) continue;
    const c = segClosest(q.x, q.y, px, py, r.x, r.y);
    if (dist2(q.x, q.y, c[0], c[1]) < reach * reach) {
      if (r.boom) { explode(r, r.x, r.y); return; }
      kill(q, o, false, r);
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
  const rs = game.rangs.filter(r => (r.state === 'out' || r.state === 'return' || r.state === 'tele') && !(r.clashT > game.time));
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j];
    if (a.owner === b.owner || a.clashT > game.time || b.clashT > game.time) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d >= 22) continue;
    if ((b.vx - a.vx) * dx + (b.vy - a.vy) * dy > 0) continue; // already moving apart
    const nx = d ? dx / d : 1, ny = d ? dy / d : 0;
    for (const [r, sgn] of [[a, -1], [b, 1]]) {
      setState(r, 'return'); r.speed = 260;
      r.vx = nx * sgn * 260; r.vy = ny * sgn * 260;      // knock them apart
      r.x += nx * sgn * (12 - d / 2); r.y += ny * sgn * (12 - d / 2);
      r.clashT = game.time + 0.35;                          // can't clash again straight away
    }
    emit('spark', { x: R0((a.x + b.x) / 2), y: R0((a.y + b.y) / 2), s: 1 });
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

// Explosive boomerangs are used up; the owner gets a fresh one in hand shortly after.
function explode(r, x, y) {
  if (r.exploded) return; r.exploded = true;
  removeRang(r);
  if (!r.temp && r.owner.alive) r.owner.regenT = T.regen;
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
}

// Power-ups get rarer as players collect them (20% per power held), scaled by the match option.
// Fewer appear as people collect them (20% less per power held, averaged over the players), never below 30%.
function powerRate() {
  const held = game.players.reduce((n, p) => n + p.powers.length, 0) / Math.max(1, game.players.length / 2);
  return game.opts.pw * Math.max(0.3, Math.pow(0.8, held));
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
    if (rang && game.rangs.includes(rang)) dropRang(rang); // blocked: it falls
    emit('shield', { x: R0(q.x), y: R0(q.y) });
    return;
  }
  q.alive = false; q.charging = false; q.deaths++;
  // Their boomerangs turn grey: anyone with a free hand can grab them
  for (let k = 0; k < q.ammo; k++) {
    const a = rand(0, Math.PI * 2), o = fell ? nearestOpen(q.x, q.y) : { x: q.x + Math.cos(a) * 10, y: q.y + Math.sin(a) * 10 };
    game.rangs.push(newRang({ owner: q, x: o.x, y: o.y, vx: 0, vy: 0, speed: 0, state: 'dropped', traveled: 0, maxDist: 0, spin: rand(0, 6), neutral: true }));
  }
  for (const r of game.rangs.slice()) if (r.owner === q) { if (r.temp) removeRang(r); else { r.neutral = true; if (r.state !== 'dropped') dropRang(r); } }
  setAmmo(q, 0); q.regenT = 0;

  // Scoring: +1 per kill. Shoving someone into a pit counts as your kill. Dying on your own costs a point.
  let killer = by;
  if ((!killer || killer === q) && q.lastHitBy && game.time - q.lastHitT < T.creditTime) killer = q.lastHitBy;
  if (killer && killer !== q && !sameTeam(killer, q)) {
    killer.kills++;
    for (const p of game.players) if (p === killer || sameTeam(p, killer)) p.score++; // teams share points
  } else {
    for (const p of game.players) if (p === q || sameTeam(p, q)) p.score = Math.max(0, p.score - 1);
    killer = null;
  }
  const how = fell ? 'pit' : rang ? rang.state : (by && by !== q && Math.hypot(by.x - q.x, by.y - q.y) < 80 ? 'slash' : 'other');
  emit('kill', { i: q.i, x: R0(q.x), y: R0(q.y), f: fell ? 1 : 0, by: killer ? killer.i : -1, how, scores: game.players.map(p => p.score) });
  if (!game.winner) {
    const top = game.players.filter(p => p.score >= game.points).sort((a, b) => b.score - a.score)[0];
    if (top) { game.winner = top; game.phase = 'end'; game.phaseT = 1.8; game.slowT = 0.9; return; }
  }
  if (game.players.filter(p => p.alive).length <= 1) game.slowT = 0.7;
}

function updatePickups(dt) {
  for (const k of game.pickups) k.t += dt;
  if (game.phase !== 'fight') return;
  if (game.opts.pw <= 0) return;
  game.powerTimer -= dt;
  if (game.powerTimer > 0) return;
  game.powerTimer = rand(T.powerEvery, T.powerEvery + 4) / powerRate();
  if (game.pickups.length >= T.maxPickups) return;
  for (let tries = 0; tries < 40; tries++) {
    const tx = 1 + Math.floor(Math.random() * (COLS - 2)), ty = 1 + Math.floor(Math.random() * (ROWS - 2));
    const cx = tx * TILE + TILE / 2, cy = ty * TILE + TILE / 2;
    if (game.grid[ty][tx] !== FLOOR || !openTile(tx, ty) || game.players.some(p => p.alive && dist2(p.x, p.y, cx, cy) < 130 * 130)) continue;
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
      if (f[n] >= 0) continue;
      const v = game.grid[ny][nx];
      // a 1-tile-wide pit with floor on both sides is crossable with a dash
      const hop = v === PIT && cx + 2 * dx >= 0 && cx + 2 * dx < COLS && cy + 2 * dy >= 0 && cy + 2 * dy < ROWS &&
        openTile(cx + 2 * dx, cy + 2 * dy) && walkable(game.grid[cy][cx]);
      if ((!openTile(nx, ny) && !hop) || !stepOk(cx, cy, nx, ny)) continue;
      f[n] = f[c] + (hop ? 3 : 1); q.push(n);
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
    if (dx && dy && (!openTile(nx, cy) || !openTile(cx, ny) || game.grid[ny][nx] === PIT)) continue;
    if (!stepOk(cx, cy, nx, ny)) continue;
    const v = f[nx + ny * COLS];
    if (v >= 0 && v < bv) { bv = v; best = [nx, ny]; }
  }
  b.hop = !!best && game.grid[best[1]][best[0]] === PIT; // next step is a pit: dash over it
  if (!best) return direct(false);
  const wx = best[0] * TILE + TILE / 2 - p.x, wy = best[1] * TILE + TILE / 2 - p.y, d = Math.hypot(wx, wy) || 1;
  return [wx / d, wy / d, true];
}

function updateBot(p, dt) {
  const b = p.bot, D = b.diff, inp = { mx: 0, my: 0, ax: 0, ay: 0, throw: false, dash: false, slash: false };
  b.think -= dt; b.fieldAge += dt; b.strafeT -= dt;
  if (p.hasRang) b.steerT = 0;
  if (b.strafeT <= 0) { b.strafe = Math.random() < 0.5 ? 1 : -1; b.strafeT = rand(0.8, 2); }
  // Bots can't see snacks hiding in grass or disguised as boxes unless they're close
  const enemies = game.players.filter(q => q !== p && q.alive && !q.falling && !sameTeam(p, q) &&
    (!(q.hidden || q.disguised) || Math.hypot(q.x - p.x, q.y - p.y) < 90));
  if (!enemies.length || game.phase === 'between') { // nobody visible: wander toward the middle
    if (game.phase !== 'between' && !p.hasRang) {
      const m = mainRang(p);
      if (m && m.state === 'recall') inp.throw = true; // keep pulling
      else if (m && m.state === 'dropped') {
        if (b.think <= 0 || b.canPull === undefined) b.canPull = recallWouldReach(m, p);
        if (game.opts.pull && b.canPull) inp.throw = true; else { const [dx, dy] = pathDir(p, b, m.x, m.y); inp.mx = dx; inp.my = dy; }
      }
    }
    else if (game.phase !== 'between') { // search: check grass patches and random spots until someone turns up
      b.patrolT = (b.patrolT || 0) - dt;
      if (!b.patrol || b.patrolT <= 0 || Math.hypot(b.patrol.x - p.x, b.patrol.y - p.y) < 30) {
        const spots = [];
        for (let y = 1; y < ROWS - 1; y++) for (let x = 1; x < COLS - 1; x++) if (game.grid[y][x] === GRASS || (game.grid[y][x] === FLOOR && Math.random() < 0.05)) spots.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
        b.patrol = spots.length ? spots[Math.floor(Math.random() * spots.length)] : { x: WW / 2, y: WH / 2 };
        b.patrolT = 5;
      }
      const [dx, dy] = pathDir(p, b, b.patrol.x, b.patrol.y); inp.mx = dx * 0.8; inp.my = dy * 0.8;
    }
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
    // grey boomerangs (their owner is out) are free for the taking
    const grey = game.rangs.filter(r => r.neutral && r.state === 'dropped').map(r => ({ r, d: Math.hypot(r.x - p.x, r.y - p.y) })).sort((a, c) => a.d - c.d)[0];
    if (!p.hasRang) {
      const mine = mainRang(p);
      if (grey && grey.d < 300 && (!mine || grey.d < Math.hypot(mine.x - p.x, mine.y - p.y))) goal = grey.r;
      else
      if (mine && mine.state === 'dropped') {
        const d = Math.hypot(mine.x - p.x, mine.y - p.y);
        if (b.think <= 0 || b.canPull === undefined) b.canPull = recallWouldReach(mine, p);
        if (game.opts.pull && d > 120 && !b.walkToRang && b.canPull) inp.throw = true; // summon it if the pull would get here
        else goal = mine;
      } else if (mine && mine.state === 'recall') inp.throw = true;
      b.recallT = mine && mine.state === 'recall' ? (b.recallT || 0) + dt : 0;
      if (b.recallT > 3) b.walkToRang = true; // call-back isn't getting there: go and fetch it
      if (!mine || p.hasRang) { b.walkToRang = false; b.canPull = undefined; }
      else if (mine && has(p, 'tele') && mine.state !== 'dropped' && td < T.teleRadius + 40 && (b.steerT || 0) < 3 && lineClear(mine.x, mine.y, tgt.x, tgt.y)) { // steer it at the target
        inp.throw = true; inp.ax = tgt.x - mine.x; inp.ay = tgt.y - mine.y; b.steerT = (b.steerT || 0) + dt;
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
      if (p.ammo < MAX_AMMO && grey && grey.d < 140) goal = grey.r; // grab a second one
      else if (nearPow && nearPow.d < 120) goal = nearPow.k;
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
        } else if (!los && b.noPathT > 0.6) { // boxed in: smash the nearest box open
          let best = null, bd = Infinity;
          for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (game.grid[y][x] === CRATE) {
            const cx = x * TILE + TILE / 2, cy = y * TILE + TILE / 2, d = dist2(cx, cy, p.x, p.y);
            if (d < bd) { bd = d; best = { x: cx, y: cy }; }
          }
          b.mode = 'charge'; b.aimErr = 0; b.noPathT = 0; b.crate = best;
          b.chargeGoal = best ? clamp((Math.sqrt(bd) - T.minRange + 60) / (T.maxRange - T.minRange), 0, 1) * T.fullCharge : 0.15;
        }
      }
    }
    if (goal) {
      const [dx, dy, ok] = pathDir(p, b, goal.x, goal.y);
      inp.mx = dx; inp.my = dy;
      b.noPathT = ok ? 0 : b.noPathT + dt;
    }
  }
  if (!p.hasRang) { const m = mainRang(p); if (m && m.state === 'recall') inp.throw = true; } // keep pulling while dodging
  if (tileAt(p.x + inp.mx * 22, p.y + inp.my * 22) === PIT && p.dashT <= 0) {
    const land = tileAt(p.x + inp.mx * 100, p.y + inp.my * 100);
    if (b.hop && p.dashCd <= 0 && walkable(land) && Math.hypot(inp.mx, inp.my) > 0.7) { inp.dash = true; b.hopping = true; }
    else { inp.mx = -inp.mx * 0.3; inp.my = -inp.my * 0.3; }
  }
  if (b.hopping) b.hopping = false;
  else if (inp.dash && (tileAt(p.x + inp.mx * 110, p.y + inp.my * 110) === PIT || tileAt(p.x + inp.mx * 60, p.y + inp.my * 60) === PIT)) inp.dash = false;

  if (b.mode === 'tap') {
    inp.ax = tgt.x - p.x; inp.ay = tgt.y - p.y; inp.slash = true; b.mode = 'idle'; b.think = D.react;
  } else if (b.mode === 'charge') {
    if (!p.hasRang) b.mode = 'idle';
    else {
      const lead = td / 650;
      const ex = b.crate ? b.crate.x : tgt.x + tgt.vx * lead, ey = b.crate ? b.crate.y : tgt.y + tgt.vy * lead;
      const a = Math.atan2(ey - p.y, ex - p.x) + b.aimErr;
      inp.ax = Math.cos(a); inp.ay = Math.sin(a);
      if (!p.charging) inp.throw = !p.prevThrow; // let go first if throw was already held (e.g. after a call-back)
      else if (p.charge < b.chargeGoal) inp.throw = true;
      else { inp.throw = false; b.mode = 'idle'; b.crate = null; b.think = D.react + rand(0, 0.3); }
    }
  }
  // Unstick: pushing for 1.5s without getting anywhere (odd wall shapes) -> walk to a random nearby open spot for a moment
  if (Math.hypot(inp.mx, inp.my) > 0.5 && !b.danger) {
    if (!b.lastPos || Math.hypot(p.x - b.lastPos.x, p.y - b.lastPos.y) > 12) { b.lastPos = { x: p.x, y: p.y }; b.stuckT = 0; }
    else b.stuckT = (b.stuckT || 0) + dt;
    if (b.stuckT > 1.5 && !b.unstick) {
      const tx = Math.floor(p.x / TILE), ty = Math.floor(p.y / TILE), opts = [];
      for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) if (openTile(x, y) && (x !== tx || y !== ty)) opts.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2 });
      if (opts.length) b.unstick = Object.assign(opts[Math.floor(Math.random() * opts.length)], { t: 1 });
      b.stuckT = 0;
    }
  } else b.stuckT = 0;
  if (b.unstick) {
    b.unstick.t -= dt;
    const dx = b.unstick.x - p.x, dy = b.unstick.y - p.y, d = Math.hypot(dx, dy) || 1;
    inp.mx = dx / d; inp.my = dy / d;
    if (b.unstick.t <= 0 || d < 10) b.unstick = null;
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
      (p.hidden ? 256 : 0) | (p.disguised ? 512 : 0) | (p.bamboo > 0 ? 1024 : 0) | (p.ammo > 1 ? 2048 : 0) | (p.regenT > 0 ? 4096 : 0),
    p.charging ? R0(p.charge * 100) : 0, powerBits(p),
    R0(p.vx), R0(p.vy), R0(p.falling * 100), R0(p.aim * 100),
  ]);
  const R = g.rangs.map(r => [r.id, R0(r.x), R0(r.y), r.owner.i,
    RSTATE.indexOf(r.state) | (r.fire ? 8 : 0) | (r.drill ? 16 : 0) | (r.ice ? 32 : 0) | (r.boom ? 64 : 0) | (r.neutral ? 128 : 0)]);
  const K = g.pickups.map(k => [k.id, k.x, k.y]); // what's inside stays secret until someone grabs it
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
  TILE, MAX_PLAYERS, FLOOR, WALL, CRATE, PIT, TREE, GRASS, ICE, PAD, TEAM_COLORS, TEAM_NAMES, PLAYER_R, PCOLORS, CHARS, POWERS, POWER_KEYS, BOT_DIFF, MAPS, T, RSTATE,
  clamp, lerp, rand, dist2, angDiff, NO_INPUT, has, walkable,
  create, use, buildMap, shapeHit, mapPool, setDims, dims: () => ({ cols: COLS, rows: ROWS, ww: WW, wh: WH }), gridFromString, gridToString, newMatch, step, movePlayer, makeBot, tileAt,
  encodeSnapshot, encodeSelf, encodeInput, decodeInput, bitsToPowers,
};
if (typeof module !== 'undefined' && module.exports) module.exports = Sim; else root.Sim = Sim;
})(typeof self !== 'undefined' ? self : this);
