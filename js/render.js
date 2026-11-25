// Canvas: mundo em 270×480 desenhado num buffer e escalado sem suavização.
import { CONFIG } from './config.js';
import { clamp } from './physics.js';

const { WORLD: { w: W, h: H }, TABLE: T, COLORS: C, PADDLE, BALL, PLAYERS } = CONFIG;
const buf = document.createElement('canvas');
buf.width = W; buf.height = H;
const g = buf.getContext('2d');
let canvas, ctx;
const view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
const trail = [];
let time = 0;

export function initRender(c) {
  canvas = c;
  ctx = c.getContext('2d');
  resize();
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 100));
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);
}

export function resize() {
  const vw = innerWidth, vh = innerHeight, dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  view.dpr = dpr;
  view.scale = Math.min(vw / W, vh / H);
  view.ox = (vw - W * view.scale) / 2;
  view.oy = (vh - H * view.scale) / 2;
}

// Coordenadas da tela (CSS px) -> coordenadas lógicas, limitadas ao mundo.
export function toLogical(cx, cy) {
  return { x: clamp((cx - view.ox) / view.scale, 0, W), y: clamp((cy - view.oy) / view.scale, 0, H) };
}

// Disco "pixelado" (sem anti-aliasing).
function disc(x, y, r, color) {
  g.fillStyle = color;
  x = Math.round(x); y = Math.round(y);
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt(r * r - dy * dy) + 0.3);
    g.fillRect(x - hw, y + dy, hw * 2 + 1, 1);
  }
}

function drawTable() {
  g.fillStyle = C.floor;
  g.fillRect(0, 0, W, H);
  g.fillStyle = C.tableDark;
  g.fillRect(T.x + 3, T.y + 4, T.w, T.h); // "lateral" da mesa
  g.fillStyle = C.table;
  g.fillRect(T.x, T.y, T.w, T.h);
  g.fillStyle = C.line;
  g.fillRect(T.x, T.y, T.w, 2);
  g.fillRect(T.x, T.y + T.h - 2, T.w, 2);
  g.fillRect(T.x, T.y, 2, T.h);
  g.fillRect(T.x + T.w - 2, T.y, 2, T.h);
  g.fillRect(T.x + T.w / 2, T.y, 1, T.h);
  const ny = T.y + T.h / 2;
  g.fillStyle = C.netShadow;
  g.fillRect(T.x - 4, ny + 1, T.w + 8, 3);
  g.fillStyle = C.net;
  g.fillRect(T.x - 4, ny - 1, T.w + 8, 2);
  g.fillRect(T.x - 6, ny - 3, 3, 6);
  g.fillRect(T.x + T.w + 3, ny - 3, 3, 6);
}

// Personagem provisória: corpo e cabeça atrás da raquete.
function drawCharacter(p, key) {
  const color = PLAYERS[key].color;
  const dir = p.side === 0 ? 1 : -1; // pra onde fica "atrás"
  const cx = Math.round(p.x), cy = Math.round(p.y + dir * 18);
  g.fillStyle = C.shadow;
  g.fillRect(cx - 8, cy + dir * 4 - 1, 16, 3);
  g.fillStyle = color;
  g.fillRect(cx - 6, cy - 6, 12, 12);
  disc(cx, cy + dir * 9, 5, C.skin);
  g.fillStyle = color;
  g.fillRect(cx - 5, cy + dir * 9 + (dir > 0 ? 1 : -5), 10, 4); // cabelo/franja
}

function drawPaddle(p, key) {
  const x = Math.round(p.x - PADDLE.w / 2), y = Math.round(p.y - PADDLE.h / 2);
  if (p.armed) {
    const pulse = 2 + Math.round((Math.sin(time * 12) + 1) * 1.5);
    g.globalAlpha = 0.55;
    g.fillStyle = p.armed === 'smash' ? C.fire : C.curve;
    g.fillRect(x - pulse, y - pulse, PADDLE.w + pulse * 2, PADDLE.h + pulse * 2);
    g.globalAlpha = 1;
  }
  g.fillStyle = C.shadow;
  g.fillRect(x + 2, y + 3, PADDLE.w, PADDLE.h);
  g.fillStyle = p.frozen > 0 ? C.freeze : PLAYERS[key].color;
  g.fillRect(x, y, PADDLE.w, PADDLE.h);
  g.fillStyle = 'rgba(255,255,255,.45)';
  g.fillRect(x, y, PADDLE.w, 1);
  if (p.frozen > 0) {
    g.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) g.fillRect(x + 4 + i * 10, y + ((i + Math.floor(time * 6)) % 2) * 3, 2, 2);
  }
}

function drawBall(b, phase) {
  if (phase === 'over') return;
  if (b.smash || b.curve) {
    trail.push({ x: b.x, y: b.y });
    if (trail.length > 10) trail.shift();
  } else trail.length = 0;
  trail.forEach((t, i) => {
    const k = (i + 1) / trail.length;
    const color = b.smash ? (i % 2 ? C.fire : C.fire2) : C.curve;
    g.globalAlpha = k * 0.7;
    disc(t.x, t.y, Math.max(1, Math.round(BALL.radius * k)), color);
  });
  g.globalAlpha = 1;
  g.fillStyle = C.shadow;
  g.fillRect(Math.round(b.x - BALL.radius + 2), Math.round(b.y + 3), BALL.radius * 2, 3);
  disc(b.x, b.y, BALL.radius, C.ball);
}

function drawHitboxes(m) {
  g.strokeStyle = '#0f0';
  g.lineWidth = 1;
  for (const p of m.paddles) g.strokeRect(p.x - PADDLE.w / 2 + 0.5, p.y - PADDLE.h / 2 + 0.5, PADDLE.w - 1, PADDLE.h - 1);
  g.strokeStyle = '#f0f';
  g.strokeRect(m.ball.x - BALL.radius + 0.5, m.ball.y - BALL.radius + 0.5, BALL.radius * 2 - 1, BALL.radius * 2 - 1);
}

export function draw(m, dt) {
  time += dt;
  drawTable();
  if (m) {
    const [p1, p2] = m.paddles;
    drawCharacter(p2, m.keys[1]);
    drawPaddle(p2, m.keys[1]);
    drawBall(m.ball, m.phase);
    drawCharacter(p1, m.keys[0]);
    drawPaddle(p1, m.keys[0]);
    if (CONFIG.DEBUG) drawHitboxes(m);
  }
  // Tela: fundo nas faixas + buffer escalado.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = C.floor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const s = view.scale * view.dpr;
  ctx.drawImage(buf, Math.round(view.ox * view.dpr), Math.round(view.oy * view.dpr), Math.round(W * s), Math.round(H * s));
}

