// Simula partidas com o código real do jogo (física, regras, CPU, poderes), sem render.
// Uso: node tools/sim_cpu.mjs ['<json de overrides>'] [easy|normal|hard]  ex.: '{"CPU":{"rubber":0}}'
globalThis.location = { search: '' };
const root = new URL('..', import.meta.url).href.replace(/\/$/, '');
const ov = JSON.parse(process.argv[2] || '{}'), level = process.argv[3] || 'normal';
const { CONFIG } = await import(root + '/js/config.js');
for (const [k, v] of Object.entries(ov)) Object.assign(CONFIG[k], v);
const { createMatch, updateMatch } = await import(root + '/js/match.js');
const { createAI, updateAI } = await import(root + '/js/ai.js');
const { createPowers, onHit, activate } = await import(root + '/js/powers.js');
// "Humana" casual: reage em 0,2 s, erra pouco, às vezes vacila.
CONFIG.CPU.human = { speed: 1, errorPx: 7, delay: 0.2, aim: 0.3, aimMax: 0.5, miss: 0.05 };
const dt = CONFIG.PHYS.step;
let t = 0, pts = [0, 0], cross = [], first = [], rallyT = [], hitsPerPt = [];
for (let game = 0; game < 30; game++) {
  const m = createMatch('cpu', ['a', 'b'], level), pw = createPowers();
  const ais = [createAI('human', 0), createAI(level, 1)];
  let lastHit = null, rs = 0, hits = 0, n = 0;
  while (m.phase !== 'over' && n++ < 240 * 900) {
    for (const s of [0, 1]) updateAI(ais[s], m, pw, dt, (side) => activate(pw, m, side));
    updateMatch(m, dt); t += dt;
    for (const e of m.events) {
      if (e.type === 'launch') { lastHit = t; rs = t; hits = 0; }
      if (e.type === 'hit') { const c = t - lastHit; cross.push(c); if (hits === 0) first.push(c); lastHit = t; hits++; onHit(pw, e.side); }
      if (e.type === 'point') { pts[e.side]++; rallyT.push(t - rs); hitsPerPt.push(hits); }
    }
    m.events.length = 0;
  }
}
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`CPU ${level}: travessia média ${avg(cross).toFixed(2)} s · 1ª travessia (saque) ${avg(first).toFixed(2)} s · rally ${avg(rallyT).toFixed(1)} s (${avg(hitsPerPt).toFixed(1)} rebatidas) · humana ganha ${(100 * pts[0] / (pts[0] + pts[1])).toFixed(0)}% dos pontos · ${(60 * (pts[0] + pts[1]) / t).toFixed(1)} pontos/min`);
