// Balance stats from CPU-only matches. node tests/cpu-stats.js [matches]
const Sim = require('../sim.js');
const N = +process.argv[2] || 60;
const st = { rounds: 0, roundTime: 0, kills: {}, throws: 0, sticks: 0, catches: 0, recalls: 0, greyPick: 0, matches: 0, matchTime: 0, longRounds: 0 };
for (let m = 0; m < N; m++) {
  const n = [2, 3, 4, 4, 6, 8][m % 6];
  const g = Sim.create();
  Sim.newMatch(g, Array.from({ length: n }, (_, i) => ({ i, type: 'cpu' + (1 + ((i + m) % 3)), char: i })), 10, -1, { pw: 1 });
  let t = 0, rt = 0;
  while (!g.over && t < 900) {
    Sim.step(g, 1 / 120); t += 1 / 120; rt += 1 / 120;
    for (const [k, d] of g.events) {
      if (k === 'kill') st.kills[d.how] = (st.kills[d.how] || 0) + 1;
      if (k === 'sfx' && d === 'throw') st.throws++;
      if (k === 'sfx' && d === 'catch') st.catches++;
      if (k === 'sfx' && d === 'recall') st.recalls++;
      if (k === 'drop') st.sticks++;
      if (k === 'round' || k === 'result') { if (d.n !== 1) { st.rounds++; st.roundTime += rt; if (rt > 60) st.longRounds++; } rt = 0; }
    }
    g.events = [];
  }
  st.matches++; st.matchTime += t;
}
const kTot = Object.values(st.kills).reduce((a, b) => a + b, 0);
console.log(`matches ${st.matches}, avg match ${(st.matchTime / st.matches).toFixed(0)}s, rounds ${st.rounds}, avg round ${(st.roundTime / st.rounds).toFixed(1)}s, rounds >60s: ${st.longRounds}`);
console.log(`kills ${kTot}: ` + Object.entries(st.kills).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / kTot).toFixed(0)}%`).join(', '));
console.log(`throws ${st.throws}, landed on floor ${(100 * st.sticks / st.throws).toFixed(0)}% of throws, catches ${st.catches}, call-backs ${st.recalls}`);
