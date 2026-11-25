// Canvas: mundo em 270×480 desenhado num buffer e escalado sem suavização.
import { CONFIG } from './config.js';
import { clamp } from './physics.js';
import * as fx from './fx.js';
import * as spr from './sprites.js';

const { WORLD: { w: W, h: H }, TABLE: T, COLORS: C, PADDLE, BALL, PLAYERS, RULES, SPRITES } = CONFIG;
const buf = document.createElement('canvas');
buf.width = W; buf.height = H;
const g = buf.getContext('2d');
const bg = document.createElement('canvas'); // cenário estático, desenhado uma vez
bg.width = W; bg.height = H;
let canvas, ctx;
const view = { scale: 1, ox: 0, oy: 0, dpr: 1 };
const trail = [];
let time = 0;
let barTop = C.floor, barBottom = C.floor; // faixas que sobram da tela (letterbox): cor das bordas do cenário
let dimA = 0, dimGrad = null; // escurecido da tela de vitória

export function initRender(c) {
  canvas = c;
  ctx = c.getContext('2d');
  drawBackground(bg.getContext('2d'));
  resize();
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 100));
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);
  if (document.fonts) document.fonts.load(`27px "${CONFIG.FONT}"`).catch(() => {});
}

export function resize() {
  const vw = innerWidth, vh = innerHeight, dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(vw * dpr);
  canvas.height = Math.round(vh * dpr);
  view.dpr = dpr;
  view.scale = Math.min(vw / W, vh / H);
  view.ox = (vw - W * view.scale) / 2;
  view.oy = (vh - H * view.scale) / 2;
  // Mesmo gradiente que era o fundo CSS da vitória (circle at 50% 38%, farthest-corner).
  const cw = canvas.width, ch = canvas.height, cx = cw / 2, cy = ch * 0.38;
  dimGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(cx, Math.max(cy, ch - cy)));
  dimGrad.addColorStop(0, C.overDim[0]);
  dimGrad.addColorStop(0.7, C.overDim[1]);
  dimGrad.addColorStop(1, C.overDim[1]);
}

// Os sprites terminaram de carregar: redesenha o cenário (pode ter o arena_bg).
export function refreshBackground() { drawBackground(bg.getContext('2d')); }

// Coordenadas da tela (CSS px) -> coordenadas lógicas, limitadas ao mundo.
export function toLogical(cx, cy) {
  return { x: clamp((cx - view.ox) / view.scale, 0, W), y: clamp((cy - view.oy) / view.scale, 0, H) };
}

// Disco "pixelado" (sem anti-aliasing).
function disc(x, y, r, color, c = g) {
  c.fillStyle = color;
  x = Math.round(x); y = Math.round(y);
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt(r * r - dy * dy) + 0.3);
    c.fillRect(x - hw, y + dy, hw * 2 + 1, 1);
  }
}

// ---------- Cenário (estático) ----------
// Cor média da primeira e da última linha da arte (pras faixas da tela combinarem com ela).
function edgeColors(img) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const t = c.getContext('2d', { willReadFrequently: true });
  t.drawImage(img, 0, 0, W, H);
  return [0, H - 1].map((y) => {
    const d = t.getImageData(0, y, W, 1).data, n = d.length / 4;
    let r = 0, gr = 0, bl = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; bl += d[i + 2]; }
    return `rgb(${Math.round(r / n)},${Math.round(gr / n)},${Math.round(bl / n)})`;
  });
}

