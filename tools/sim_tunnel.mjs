// Uso: node tools/sim_tunnel.mjs
// A bola não pode atravessar a raquete: testa velocidades até o teto do smash, ângulos e pontos de contato.
globalThis.location = { search: '' };
const root = new URL('..', import.meta.url).href.replace(/\/$/, '');
const { CONFIG } = await import(root + '/js/config.js');
const { createBall, createPaddle, stepBall, PADDLE_Y } = await import(root + '/js/physics.js');
const { BALL, PADDLE, POWERS, PHYS } = CONFIG;
const cap = BALL.maxSpeed * POWERS.smashCapMult;
let fail = 0, n = 0;
for (let i = 0; i < 20000; i++) {
  const side = i % 2, p = createPaddle(side), paddles = [createPaddle(0), createPaddle(1)];
  paddles[side] = p;
  const speed = BALL.maxSpeed + Math.random() * (cap - BALL.maxSpeed), ang = (Math.random() * 2 - 1) * 0.3;
  const off = (Math.random() * 2 - 1) * (PADDLE.w / 2 + BALL.radius - 0.6); // contato garantido
  const b = createBall(), dir = side === 0 ? 1 : -1, dist = 40 + Math.random() * 40;
  b.speed = speed; b.vx = Math.sin(ang) * speed; b.vy = dir * Math.cos(ang) * speed;
  const tHit = dist / Math.abs(b.vy);
  b.x = p.x + off - b.vx * tHit; b.y = PADDLE_Y[side] - dir * dist;
  const ev = []; let hit = false;
  for (let k = 0; k < 240 && !hit; k++) {
    stepBall(b, paddles, PHYS.step, ev);
    if (ev.some((e) => e.type === 'hit')) hit = true;
    if ((side === 0 && b.y > PADDLE_Y[0] + 30) || (side === 1 && b.y < PADDLE_Y[1] - 30)) break;
  }
  n++; if (!hit) fail++;
}
console.log(`velocidade até ${cap} px/s (${(cap * PHYS.step).toFixed(2)} px por passo, raio ${BALL.radius}): ${n - fail}/${n} rebatidas, ${fail} atravessaram`);
