// Bola, raquetes e colisões.
import { CONFIG } from './config.js';

const { BALL, PADDLE, TABLE, POWERS, RULES } = CONFIG;
const DEG = Math.PI / 180;
export const LEFT = TABLE.x, RIGHT = TABLE.x + TABLE.w, CENTER_X = TABLE.x + TABLE.w / 2;
// lado 0 = P1 (embaixo), lado 1 = P2 (em cima)
export const PADDLE_Y = [TABLE.y + TABLE.h + PADDLE.gap, TABLE.y - PADDLE.gap];
export const OUT_Y = [PADDLE_Y[0] + PADDLE.outMargin, PADDLE_Y[1] - PADDLE.outMargin];
const PMIN = LEFT + 6, PMAX = RIGHT - 6;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function createPaddle(side) {
  return { side, x: CENTER_X, y: PADDLE_Y[side], vx: 0, target: CENTER_X, speedMul: 1, frozen: 0, armed: null };
}

export function stepPaddle(p, dt) {
  if (p.frozen > 0) p.frozen = Math.max(0, p.frozen - dt);
  const max = PADDLE.maxSpeed * p.speedMul * (p.frozen > 0 ? POWERS.freezeFactor : 1) * dt;
  const d = clamp(clamp(p.target, PMIN, PMAX) - p.x, -max, max);
  p.x += d;
  p.vx = d / dt;
}

export function createBall() {
  return { x: CENTER_X, y: 0, vx: 0, vy: 0, speed: BALL.startSpeed, curve: 0, smash: false };
}

// Garante componente vertical mínima, pra bola não ficar presa entre as laterais.
function keepVertical(b) {
  const min = b.speed * BALL.minVyFrac;
  if (Math.abs(b.vy) < min) {
    b.vy = (Math.sign(b.vy) || 1) * min;
    b.vx = (Math.sign(b.vx) || 1) * Math.sqrt(Math.max(0, b.speed * b.speed - min * min));
  }
}

// Saque: sai em direção à adversária de quem saca.
export function launchBall(b, server) {
  const ang = (Math.random() * 2 - 1) * RULES.serveMaxDeg * DEG;
  const dir = server === 0 ? -1 : 1;
  b.speed = BALL.startSpeed;
  b.vx = Math.sin(ang) * b.speed;
  b.vy = dir * Math.cos(ang) * b.speed;
  b.curve = 0; b.smash = false;
}

function hit(b, p) {
  const armed = p.armed;
  p.armed = null;
  const off = clamp((b.x - p.x) / (PADDLE.w / 2), -1, 1);
  const ang = off * PADDLE.maxBounceDeg * DEG;
  let speed = Math.min(b.speed * BALL.speedUp, BALL.maxSpeed);
  let cap = BALL.maxSpeed;
  b.smash = false; b.curve = 0;
  if (armed === 'smash') {
    cap = BALL.maxSpeed * POWERS.smashCapMult;
    speed = Math.min(b.speed * POWERS.smashMult, cap);
    b.smash = true;
  }
  const up = p.side === 0 ? -1 : 1;
  let vx = Math.sin(ang) * speed + PADDLE.spin * p.vx;
  let vy = up * Math.cos(ang) * speed;
  const s = Math.hypot(vx, vy), ns = Math.min(s, cap);
  b.vx = vx * ns / s; b.vy = vy * ns / s; b.speed = ns;
  if (armed === 'curve') {
    const dir = Math.sign(p.vx) || (Math.random() < 0.5 ? -1 : 1);
    b.curve = dir * POWERS.curveAccel;
  }
  keepVertical(b);
  b.y = p.y + up * (PADDLE.h / 2 + BALL.radius + 0.5);
  return armed;
}

// Avança a bola um passo. Empurra eventos em `ev`. Retorna o lado que perdeu o ponto, ou -1.
export function stepBall(b, paddles, dt, ev) {
  const r = BALL.radius;
  if (b.curve) {
    b.vx += b.curve * dt;
    const s = Math.hypot(b.vx, b.vy);
    b.vx *= b.speed / s; b.vy *= b.speed / s;
    keepVertical(b);
  }
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  if (b.x - r < LEFT) { b.x = LEFT + r; b.vx = Math.abs(b.vx); if (b.curve < 0) b.curve = -b.curve; ev.push({ type: 'wall' }); }
  else if (b.x + r > RIGHT) { b.x = RIGHT - r; b.vx = -Math.abs(b.vx); if (b.curve > 0) b.curve = -b.curve; ev.push({ type: 'wall' }); }

  for (const p of paddles) {
    const toward = p.side === 0 ? b.vy > 0 : b.vy < 0; // só conta indo na direção dela
    if (!toward) continue;
    if (Math.abs(b.x - p.x) <= PADDLE.w / 2 + r && Math.abs(b.y - p.y) <= PADDLE.h / 2 + r) {
      const power = hit(b, p);
      ev.push({ type: 'hit', side: p.side, power });
    }
  }
  if (b.y > OUT_Y[0]) return 0;
  if (b.y < OUT_Y[1]) return 1;
  return -1;
}
