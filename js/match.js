// Regras, placar, saque e fluxo da partida.
import { CONFIG } from './config.js';
import { createBall, createPaddle, stepBall, stepPaddle, launchBall, PADDLE_Y } from './physics.js';

const { RULES, BALL, PADDLE } = CONFIG;

// mode: 'local' | 'cpu'. keys: [personagem da P1, personagem da P2]
export function createMatch(mode, keys, level = 'normal') {
  const first = Math.random() < 0.5 ? 0 : 1;
  const m = {
    mode, keys, level,
    score: [0, 0], firstServer: first, server: first,
    phase: 'serve', timer: RULES.serveDelay, // serve | rally | point | over
    lastScorer: -1, winner: -1,
    ball: createBall(),
    paddles: [createPaddle(0), createPaddle(1)],
    events: [], rally: 0,
  };
  m.events.push({ type: 'serve', side: first, mp: -1 });
  return m;
}

function placeOnServer(m) {
  const p = m.paddles[m.server];
  m.ball.x = p.x;
  m.ball.y = PADDLE_Y[m.server] + (m.server === 0 ? -1 : 1) * (PADDLE.h / 2 + BALL.radius + 6);
  m.ball.vx = m.ball.vy = 0;
}

export function isWin(a, b) {
  return a >= RULES.pointsToWin && a - b >= RULES.winBy;
}

// Lado que fecha a partida se marcar o próximo ponto (-1 = ninguém).
export function matchPointSide(m) {
  const [a, b] = m.score;
  return isWin(a + 1, b) ? 0 : isWin(b + 1, a) ? 1 : -1;
}

export function updateMatch(m, dt) {
  for (const p of m.paddles) stepPaddle(p, dt);

  if (m.phase === 'serve') {
    placeOnServer(m);
    m.timer -= dt;
    if (m.timer <= 0) {
      launchBall(m.ball, m.server);
      m.phase = 'rally';
      m.events.push({ type: 'launch', side: m.server });
    }
  } else if (m.phase === 'rally') {
    const lost = stepBall(m.ball, m.paddles, dt, m.events);
    for (const e of m.events) if (e.type === 'hit') e.rally = ++m.rally;
    if (lost >= 0) {
      const scorer = 1 - lost;
      m.score[scorer]++;
      m.lastScorer = scorer;
      const rally = m.rally;
      m.rally = 0;
      const final = isWin(m.score[scorer], m.score[lost]);
      m.phase = 'point';
      m.timer = final ? RULES.finalPause : RULES.pointPause;
      m.events.push({ type: 'point', side: scorer, x: m.ball.x, y: m.ball.y, final, rally });
    }
  } else if (m.phase === 'point') {
    m.timer -= dt;
    if (m.timer <= 0) {
      const [a, b] = m.score;
      if (isWin(a, b) || isWin(b, a)) {
        m.winner = a > b ? 0 : 1;
        m.phase = 'over';
        m.events.push({ type: 'win', side: m.winner });
      } else {
        const total = a + b;
        m.server = (m.firstServer + Math.floor(total / RULES.serveEvery)) % 2;
        m.phase = 'serve';
        m.timer = RULES.serveDelay;
        m.ball.curve = 0; m.ball.smash = false;
        m.events.push({ type: 'serve', side: m.server, mp: matchPointSide(m) });
      }
    }
  }
}