function drawBackground(b) {
  b.fillStyle = C.floor;
  b.fillRect(0, 0, W, H);
  const arena = spr.anim('arena_bg');
  barTop = barBottom = C.floor;
  if (arena) { // piso da arte; a mesa e a rede continuam por código
    b.drawImage(arena.img, 0, 0, W, H);
    [barTop, barBottom] = edgeColors(arena.img);
  } else {
    b.fillStyle = C.floor2; // piso quadriculado
    for (let y = 0; y < H; y += 15) for (let x = ((y / 15) % 2) * 15; x < W; x += 30) b.fillRect(x, y, 15, 15);
    const light = b.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 300); // holofote + vinheta
    light.addColorStop(0, 'rgba(255,255,255,.07)');
    light.addColorStop(0.55, 'rgba(0,0,0,0)');
    light.addColorStop(1, 'rgba(0,0,0,.5)');
    b.fillStyle = light;
    b.fillRect(0, 0, W, H);
  }
  b.fillStyle = 'rgba(0,0,0,.35)'; // sombra da mesa
  b.fillRect(T.x + 6, T.y + 8, T.w, T.h);
  b.fillStyle = C.tableDark; // frente da mesa (espessura)
  b.fillRect(T.x, T.y + T.h, T.w, 5);
  b.fillStyle = C.table;
  b.fillRect(T.x, T.y, T.w, T.h);
  b.fillStyle = C.tableLight; // brilho suave na metade de cima
  b.fillRect(T.x + 2, T.y + 2, T.w - 4, 1);
  for (let i = 0; i < 6; i++) b.fillRect(T.x + 30 + i * 32, T.y + 12 + i * 9, 18, 1);
  b.fillStyle = C.line;
  b.fillRect(T.x, T.y, T.w, 2);
  b.fillRect(T.x, T.y + T.h - 2, T.w, 2);
  b.fillRect(T.x, T.y, 2, T.h);
  b.fillRect(T.x + T.w - 2, T.y, 2, T.h);
  b.fillRect(T.x + T.w / 2, T.y, 1, T.h);
  const ny = T.y + T.h / 2;
  b.fillStyle = C.netShadow;
  b.fillRect(T.x - 4, ny + 1, T.w + 8, 4);
  b.fillStyle = C.net;
  b.fillRect(T.x - 4, ny - 2, T.w + 8, 3);
  b.fillStyle = 'rgba(0,0,0,.18)'; // trama da rede
  for (let x = T.x - 4; x < T.x + T.w + 4; x += 2) b.fillRect(x, ny - 1, 1, 1);
  b.fillStyle = '#cfd3e0'; // postes
  b.fillRect(T.x - 7, ny - 4, 4, 7);
  b.fillRect(T.x + T.w + 3, ny - 4, 4, 7);
}

// ---------- Personagens ----------
// Com sprite: {key}_{back|front}_{idle|run|swing} e {key}_win. Animação que faltar cai na idle; sem idle, desenho por código.
function drawCharSprite(p, key, mood) {
  const view = p.side === 0 ? 'back' : 'front';
  const state = mood === 'win' ? 'win' : mood !== 'play' ? 'idle' : p.swing > 0 ? 'swing' : Math.abs(p.vx) > 30 ? 'run' : 'idle';
  const wanted = state === 'win' ? spr.anim(key + '_win') : spr.anim(`${key}_${view}_${state}`);
  const a = wanted || spr.anim(`${key}_${view}_idle`);
  if (!a) return false;
  // A rebatida acompanha o `swing` da raquete (1 → 0); as outras rodam no fps do sprites.json.
  const i = state === 'swing' && wanted ? Math.min(a.frames - 1, Math.floor((1 - p.swing) * a.frames)) : spr.frameAt(a, time + p.side * 0.37);
  const foot = Math.round(p.y + SPRITES.footY[view]);
  let x = Math.round(p.x), y = foot;
  // Comemoração sem sprite de vitória (ou ponto): pulinhos por código, como nas formas simples.
  if (mood === 'happy' || (mood === 'win' && !wanted)) y -= Math.round(Math.abs(Math.sin(time * (mood === 'win' ? 7 : 10) + p.side)) * (mood === 'win' ? 9 : 5));
  else if (mood === 'sad') y += 1;
  if (p.frozen > 0) x += Math.round(Math.sin(time * 60)); // tremendo de frio
  g.fillStyle = C.shadow;
  g.fillRect(x - 8, foot - 2, 16, 3);
  const flip = a.flip && p.vx < -30;
  if (p.frozen > 0) spr.drawTinted(g, a, i, x, y, flip, C.freeze, 0.5);
  else spr.drawAnim(g, a, i, x, y, flip);
  return true;
}

