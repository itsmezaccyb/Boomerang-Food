// Arena checks: node tests/maps.test.js — every spawn clear, everyone can reach everyone, little dead space.
const Sim = require('../sim.js');
const { TILE } = Sim;
let bad = 0;
for (let i = 0; i < Sim.MAPS.length; i++) {
  const m = Sim.MAPS[i];
  const rows = new Set(m.q.map(r => r.length));
  if (rows.size !== 1) { console.log('FAIL', m.name, 'ragged rows', [...rows]); bad++; continue; }
  const b = Sim.buildMap(i, 8);
  const g = Sim.create(); Object.assign(g, { grid: b.grid, shapes: b.shapes, nav: b.nav, cols: b.cols, rows: b.rows }); Sim.use(g);
  const C = b.cols, R = b.rows, open = (x, y) => x >= 0 && y >= 0 && x < C && y < R && Sim.walkable(b.grid[y][x]) && b.grid[y][x] !== Sim.PIT && !b.nav.b[x + y * C];
  const step = (cx, cy, nx, ny) => { const n = b.nav; if (nx > cx) return !n.r[cx + cy * C]; if (nx < cx) return !n.r[nx + ny * C]; if (ny > cy) return !n.d[cx + cy * C]; return !n.d[nx + ny * C]; };
  const reach = (sx, sy) => { const seen = new Uint8Array(C * R), q = [[sx, sy]]; seen[sx + sy * C] = 1;
    for (let h = 0; h < q.length; h++) { const [x, y] = q[h]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (open(nx, ny) && !seen[nx + ny * C] && step(x, y, nx, ny)) { seen[nx + ny * C] = 1; q.push([nx, ny]); } } } return seen; };
  const sp = b.spawns.map(s => [Math.floor(s.x / TILE), Math.floor(s.y / TILE)]);
  const problems = [];
  sp.forEach(([x, y], k) => { if (!open(x, y)) problems.push(`spawn ${k} blocked`); if (Sim.shapeHit(x * TILE + TILE / 2, y * TILE + TILE / 2, PLAYER_SAFE = 26)) problems.push(`spawn ${k} touching a shape`); });
  const seen = reach(sp[0][0], sp[0][1]);
  sp.forEach(([x, y], k) => { if (!seen[x + y * C]) problems.push(`spawn ${k} unreachable from spawn 0`); });
  let total = 0, got = 0; for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) if (open(x, y)) { total++; if (seen[x + y * C]) got++; }
  const crates = b.grid.flat().filter(v => v === Sim.CRATE).length;
  if (got / total < 0.9) problems.push(`only ${(100 * got / total).toFixed(0)}% of floor reachable`);
  console.log((problems.length ? 'FAIL ' : 'ok   ') + m.name.padEnd(15), `${C}x${R}`, `shapes ${b.shapes.length}`.padEnd(10), `boxes ${crates}`.padEnd(9), `reachable ${(100 * got / total).toFixed(0)}%`, problems.join('; '));
  if (problems.length) bad++;
}
process.exit(bad ? 1 : 0);
