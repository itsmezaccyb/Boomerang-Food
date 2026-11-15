// Prints an arena as text: # wall/tree, c box, o pit, X shape-covered, . reachable from spawn 0, ? unreachable, | and _ = blocked steps
const Sim = require('../sim.js');
const name = process.argv[2]; const i = Sim.MAPS.findIndex(m => m.name === name);
const b = Sim.buildMap(i, 8), C = b.cols, R = b.rows, g = Sim.create(); Object.assign(g, { grid: b.grid, shapes: b.shapes, nav: b.nav, cols: C, rows: R }); Sim.use(g);
const open = (x, y) => x >= 0 && y >= 0 && x < C && y < R && Sim.walkable(b.grid[y][x]) && b.grid[y][x] !== Sim.PIT && !b.nav.b[x + y * C];
const seen = new Uint8Array(C * R); const s0 = b.spawns[0]; const q = [[Math.floor(s0.x / 48), Math.floor(s0.y / 48)]]; seen[q[0][0] + q[0][1] * C] = 1;
for (let h = 0; h < q.length; h++) { const [x, y] = q[h]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!open(nx, ny) || seen[nx + ny * C]) continue;
  const ok = nx > x ? !b.nav.r[x + y * C] : nx < x ? !b.nav.r[nx + ny * C] : ny > y ? !b.nav.d[x + y * C] : !b.nav.d[nx + ny * C]; if (ok) { seen[nx + ny * C] = 1; q.push([nx, ny]); } } }
const sp = new Set(b.spawns.map(s => Math.floor(s.x / 48) + ',' + Math.floor(s.y / 48)));
for (let y = 0; y < R; y++) { let line = ''; for (let x = 0; x < C; x++) { const v = b.grid[y][x];
  let ch = v === 1 || v === 4 ? '#' : v === 2 ? 'c' : v === 3 ? 'o' : b.nav.b[x + y * C] ? 'X' : sp.has(x + ',' + y) ? 'S' : seen[x + y * C] ? '.' : '?';
  line += ch + (b.nav.r[x + y * C] && x < C - 1 ? '|' : ' '); } console.log(line); }