// mood: 'play' | 'happy' | 'win' | 'sad'
function drawCharacter(p, key, mood) {
  if (drawCharSprite(p, key, mood)) return;
  const P = PLAYERS[key];
  const back = p.side === 0; // P1 (embaixo) aparece de costas; P2 (em cima), de frente
  const dir = back ? 1 : -1; // pra onde fica "atrás" da raquete
  const run = mood === 'play' && Math.abs(p.vx) > 30;
  const baseY = Math.round(p.y + dir * 21);
  let x = Math.round(p.x), y = baseY;
  if (mood === 'win') y -= Math.round(Math.abs(Math.sin(time * 7 + p.side)) * 9);
  else if (mood === 'happy') y -= Math.round(Math.abs(Math.sin(time * 10)) * 5);
  else if (mood === 'play') y += Math.round(Math.sin(time * (run ? 18 : 3) + p.side * 2) * (run ? 1 : 0.6));
  else y += 1;
  if (p.frozen > 0) x += Math.round(Math.sin(time * 60)); // tremendo de frio
  const lean = run ? clamp(Math.round(p.vx / 170), -2, 2) : 0;

  g.fillStyle = C.shadow;
  g.fillRect(x - 7, baseY + 8, 14, 3);
  // pernas (alternam ao correr)
  const st = run ? Math.round(Math.sin(time * 18)) : 0;
  g.fillStyle = '#2a2140';
  g.fillRect(x - 4, y + 5 - Math.max(0, st), 3, 4);
  g.fillRect(x + 1, y + 5 - Math.max(0, -st), 3, 4);
  // corpo
  g.fillStyle = P.color;
  g.fillRect(x - 6 + lean, y - 6, 12, 11);
  g.fillStyle = 'rgba(0,0,0,.2)';
  g.fillRect(x - 6 + lean, y + 4, 12, 1);
  // braços
  g.fillStyle = C.skin;
  if (mood === 'win') { g.fillRect(x - 9 + lean, y - 13, 3, 8); g.fillRect(x + 6 + lean, y - 13, 3, 8); }
  else if (mood === 'sad') { g.fillRect(x - 8 + lean, y - 4, 2, 7); g.fillRect(x + 6 + lean, y - 4, 2, 7); }
  else {
    // braço da raquete vai até o cabo; na rebatida ele "estica"
    const handY = Math.round(p.y + dir * (PADDLE.h / 2 + 2));
    const ax = x + 6 + lean - Math.round(p.swing * 3);
    g.fillRect(ax, Math.min(handY, y - 4), 2, Math.abs(y - 4 - handY) + 1);
    g.fillRect(x - 8 + lean, y - 4, 2, 6);
  }
  // cabeça
  const hx = x + lean, hy = y - 11 + (mood === 'sad' ? 2 : 0);
  if (back) {
    disc(hx, hy, 5, P.hair);
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.fillRect(hx - 2, hy - 4, 3, 1);
    g.fillStyle = P.hair; // rabo de cavalo
    g.fillRect(hx - 1, hy + 4, 3, 3 + Math.round(Math.abs(Math.sin(time * 8)) * (run ? 2 : 0)));
  } else {
    disc(hx, hy, 5, C.skin);
    g.fillStyle = P.hair;
    g.fillRect(hx - 5, hy - 6, 11, 4);
    g.fillRect(hx - 6, hy - 4, 2, 7);
    g.fillRect(hx + 5, hy - 4, 2, 7);
    g.fillStyle = '#2a1a2e'; // olhos
    g.fillRect(hx - 2, hy - 1, 1, 2);
    g.fillRect(hx + 2, hy - 1, 1, 2);
    g.fillStyle = '#c0485e'; // boca
    if (mood === 'sad') g.fillRect(hx - 1, hy + 3, 3, 1);
    else { g.fillRect(hx - 1, hy + 3, 3, 1); if (mood !== 'play') g.fillRect(hx - 1, hy + 2, 3, 1); }
  }
  if (p.frozen > 0) { // gelo por cima
    g.globalAlpha = 0.45;
    g.fillStyle = C.freeze;
    g.fillRect(x - 7 + lean, y - 17, 14, 26);
    g.globalAlpha = 1;
  }
}

