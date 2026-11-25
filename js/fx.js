// Efeitos visuais ("juice"): partículas, anéis, textos, tremor, flash, zoom e confete.
// Tudo é desenhado no buffer lógico de 270×480, então já sai pixelado.
import { CONFIG } from './config.js';

const { WORLD: { w: W, h: H }, COLORS: C } = CONFIG;
const MAX = 450;
const parts = [], rings = [], texts = [];
const cam = { shake: 0, dx: 0, dy: 0, zoom: 1, zoomTo: 1, fx: W / 2, fy: H / 2 };
let flashA = 0, flashColor = '#fff', flashHalf = -1;
const rnd = (r) => (Array.isArray(r) ? r[0] + Math.random() * (r[1] - r[0]) : r);

// Explosão de `n` partículas. dir/spread em radianos (sem dir = todas as direções).
export function burst(x, y, n, colors, o = {}) {
  for (let i = 0; i < n && parts.length < MAX; i++) {
    const a = o.dir == null ? Math.random() * Math.PI * 2 : o.dir + (Math.random() - 0.5) * (o.spread ?? 1);
    const s = rnd(o.speed ?? [30, 110]);
    parts.push({
      x: x + rnd(o.jitter ?? 0) * (Math.random() - 0.5), y: y + rnd(o.jitter ?? 0) * (Math.random() - 0.5),
      vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rnd(o.life ?? [0.25, 0.6]),
      size: Math.round(rnd(o.size ?? [1, 2])), color: colors[(Math.random() * colors.length) | 0],
      grav: o.grav ?? 0, drag: o.drag ?? 3, shrink: o.shrink ?? true,
    });
  }
}

export function ring(x, y, color, r = 12, life = 0.28) { rings.push({ x, y, color, r, life, t: 0 }); }
export function text(x, y, str, color, size = 18, life = 0.75) { texts.push({ x, y, str, color, size, life, t: 0 }); }
export function shake(a) { cam.shake = Math.max(cam.shake, a); }
export function flash(color, a = 0.5, half = -1) { flashColor = color; flashA = Math.max(flashA, a); flashHalf = half; }
export function zoom(z, x, y) { cam.zoomTo = z; if (x != null) { cam.fx = x; cam.fy = y; } }

// Confete caindo do alto (as peças "giram" trocando a largura).
export function confetti(n, colors = C.confetti) {
  for (let i = 0; i < n && parts.length < MAX; i++) {
    parts.push({
      x: Math.random() * W, y: -10 - Math.random() * 260, vx: (Math.random() - 0.5) * 30, vy: 30 + Math.random() * 50,
      t: 0, life: 6 + Math.random() * 3, size: 2, color: colors[(Math.random() * colors.length) | 0],
      grav: 6, drag: 0.2, shrink: false, conf: Math.random() * 6,
    });
  }
}

export function clear() {
  parts.length = rings.length = texts.length = 0;
  cam.shake = 0; cam.zoom = cam.zoomTo = 1; flashA = 0;
}

export function update(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt;
    if (p.t >= p.life || p.y > H + 20) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
    const k = Math.max(0, 1 - p.drag * dt);
    p.vx *= k; p.vy = p.vy * k + p.grav * dt;
    if (p.conf != null) { p.conf += dt * 7; p.vx += Math.sin(p.conf) * 40 * dt; }
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  for (const list of [rings, texts]) {
    for (let i = list.length - 1; i >= 0; i--) if ((list[i].t += dt) >= list[i].life) list.splice(i, 1);
  }
  cam.shake = Math.max(0, cam.shake - dt * (6 + cam.shake * 6));
  const a = cam.shake;
  cam.dx = a ? Math.round((Math.random() * 2 - 1) * a) : 0;
  cam.dy = a ? Math.round((Math.random() * 2 - 1) * a) : 0;
  cam.zoom += (cam.zoomTo - cam.zoom) * Math.min(1, dt * 7);
  flashA = Math.max(0, flashA - dt * 2.5);
}

// Círculo vazado "pixelado".
function circle(g, x, y, r) {
  const n = Math.max(8, Math.round(r * 5));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    g.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1);
  }
}

function drawPart(g, p) {
  const k = p.t / p.life;
  let w = p.shrink ? Math.max(1, Math.round(p.size * (1 - k) + 0.4)) : p.size, h = w;
  if (p.conf != null) { w = Math.abs(Math.sin(p.conf)) > 0.5 ? 3 : 1; h = 2; }
  g.globalAlpha = p.conf != null ? 1 : k > 0.7 ? 0.5 : 1; // some em "degrau", estilo pixel
  g.fillStyle = p.color;
  g.fillRect(Math.round(p.x - w / 2), Math.round(p.y - h / 2), w, h);
}

// Na tela de vitória o confete é desenhado à parte, por cima do escurecido.
export function drawConfetti(g) {
  for (const p of parts) if (p.conf != null) drawPart(g, p);
  g.globalAlpha = 1;
}

export function draw(g, withConfetti = true) {
  for (const r of rings) {
    const k = r.t / r.life;
    g.globalAlpha = 1 - k;
    g.fillStyle = r.color;
    circle(g, r.x, r.y, 2 + r.r * Math.sqrt(k));
  }
  for (const p of parts) if (withConfetti || p.conf == null) drawPart(g, p);
  g.globalAlpha = 1;
  for (const t of texts) {
    const k = t.t / t.life;
    const s = k < 0.15 ? 0.4 + (k / 0.15) * 0.9 : k < 0.25 ? 1.3 - ((k - 0.15) / 0.1) * 0.3 : 1; // "pop"
    g.save();
    g.translate(Math.round(t.x), Math.round(t.y - k * 14));
    g.scale(s, s);
    g.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
    g.font = `${t.size}px "${CONFIG.FONT}", system-ui, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#1a0f2e';
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [2, 2]]) g.fillText(t.str, ox, oy);
    g.fillStyle = t.color;
    g.fillText(t.str, 0, 0);
    g.restore();
  }
  g.globalAlpha = 1;
}

export function drawFlash(g) {
  if (flashA <= 0.01) return;
  g.globalAlpha = Math.min(1, flashA);
  g.fillStyle = flashColor;
  if (flashHalf < 0) g.fillRect(0, 0, W, H);
  else g.fillRect(0, flashHalf === 0 ? H / 2 : 0, W, H / 2);
  g.globalAlpha = 1;
}

export const camera = () => cam;
