// Online: o que o host manda (snapshots e eventos) e a réplica que a convidada desenha.
// A convidada vê tudo girado 180° (x → W−x, y → H−y) e com os lados trocados, pra se ver embaixo:
// o lado 0 da réplica é ela (lado 1 no host). Ela não simula a partida, só interpola o que chega.
import { CONFIG } from './config.js';
import { createBall, createPaddle, clamp } from './physics.js';

const { WORLD: { w: W, h: H }, NET, RULES } = CONFIG;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const lerp = (a, b, k) => a + (b - a) * k;
const flip = (s) => (s >= 0 ? 1 - s : s);

// ---------- Host ----------
export function snapshot(g, ts, slow) {
  const m = g.m, b = m.ball;
  return {
    t: 's', ts: Math.round(ts), ph: m.phase, tm: r2(m.timer), sv: m.server, sc: m.score,
    ls: m.lastScorer, wn: m.winner, ra: m.rally, sl: slow ? 1 : 0,
    b: [r1(b.x), r1(b.y), r1(b.z), r1(b.vx), r1(b.vy), r1(b.speed), b.smash ? 1 : 0, b.curve],
    p: m.paddles.map((p) => [r1(p.x), r1(p.vx), r2(p.swing), r2(p.frozen), p.armed || 0]),
    bar: g.pw.bar, st: g.pw.stored,
  };
}

// Evento da partida pra mandar: hora do passo e, nos rebotes, onde a bola estava (vira quadro-chave).
export function packEvent(e, m, ts) {
  const o = { ...e, ts: Math.round(ts) };
  if (e.type === 'hit' || e.type === 'wall') { o.bx = r1(m.ball.x); o.by = r1(m.ball.y); }
  return o;
}

// ---------- Convidada ----------
// keys: personagens [host, convidada], como o host mandou.
export function createReplica(keys) {
  const m = {
    mode: 'online', keys: [keys[1], keys[0]], level: 'normal',
    score: [0, 0], firstServer: 0, server: 0, phase: 'serve', timer: RULES.serveDelay,
    lastScorer: -1, winner: -1, ball: createBall(), paddles: [createPaddle(0), createPaddle(1)], events: [], rally: 0,
  };
  return {
    m, pw: { bar: [0, 0], stored: [null, null] }, ais: [null, null], remote: [false, true], replica: true,
    snaps: [], bk: [], queue: [], off: null, slow: false, pending: 0,
  };
}

export function pushSnap(R, s, now) {
  const S = R.snaps;
  if (S.length && s.ts <= S[S.length - 1].ts) return;
  S.push(s);
  // Relógio do host: fica com a mensagem que chegou mais rápido e se ajusta devagar se o atraso mudar.
  const o = s.ts - now;
  R.off = R.off == null || o > R.off ? o : R.off + (o - R.off) * 0.02;
  addKey(R, s.ts, s.b[0], s.b[1]);
  // Pausada, ela não consome o buffer (e o host segue mandando): guarda só o último ~3 s.
  if (S.length > 90) S.splice(0, S.length - 90);
  if (R.bk.length > 150) R.bk.splice(0, R.bk.length - 150);
}

export function pushEvents(R, list) {
  for (const e of list) {
    R.queue.push(e);
    if (e.bx != null) addKey(R, e.ts, e.bx, e.by);
  }
}

// Quadros-chave da posição da bola (snapshots + rebotes), em ordem de tempo.
function addKey(R, ts, x, y) {
  const K = R.bk;
  let i = K.length;
  while (i > 0 && K[i - 1].ts > ts) i--;
  K.splice(i, 0, { ts, x, y });
}

function mirrorEvent(e) {
  const o = { ...e };
  if (o.side != null) o.side = flip(o.side);
  if (o.mp != null) o.mp = flip(o.mp);
  if (o.x != null) o.x = W - o.x;
  if (o.y != null) o.y = H - o.y;
  return o;
}

// Atualiza a réplica no instante `now` (menos o buffer). Retorna os eventos que já venceram, espelhados.
export function updateReplica(R, now) {
  const S = R.snaps, due = [];
  if (R.off == null) return due;
  const rt = now + R.off - NET.interpDelay * 1000;
  while (S.length > 2 && S[1].ts <= rt) S.shift();
  const a = S[0], b = S[1] || a;
  const k = b === a ? 0 : clamp((rt - a.ts) / (b.ts - a.ts), 0, 1);
  const m = R.m;
  m.phase = a.ph;
  m.timer = a.ph === b.ph ? lerp(a.tm, b.tm, k) : a.tm;
  m.server = flip(a.sv); m.lastScorer = flip(a.ls); m.winner = flip(a.wn); m.rally = a.ra;
  m.score[0] = a.sc[1]; m.score[1] = a.sc[0];

  const ball = m.ball, ba = a.b, [x, y] = ballAt(R, rt);
  ball.x = W - x; ball.y = H - y;
  ball.z = lerp(ba[2], b.b[2], k);
  ball.vx = -ba[3]; ball.vy = -ba[4]; ball.speed = ba[5]; ball.smash = !!ba[6]; ball.curve = -ba[7];

  for (const v of [0, 1]) {
    const pa = a.p[1 - v], pb = b.p[1 - v], p = m.paddles[v];
    if (v === 1) { p.x = W - lerp(pa[0], pb[0], k); p.vx = -pa[1]; } // a raquete dela (lado 0) é prevista no main
    p.swing = lerp(pa[2], pb[2], k); p.frozen = pa[3]; p.armed = pa[4] || null;
  }

  R.pw.bar[0] = a.bar[1]; R.pw.bar[1] = a.bar[0];
  R.pw.stored[0] = a.st[1]; R.pw.stored[1] = a.st[0];
  // Tocou no poder: o botão some na hora, sem esperar o host confirmar.
  if (R.pending && (!R.pw.stored[0] || now - R.pending > 1500)) R.pending = 0;
  if (R.pending) R.pw.stored[0] = null;
  R.slow = !!a.sl;

  while (R.queue.length && R.queue[0].ts <= rt) due.push(mirrorEvent(R.queue.shift()));
  return due;
}

function ballAt(R, rt) {
  const K = R.bk;
  while (K.length > 2 && K[1].ts <= rt) K.shift();
  const a = K[0], b = K[1] || a;
  if (b === a || rt <= a.ts) return [a.x, a.y];
  const k = Math.min(1, (rt - a.ts) / (b.ts - a.ts));
  return [lerp(a.x, b.x, k), lerp(a.y, b.y, k)];
}