function drawPaddle(p, key) {
  const grow = Math.round(p.swing * 4);
  const w = PADDLE.w + grow, h = PADDLE.h;
  let x = Math.round(p.x - w / 2);
  const y = Math.round(p.y - h / 2);
  if (p.frozen > 0) x += Math.round(Math.sin(time * 50));
  if (p.armed) {
    const fire = p.armed === 'smash';
    const pulse = 2 + Math.round((Math.sin(time * 12) + 1) * 1.5);
    g.globalAlpha = 0.5;
    g.fillStyle = fire ? C.fire : C.curve;
    g.fillRect(x - pulse, y - pulse, w + pulse * 2, h + pulse * 2);
    g.globalAlpha = 1;
    if (Math.random() < 0.6) {
      fx.burst(x + Math.random() * w, y + (Math.random() < 0.5 ? 0 : h), 1,
        fire ? [C.fire, C.fire2, C.fire3] : [C.curve, C.curve2, '#fff'],
        { dir: -Math.PI / 2, spread: 1.2, speed: [15, 45], life: [0.25, 0.5], grav: fire ? -40 : 0 });
    }
  }
  g.fillStyle = C.shadow;
  g.fillRect(x + 2, y + 3, w, h);
  g.fillStyle = C.handle; // cabo, do lado da personagem
  g.fillRect(Math.round(p.x) - 2, p.side === 0 ? y + h : y - 4, 4, 4);
  g.fillStyle = p.swing > 0.65 ? '#fff' : p.frozen > 0 ? C.freeze : PLAYERS[key].color;
  g.fillRect(x + 1, y, w - 2, h);
  g.fillRect(x, y + 1, w, h - 2);
  g.fillStyle = 'rgba(255,255,255,.45)';
  g.fillRect(x + 2, y + 1, w - 4, 1);
  g.fillStyle = 'rgba(0,0,0,.22)';
  g.fillRect(x + 1, y + h - 1, w - 2, 1);
  if (p.frozen > 0) {
    g.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) g.fillRect(x + 4 + i * 10, y + ((i + Math.floor(time * 6)) % 2) * 3, 2, 2);
    g.fillStyle = C.freeze; // pingentes de gelo
    for (let i = 0; i < 5; i++) g.fillRect(x + 3 + i * 8, y + h, 2, 2 + (i % 2));
    if (Math.random() < 0.3) fx.burst(x + Math.random() * w, y, 1, ['#fff', C.freeze], { speed: [5, 20], life: [0.3, 0.6] });
  }
}

function drawBall(m) {
  const b = m.ball;
  if (m.phase === 'over' || m.phase === 'point') { trail.length = 0; return; } // a bola "explodiu" no ponto
  const serving = m.phase === 'serve';
  const z = serving ? Math.abs(Math.sin(time * 8)) * 8 : b.z; // no saque ela quica na mão
  const fast = b.speed > BALL.maxSpeed * 0.62;
  if (!serving && (b.smash || b.curve || fast)) {
    trail.push({ x: b.x, y: b.y });
    if (trail.length > 9) trail.shift();
  } else trail.length = 0;
  trail.forEach((t, i) => {
    const k = (i + 1) / trail.length;
    const color = b.smash ? (i % 2 ? C.fire : C.fire2) : b.curve ? (i % 2 ? C.curve : C.curve2) : '#ffffff';
    g.globalAlpha = k * (b.smash || b.curve ? 0.7 : 0.35);
    disc(t.x, t.y, Math.max(1, Math.round(BALL.radius * k)), color);
  });
  g.globalAlpha = 1;
  // sombra: se afasta da bola quanto mais alta ela está
  const sx = Math.round(b.x + z * 0.4), sy = Math.round(b.y + 3 + z * 0.8);
  g.fillStyle = C.shadow;
  g.fillRect(sx - 3, sy - 1, 7, 3);
  g.fillRect(sx - 2, sy - 2, 5, 5);
  const r = BALL.radius + (z > 9 ? 1 : 0);
  const col = b.smash ? (Math.floor(time * 24) % 2 ? C.fire2 : '#fff') : b.curve ? '#f3e0ff' : C.ball;
  const ballSpr = spr.anim('ball');
  if (ballSpr && !(b.smash && col === C.fire2)) spr.drawAnim(g, ballSpr, 0, b.x, b.y); // no smash, pisca com o fogo
  else {
    disc(b.x, b.y, r, col);
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.fillRect(Math.round(b.x) - 1, Math.round(b.y) + r - 1, 3, 1);
    g.fillStyle = '#fff';
    g.fillRect(Math.round(b.x) - 2, Math.round(b.y) - 2, 2, 1);
  }
  if (!serving) {
    if (b.smash) fx.burst(b.x, b.y, 2, [C.fire, C.fire2, C.fire3], { speed: [8, 35], life: [0.18, 0.4], size: [1, 3], grav: -30 });
    else if (b.curve && Math.random() < 0.7) fx.burst(b.x, b.y, 1, [C.curve, C.curve2, '#fff'], { speed: [5, 25], life: [0.3, 0.5] });
  } else {
    // anel de contagem do saque, na cor de quem saca
    const k = clamp(m.timer / RULES.serveDelay, 0, 1), rr = 8 + k * 6, n = 20;
    g.fillStyle = PLAYERS[m.keys[m.server]].color;
    for (let i = 0; i < Math.ceil(n * k); i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      g.fillRect(Math.round(b.x + Math.cos(a) * rr), Math.round(b.y + Math.sin(a) * rr), 1, 1);
    }
  }
}

