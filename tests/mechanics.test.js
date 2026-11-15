// Mechanics tests: node tests/mechanics.test.js
const Sim = require('../sim.js');
let pass = 0, failN = 0;
const ok = (c, m) => { if (c) pass++; else failN++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
const I = (o) => Object.assign({}, Sim.NO_INPUT, o);
const run = (g, sec, f) => { for (let t = 0; t < sec; t += 1 / 120) { if (f) f(t); Sim.step(g, 1 / 120); } };
function setup(map = 4, n = 2, opts, points = 10) {
  const g = Sim.create(); Sim.newMatch(g, Array.from({ length: n }, (_, i) => ({ i, type: 'local', char: i })), points, map, opts);
  g.phase = 'fight'; return g;
}
const own = (g, p) => g.rangs.filter(r => r.owner === p && !r.temp);
const put = (g, o) => { const r = Object.assign({ id: 900 + g.rangs.length, vx: 0, vy: 0, speed: 0, state: 'dropped', traveled: 0, maxDist: 0, spin: 0, t: 0, stateT: 0, immune: null, immuneT: 0, trailD: 0, temp: false, neutral: false }, o); g.rangs.push(r); return r; };
const wallCol = (g, x) => { for (let y = 1; y < g.rows - 1; y++) g.grid[y][x] = 1; };
let g, a, b, c, d, r;

// --- aiming
g = setup(); [a, b] = g.players; b.x = 800; b.y = 500; a.x = 300; a.y = 300;
a.input = I({ throw: true, ax: 0, ay: -1, mx: 1 }); run(g, 0.3); a.input = I({ mx: 1 }); run(g, 1 / 120);
r = own(g, a)[0]; ok(r && Math.abs(Math.atan2(r.vy, r.vx) + Math.PI / 2) < 0.05, 'aim stick direction is kept after letting go, even while running');
g = setup(); [a, b] = g.players; a.x = 300; a.y = 300; b.x = 900; b.y = 60;
a.input = I({ throw: true, my: 1 }); run(g, 0.2); a.input = I({ throw: true, mx: 1 }); run(g, 0.1); a.input = I({ mx: 1 }); run(g, 1 / 120);
r = own(g, a)[0]; ok(r && Math.abs(Math.atan2(r.vy, r.vx)) < 0.05, 'without an aim stick the throw follows the running direction');

// --- outbound: bounces off walls
g = setup(); [a, b] = g.players; b.x = 900; b.y = 560; wallCol(g, 10); a.x = 330; a.y = 216;
a.input = I({ throw: true, ax: 1 }); run(g, 0.6); a.input = I({}); run(g, 0.25);
r = own(g, a)[0]; ok(r && r.vx < 0 && r.bounces >= 1, 'thrown at a wall: it bounces off');
run(g, 2); ok(a.ammo === 1, '...and comes back to you');

// --- coming back: blocked by walls, stuck on the far side
g = setup(); [a, b] = g.players; b.x = 900; b.y = 560; wallCol(g, 10); a.x = 300; a.y = 216;
a.ammo = 0; a.hasRang = false; put(g, { owner: a, x: 700, y: 216, state: 'return', speed: 300 });
run(g, 1.2, () => { a.input = I({}); }); r = own(g, a)[0];
ok(a.ammo === 0 && r && r.state === 'dropped' && r.x > 528, 'returning boomerang gets stuck on the far side of a wall (x=' + (r && Math.round(r.x)) + ')');
run(g, 1, () => { a.input = I({ throw: true }); });
ok(a.ammo === 0, "a call-back can't pass through a wall that fully separates you");
a.x = 650; a.y = 300; b.x = 900; b.y = 560; run(g, 0.05, () => { a.input = I({}); }); // walk around (teleport for the test) into view
// clear line now -> call-back works

// --- call-back with a clear line, deadly
g = setup(); [a, b] = g.players; a.ammo = 0; a.hasRang = false;
put(g, { owner: a, x: 860, y: 216 }); a.x = 100; a.y = 216; b.x = 500; b.y = 216;
run(g, 2, () => { a.input = I({ throw: true }); b.input = I({}); });
ok(a.ammo === 1, 'holding throw with empty hands calls it back (clear line)');
ok(!b.alive && a.score === 1, 'called-back boomerang kills in its path and scores +1');

// --- custom shapes
{
  const ci = Sim.MAPS.findIndex(m => m.name === 'Curvy Cafe');
  g = setup(ci); [a, b] = g.players; b.x = 900; b.y = 560;
  ok(g.shapes.length > 0, 'map shapes are built (' + g.shapes.length + ')');
  const tbl = g.shapes.find(sh => sh.type === 'circle'); // round table
  a.x = tbl.x - tbl.r - 40; a.y = tbl.y; a.input = I({ mx: 1 }); run(g, 0.6);
  ok(Math.hypot(a.x - tbl.x, a.y - tbl.y) >= tbl.r + 15, 'players are blocked by a round table');
  a.x = tbl.x - tbl.r - 60; a.y = tbl.y; a.input = I({ throw: true, ax: 1 }); run(g, 0.05); a.input = I({ mx: -1 }); run(g, 0.25);
  r = own(g, a)[0]; ok(r && r.bounces >= 1 && r.vx < 0, 'boomerangs bounce off a round table');
  const arc = g.shapes.find(sh => sh.type === 'path');
  Sim.use(g); const mid = arc.points[Math.floor(arc.points.length / 2)];
  ok(!!Sim.shapeHit(mid[0], mid[1], 0) && !Sim.shapeHit(mid[0] + 60, mid[1] + 60, 0), 'curved wall is solid along its line only');
}

// --- slash
g = setup(); [a, b] = g.players; a.x = 300; a.y = 216; b.x = 340; b.y = 216;
a.input = I({ slash: true, ax: 1 }); run(g, 0.05); ok(!b.alive && a.score === 1, 'armed slash kills (+1)');
g = setup(); [a, b] = g.players; a.x = 300; a.y = 216; b.x = 340; b.y = 216; a.ammo = 0; a.hasRang = false;
a.input = I({ slash: true, ax: 1 }); run(g, 1 / 120); a.input = I({}); const bx0 = b.x; run(g, 0.3);
ok(b.alive && b.x - bx0 > 30, 'unarmed slash is a shove, not a kill');
g = setup(2); [a, b] = g.players; b.x = 2 * 48 + 24; b.y = 3 * 48 + 24 + 4; a.x = b.x - 36; a.y = b.y; a.ammo = 0; a.hasRang = false; // Sauce Pit: pit to b's right
a.input = I({ slash: true, ax: 1 }); run(g, 1 / 120); a.input = I({}); run(g, 1.2);
ok(!b.alive && a.score === 1, 'shoving someone into a pit counts as your kill');
g = setup(); [a, b] = g.players; a.x = 200; a.y = 216; b.x = 520; b.y = 216;
a.input = I({ throw: true, ax: 1 }); run(g, 0.3); a.input = I({});
let swatted = false;
run(g, 1.2, () => { r = own(g, a)[0]; if (!swatted && r && r.state === 'out' && Math.abs(r.x - b.x) < 60) { b.input = I({ slash: true, ax: -1 }); swatted = true; } else b.input = I({}); });
r = own(g, a)[0]; ok(b.alive && r && r.state === 'dropped', 'slashing an incoming boomerang swats it to the floor');

// --- two hands, grey boomerangs
g = setup(4, 3); [a, b, c] = g.players; a.x = 300; a.y = 216; b.x = 700; b.y = 216; c.x = 900; c.y = 500;
b.ammo = 0; b.hasRang = false; put(g, { owner: b, x: 800, y: 216, state: 'out', vx: 400, vy: 0, speed: 400, maxDist: 400 });
a.input = I({ slash: true, ax: 1 }); a.x = 670; run(g, 0.05);
const greys = g.rangs.filter(r => r.neutral);
ok(!b.alive && greys.length === 1 && greys[0].state === 'dropped', "a knocked-out snack's boomerang turns grey and falls");
c.x = greys[0].x; c.y = greys[0].y; c.input = I({}); run(g, 0.05); ok(c.ammo === 2, 'anyone with a free hand grabs a grey one (now holding 2)');
c.input = I({ throw: true, ax: -1 }); run(g, 0.05); c.input = I({}); run(g, 0.02); ok(c.ammo === 1 && c.hasRang, 'throw one, still holding the other');
run(g, 0.3, () => { c.input = I({ throw: true }); }); ok(c.charging, 'with one still in hand, holding throw charges (no call-back yet)');
g = setup(); [a] = g.players; a.powers = []; g.pickups.push({ id: 5, x: a.x, y: a.y, type: 'extra', t: 0 }); run(g, 1 / 120);
ok(a.ammo === 2, 'Extra Boomerang power-up gives a second boomerang');

// --- explosive is used up, new one appears
g = setup(); [a, b] = g.players; a.x = 200; a.y = 216; b.x = 900; b.y = 560; a.powers = ['boom'];
a.input = I({ throw: true, ax: 1 }); run(g, 0.2); a.input = I({}); run(g, 1.2);
ok(own(g, a).length === 0 && a.ammo === 0 && a.regenT > 0, 'explosive boomerang is used up when it explodes');
run(g, 1.5); ok(a.ammo === 1, 'a new boomerang appears in hand shortly after');

// --- scoring
g = setup(2); [a, b] = g.players; a.score = 3; a.x = 2 * 48 + 24; a.y = 3 * 48 + 24; a.input = I({ mx: 1 }); run(g, 1.2);
ok(!a.alive && a.score === 2, 'walking into a pit on your own costs a point');
g = setup(4, 4, { mode: 'teams' }); [a, b, c, d] = g.players; a.x = 300; a.y = 216; b.x = 340; b.y = 216;
a.input = I({ slash: true, ax: 1 }); run(g, 0.05); ok(a.score === 1 && c.score === 1 && b.score === 0, 'teams share kill points');
g = setup(4, 3, {}, 5); [a, b, c] = g.players; a.score = 4; a.x = 300; a.y = 216; b.x = 340; b.y = 216; c.x = 900; c.y = 500;
const events = []; a.input = I({ slash: true, ax: 1 }); run(g, 1 / 120); run(g, 3, () => { events.push(...g.events.map(e => e[0])); g.events = []; a.input = I({}); });
ok(g.over && events.includes('result') && c.alive, 'reaching the kill target ends the match straight away (others still alive)');

// --- other rules still intact
g = setup(); [a] = g.players; for (const k of ['fire', 'ice', 'multi', 'drill']) { g.pickups.push({ id: 1, x: a.x, y: a.y, type: k, t: 0 }); run(g, 1 / 120); }
ok(a.powers.join() === 'ice,multi,drill', 'powers stack to 3, oldest drops');
g = setup(); [a, b] = g.players; a.x = 100; a.y = 216; b.x = 900; b.y = 560; a.powers = ['teleport'];
a.input = I({ throw: true, ax: 1 }); run(g, 0.4); a.input = I({}); run(g, 0.25); const rx = own(g, a)[0].x; a.input = I({ dash: true }); run(g, 1 / 120);
ok(a.ammo === 1 && Math.abs(a.x - rx) < 20, 'teleport: dash to your boomerang');
g = setup(); [a, b] = g.players; a.x = 100; a.y = 216; b.x = 330; b.y = 420; a.powers = ['tele'];
a.input = I({ throw: true, ax: 1 }); run(g, 0.1); a.input = I({}); run(g, 0.15);
run(g, 1.5, () => { const m = own(g, a)[0]; a.input = m ? I({ throw: true, ax: b.x - m.x, ay: b.y - m.y }) : I({}); });
ok(!b.alive, 'telekinesis steers into a target');
g = setup(); [a, b] = g.players; a.x = 100; a.y = 216; b.x = 900; b.y = 560; a.powers = ['fire'];
a.input = I({ throw: true, ax: 1 }); run(g, 0.4); a.input = I({}); run(g, 0.5);
b.x = g.trails[2].x; b.y = g.trails[2].y; run(g, 0.02); ok(!b.alive && a.score === 1, 'fire trail kills (+1 to thrower)');
g = setup(); [a, b] = g.players; a.x = 100; a.y = 216; b.x = 900; b.y = 560;
a.input = I({ throw: true, ax: 1 }); run(g, 0.3); a.input = I({}); run(g, 1 / 120); run(g, 0.35, () => { a.input = I({ ax: 0, ay: 1 }); });
r = own(g, a)[0]; ok(r && r.y > 216 + 25, 'curve: aim stick bends it after the throw');
g = setup(1); [a, b] = g.players; a.x = 72; a.y = 72; a.powers = ['drill']; b.x = 900; b.y = 500;
a.input = I({ throw: true, ax: 1, ay: 1 }); run(g, 0.5); a.input = I({}); run(g, 2.5); ok(a.ammo === 1, 'drill goes through walls out and back');
g = setup(7); [a, b] = g.players; b.x = 900; b.y = 400; a.x = 2 * 48 + 24; a.y = 2 * 48 - 6; a.input = I({ my: 1 }); run(g, 0.25);
ok(Math.abs(a.x - (17 * 48 + 24)) < 30, 'teleporter pads');
g = setup(); [a] = g.players; a.powers = ['disguise']; a.input = I({}); run(g, 1.4); ok(a.disguised, 'disguise');
g = setup(4, 2, { pull: false }); [a] = g.players; a.ammo = 0; a.hasRang = false; put(g, { owner: a, x: 860, y: 216 });
a.x = 100; a.y = 216; run(g, 1, () => { a.input = I({ throw: true }); }); ok(a.ammo === 0, 'option: call-back off');

// --- countdown
g = Sim.create(); Sim.newMatch(g, [0, 1].map(i => ({ i, type: 'local', char: i })), 10, 4);
let counts = []; for (let t = 0; t < 4.5; t += 1 / 120) { Sim.step(g, 1 / 120); for (const [k, d] of g.events) if (k === 'count' || k === 'go') counts.push(k === 'go' ? 'GO' : d); g.events = []; }
ok(counts.join() === '3,2,1,GO', 'first round has a 3-2-1-GO countdown (' + counts.join() + ')');

// --- gravity call-back around a wall
g = setup(); [a, b] = g.players; b.x = 900; b.y = 560;
for (let y = 0; y < 9; y++) g.grid[y][10] = 1; // wall from the top, gap at the bottom
a.ammo = 0; a.hasRang = false; put(g, { owner: a, x: 700, y: 120 }); a.x = 300; a.y = 120;
run(g, 3, () => { a.input = I({ throw: true }); });
ok(a.ammo === 1, 'call-back finds its way around a wall (like gravity)');

console.log(`\n${pass} passed, ${failN} failed`);
process.exit(failN ? 1 : 0);
