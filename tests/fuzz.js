// Stress test: random-input players + CPUs on every arena, all power-ups, both modes. node tests/fuzz.js [matches]
const Sim = require('../sim.js');
const MATCHES = +process.argv[2] || 40;
const { TILE } = Sim;
const fails = {}; const fail = (k, info) => { fails[k] = (fails[k] || 0) + 1; if (fails[k] <= 2) console.log('  !', k, info || ''); };
const solid = (g, x, y) => { const v = g.grid[Math.floor(y / TILE)] && g.grid[Math.floor(y / TILE)][Math.floor(x / TILE)]; return v === undefined || v === 1 || v === 2 || v === 4; };
function randInput(st) {
  if (Math.random() < 0.05) { st.mx = Math.random() * 2 - 1; st.my = Math.random() * 2 - 1; }
  if (Math.random() < 0.04) { st.ax = Math.random() < 0.5 ? 0 : Math.random() * 2 - 1; st.ay = Math.random() * 2 - 1; }
  if (Math.random() < 0.03) st.throw = !st.throw;
  return { mx: st.mx || 0, my: st.my || 0, ax: st.ax || 0, ay: st.ay || 0, throw: !!st.throw, dash: Math.random() < 0.02, slash: Math.random() < 0.02 };
}
let rounds = 0, steps = 0, longest = 0;
for (let m = 0; m < MATCHES; m++) {
  const n = 2 + (m % 7), map = m % Sim.MAPS.length, mode = m % 3 === 0 ? 'teams' : 'ffa';
  const g = Sim.create();
  Sim.newMatch(g, Array.from({ length: n }, (_, i) => ({ i, type: i % 2 ? 'cpu' + (1 + (i % 3)) : 'local', char: i })), 99, map, { mode, pw: 2, pull: m % 4 !== 1 });
  const st = g.players.map(() => ({}));
  let lastRound = g.round, roundT = 0;
  for (let k = 0; k < 120 * 240 && !g.over; k++) {
    for (const p of g.players) if (!p.bot) p.input = randInput(st[p.i]);
    if (k % 600 === 0) for (const p of g.players) { const keys = Sim.POWER_KEYS.filter(x => x !== 'shield' && x !== 'bamboo'); p.powers = [keys[(k / 600 + p.i) % keys.length]]; }
    Sim.step(g, 1 / 120); steps++; g.events = [];
    if (g.round !== lastRound) { rounds++; lastRound = g.round; longest = Math.max(longest, roundT); roundT = 0; } else roundT += 1 / 120;
    if (roundT > 200) { const al = g.players.filter(p => p.alive); fail(al.some(p => p.bot) ? 'round over 200s with a CPU alive' : 'round over 200s (only random-input players left)', `${Sim.MAPS[map].name} n=${n} alive: ${al.map(p => (p.bot ? p.type : 'random') + (p.hidden ? '(grass)' : '') + '@' + (p.x | 0) + ',' + (p.y | 0) + ' ammo' + p.ammo).join(' ')}`); break; }
    if (g.phase !== 'fight' && g.phase !== 'end') continue;
    for (const p of g.players) {
      if (![p.x, p.y, p.vx, p.vy, p.kbx, p.kby, p.face, p.aim].every(Number.isFinite)) fail('NaN player');
      if (!(p.ammo >= 0 && p.ammo <= 2) || p.hasRang !== p.ammo > 0) fail('bad ammo ' + p.ammo);
      if (p.score < 0) fail('negative score');
      if (!p.alive) continue;
      if (solid(g, p.x, p.y)) fail('player inside solid', `${Sim.MAPS[map].name} ${p.x | 0},${p.y | 0}`);
      if (p.powers.length > 3) fail('more than 3 powers');
    }
    for (const r of g.rangs) {
      if (![r.x, r.y, r.vx, r.vy].every(Number.isFinite)) fail('NaN rang');
      if (r.x < 0 || r.y < 0 || r.x > g.cols * TILE || r.y > g.rows * TILE) fail('rang out of arena');
      if (r.state === 'dropped' && solid(g, r.x, r.y)) fail('rang resting inside a wall', `${Sim.MAPS[map].name} ${r.x | 0},${r.y | 0}`);
      if (r.neutral && r.state !== 'dropped') fail('grey rang flying');
    }
    if (g.rangs.length > n * 4 + 4) fail('rang leak ' + g.rangs.length);
    if (g.trails.length > 180 || g.pickups.length > 40 || g.decoys.length > n) fail('array growth');
  }
}
console.log(`fuzz: ${MATCHES} matches, ${rounds} rounds, ${(steps / 120 / 60).toFixed(0)} game-minutes, longest round ${longest.toFixed(0)}s`);
console.log(Object.keys(fails).length ? 'FAILURES ' + JSON.stringify(fails) : 'no invariant failures');
process.exit(Object.keys(fails).length ? 1 : 0);
