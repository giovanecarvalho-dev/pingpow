// CPU: controla a raquete de um lado (0 = embaixo, 1 = em cima).
// Modelo "humano": prevê onde a bola cruza a linha dela (com rebotes), reage com atraso,
// erra mais com bola rápida, mira longe da adversária e usa os poderes com alguma tática.
import { CONFIG } from './config.js';
import { LEFT, RIGHT, CENTER_X, PADDLE_Y, clamp } from './physics.js';

const { CPU, BALL, PADDLE } = CONFIG;
const DEG = Math.PI / 180;
const rand = (a, b) => a + Math.random() * (b - a);

export function createAI(level, side = 1) {
  return { side, cfg: CPU[level] || CPU.normal, coming: null, react: 0, err: 0,
    aim: 0, aimed: false, aimX: CENTER_X, powerT: -1, powerWait: 0, t: Math.random() * 9 };
}

// X em que a bola cruza a linha `y`, com rebotes nas laterais (não sabe da curva).
export function predictX(b, y) {
  const t = (y - b.y) / b.vy;
  if (!(t > 0)) return b.x;
  const lo = LEFT + BALL.radius, hi = RIGHT - BALL.radius, span = hi - lo;
  let x = b.x + b.vx * t - lo;
  x = ((x % (2 * span)) + 2 * span) % (2 * span);
  return lo + (x > span ? 2 * span - x : x);
}

// Testa pontos da raquete e escolhe o que manda a bola mais longe da adversária.
// Retorna o deslocamento (-1..1) do ponto de contato em relação ao centro da raquete.
function chooseAim(ai, m, hitX) {
  const s = ai.side, foe = m.paddles[1 - s], b = m.ball, max = ai.cfg.aimMax;
  const speed = Math.min(b.speed * BALL.speedUp, BALL.maxSpeed);
  const from = { x: hitX, y: PADDLE_Y[s], vx: 0, vy: 0 };
  let best = 0, bestScore = -Infinity;
  for (let i = -4; i <= 4; i++) {
    const off = (i / 4) * max, ang = off * PADDLE.maxBounceDeg * DEG;
    from.vx = Math.sin(ang) * speed;
    from.vy = (s === 0 ? -1 : 1) * Math.cos(ang) * speed;
    const land = predictX(from, PADDLE_Y[1 - s]);
    const score = Math.abs(land - foe.x) + rand(0, 18) - Math.abs(off) * 6; // um pouco de acaso
    if (score > bestScore) { bestScore = score; best = off; }
  }
  return best;
}

export function updateAI(ai, m, pw, dt, usePower) {
  const s = ai.side, p = m.paddles[s], b = m.ball, c = ai.cfg;
  const coming = m.phase === 'rally' && (s === 1 ? b.vy < 0 : b.vy > 0);
  ai.t += dt;

  if (coming !== ai.coming) { // nova jogada: sorteia erro e atraso
    ai.coming = coming;
    ai.react = c.delay * rand(0.8, 1.3);
    // Erro cresce com a velocidade da bola: bola rápida = CPU erra mais.
    const k = Math.max(1, b.speed / BALL.startSpeed) ** CPU.errorSpeedExp;
    // Elástico: quem está na frente no placar erra um pouco mais; quem está atrás, menos.
    const lead = clamp(m.score[s] - m.score[1 - s], -3, 3);
    const rub = 1 + lead * CPU.rubber;
    ai.err = rand(-c.errorPx, c.errorPx) * k * rub;
    // Vacilo: de vez em quando calcula bem errado (e a bola passa raspando).
    if (coming && Math.random() < c.miss * rub) ai.err = (Math.random() < 0.5 ? -1 : 1) * rand(PADDLE.w / 2 + 7, PADDLE.w / 2 + 18);
    ai.aim = 0;
    ai.aimed = !(coming && Math.random() < (p.armed ? Math.min(1, c.aim + 0.3) : c.aim));
  }
  ai.react -= dt;

  if (m.phase === 'serve' && m.server === s) {
    // Saque: balança um pouco, como quem escolhe o canto.
    p.speedMul = c.speed * 0.5;
    p.target = CENTER_X + Math.sin(ai.t * 2.2) * 14;
  } else if (coming) {
    p.speedMul = c.speed;
    if (ai.react <= 0) {
      const x = predictX(b, p.y);
      if (!ai.aimed) { ai.aim = chooseAim(ai, m, x); ai.aimed = true; }
      // Pra rebater com o ponto `aim` da raquete, ela fica deslocada pro outro lado.
      ai.aimX = x - ai.aim * (PADDLE.w / 2) + ai.err;
    }
    p.target = ai.aimX;
  } else {
    p.speedMul = c.speed * CPU.returnSpeed;
    if (ai.react <= 0) p.target = CENTER_X + Math.sin(ai.t * 1.3) * 6;
  }

  // Poder: usa entre 0,5 e 2 s depois de receber.
  const stored = pw.stored[s];
  if (!stored) { ai.powerT = -1; ai.powerWait = 0; return; }
  if (ai.powerT < 0) ai.powerT = rand(CPU.powerDelay[0], CPU.powerDelay[1]);
  ai.powerT -= dt;
  if (ai.powerT > 0 || m.phase !== 'rally') return;
  if (stored === 'freeze') {
    const toFoe = s === 1 ? b.vy > 0 : b.vy < 0;
    if (!toFoe) return; // congela só com a bola indo pra adversária
    // Esperta: espera a bola ir pra longe da adversária (no máximo 3 s a mais).
    const foe = m.paddles[1 - s];
    ai.powerWait += dt;
    if (c.aim > 0.5 && ai.powerWait < 3 && Math.abs(predictX(b, foe.y) - foe.x) < 30) return;
  }
  usePower(s);
}