// Retrato 32×32 (menu e vitória): busto de frente, no mesmo estilo provisório das personagens.
export function drawPortrait(c, key) {
  const a = spr.anim(key + '_portrait');
  if (a) {
    c.canvas.width = a.fw; c.canvas.height = a.fh; // 64×64
    c.imageSmoothingEnabled = false;
    c.drawImage(a.img, 0, 0, a.fw, a.fh, 0, 0, a.fw, a.fh);
    return;
  }
  const P = PLAYERS[key];
  if (c.canvas.width !== 32) c.canvas.width = c.canvas.height = 32;
  c.clearRect(0, 0, 32, 32);
  c.fillStyle = P.color;
  c.fillRect(6, 24, 20, 8);
  c.fillStyle = C.skin;
  c.fillRect(13, 21, 6, 4);
  disc(16, 14, 9, P.hair, c);
  if (key === 'b') disc(16, 4, 4, P.hair, c); // coque
  disc(16, 15, 7, C.skin, c);
  c.fillStyle = P.hair;
  c.fillRect(9, 6, 14, 4);
  c.fillRect(7, 9, 3, key === 'b' ? 7 : 13);
  c.fillRect(22, 9, 3, key === 'b' ? 7 : 13);
  c.fillStyle = '#2a1a2e';
  c.fillRect(12, 14, 2, 3);
  c.fillRect(18, 14, 2, 3);
  c.fillStyle = '#fff';
  c.fillRect(12, 14, 1, 1);
  c.fillRect(18, 14, 1, 1);
  c.fillStyle = '#ff9db5';
  c.fillRect(10, 18, 2, 1);
  c.fillRect(20, 18, 2, 1);
  c.fillStyle = '#c0485e';
  c.fillRect(14, 19, 4, 1);
  c.fillRect(15, 20, 2, 1);
}

function drawHitboxes(m) {
  g.strokeStyle = '#0f0';
  g.lineWidth = 1;
  for (const p of m.paddles) g.strokeRect(p.x - PADDLE.w / 2 + 0.5, p.y - PADDLE.h / 2 + 0.5, PADDLE.w - 1, PADDLE.h - 1);
  g.strokeStyle = '#f0f';
  g.strokeRect(m.ball.x - BALL.radius + 0.5, m.ball.y - BALL.radius + 0.5, BALL.radius * 2 - 1, BALL.radius * 2 - 1);
}

function moodOf(m, s) {
  if (m.phase === 'over') return m.winner === s ? 'win' : 'sad';
  if (m.phase === 'point') return m.lastScorer === s ? 'happy' : 'sad';
  return 'play';
}

export function draw(m, dt, over = false) {
  time += dt;
  fx.update(dt);
  dimA = over ? Math.min(1, dimA + dt / CONFIG.FX.overFade) : 0;
  g.drawImage(bg, 0, 0);
  if (m) {
    const [p1, p2] = m.paddles;
    drawCharacter(p2, m.keys[1], moodOf(m, 1));
    drawPaddle(p2, m.keys[1]);
    drawBall(m);
    drawCharacter(p1, m.keys[0], moodOf(m, 0));
    drawPaddle(p1, m.keys[0]);
    if (CONFIG.DEBUG) drawHitboxes(m);
  }
  fx.draw(g, !dimA);
  fx.drawFlash(g);
  // Tela: fundo nas faixas + buffer escalado (com tremor e zoom da câmera).
  const cam = fx.camera();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const half = Math.round(canvas.height / 2);
  ctx.fillStyle = barTop;
  ctx.fillRect(0, 0, canvas.width, half);
  ctx.fillStyle = barBottom;
  ctx.fillRect(0, half, canvas.width, canvas.height - half);
  ctx.imageSmoothingEnabled = false;
  const s = view.scale * view.dpr;
  const sw = W / cam.zoom, sh = H / cam.zoom;
  const sx = clamp(cam.fx - sw / 2, 0, W - sw), sy = clamp(cam.fy - sh / 2, 0, H - sh);
  const blit = () => ctx.drawImage(buf, sx, sy, sw, sh,
    Math.round(view.ox * view.dpr + cam.dx * s), Math.round(view.oy * view.dpr + cam.dy * s), Math.round(W * s), Math.round(H * s));
  blit();
  // Vitória: escurecido aqui (e não no CSS) pro confete cair por cima dele.
  if (dimA) {
    ctx.globalAlpha = dimA;
    ctx.fillStyle = dimGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = 1;
    g.clearRect(0, 0, W, H);
    fx.drawConfetti(g);
    blit();
  }
}
