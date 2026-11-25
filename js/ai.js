// CPU: controla a raquete de cima (lado 1).
import { CONFIG } from './config.js';
import { LEFT, RIGHT, CENTER_X } from './physics.js';

const { CPU, BALL } = CONFIG;
const rand = (a, b) => a + Math.random() * (b - a);

export function createAI(level) {
  return { cfg: CPU[level] || CPU.normal, coming: null, react: 0, err: 0, aimX: CENTER_X, powerT: -1 };
}

// X em que a bola cruza a linha `y`, com rebotes nas laterais (não sabe da curva).
function predictX(b, y) {
  const t = (y - b.y) / b.vy;
  if (!(t > 0)) return b.x;
  const lo = LEFT + BALL.radius, hi = RIGHT - BALL.radius, span = hi - lo;
  let x = b.x + b.vx * t - lo;
  x = ((x % (2 * span)) + 2 * span) % (2 * span);
  return lo + (x > span ? 2 * span - x : x);
}

export function updateAI(ai, m, pw, dt, usePower) {
  const p = m.paddles[1], b = m.ball, c = ai.cfg;
  const coming = m.phase === 'rally' && b.vy < 0;

  if (coming !== ai.coming) { // nova jogada: sorteia erro e atraso
    ai.coming = coming;
    ai.react = c.delay;
    // Erro cresce com a velocidade da bola: bola rápida = CPU erra mais.
    const k = Math.max(1, b.speed / BALL.startSpeed) ** CPU.errorSpeedExp;
    ai.err = rand(-c.errorPx, c.errorPx) * k;
  }
  ai.react -= dt;

  if (m.phase === 'serve' && m.server === 1) {
    p.speedMul = c.speed;
    p.target = CENTER_X + ai.err;
  } else if (coming) {
    p.speedMul = c.speed;
    if (ai.react <= 0) ai.aimX = predictX(b, p.y) + ai.err;
    p.target = ai.aimX;
  } else {
    p.speedMul = c.speed * CPU.returnSpeed;
    if (ai.react <= 0) p.target = CENTER_X;
  }

  // Poder: usa entre 0,5 e 2 s depois de receber.
  const stored = pw.stored[1];
  if (!stored) { ai.powerT = -1; return; }
  if (ai.powerT < 0) ai.powerT = rand(CPU.powerDelay[0], CPU.powerDelay[1]);
  ai.powerT -= dt;
  if (ai.powerT > 0 || m.phase !== 'rally') return;
  if (stored === 'freeze' && !(b.vy > 0)) return; // congela só com a bola indo pra adversária
  usePower(1);
}
