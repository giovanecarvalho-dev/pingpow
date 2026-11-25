// Sprites (Fase 3): lê assets/sprites.json (gerado por tools/sprites.py) e carrega as imagens.
// Animação que faltar (arquivo ausente ou que não carregou) fica de fora: o render usa o desenho por código.
const anims = {};
let tint = null; // canvas de rascunho pra tingir um quadro (congelado)

export async function loadSprites() {
  let list;
  try {
    const r = await fetch('./assets/sprites.json');
    if (!r.ok) return false;
    list = (await r.json()).anims || {};
  } catch { return false; }
  await Promise.all(Object.entries(list).map(([name, a]) => new Promise((done) => {
    const img = new Image();
    img.onload = () => {
      const [fw, fh] = a.frame || [img.width, img.height];
      const [ax, ay] = a.anchor || [fw / 2, fh];
      anims[name] = { img, fw, fh, frames: Math.max(1, a.frames || 1), fps: a.fps || 0, ax, ay, flip: !!a.flip };
      done();
    };
    img.onerror = () => done();
    img.src = './assets/sprites/' + a.file;
  })));
  return Object.keys(anims).length > 0;
}

export const anim = (name) => anims[name] || null;
export const frameAt = (a, t) => Math.floor(t * a.fps);

// Desenha o quadro `i` com a âncora em (x, y). flip = espelhado na horizontal.
export function drawAnim(g, a, i, x, y, flip = false) {
  const f = ((i % a.frames) + a.frames) % a.frames;
  const dx = Math.round(x - (flip ? a.fw - a.ax : a.ax)), dy = Math.round(y - a.ay);
  if (!flip) { g.drawImage(a.img, f * a.fw, 0, a.fw, a.fh, dx, dy, a.fw, a.fh); return; }
  g.save();
  g.translate(dx + a.fw, dy);
  g.scale(-1, 1);
  g.drawImage(a.img, f * a.fw, 0, a.fw, a.fh, 0, 0, a.fw, a.fh);
  g.restore();
}

// Mesmo quadro, tingido de `color` (só nos pixels do sprite).
export function drawTinted(g, a, i, x, y, flip, color, alpha) {
  if (!tint) tint = document.createElement('canvas');
  if (tint.width < a.fw || tint.height < a.fh) { tint.width = a.fw; tint.height = a.fh; }
  const t = tint.getContext('2d'), ox = flip ? a.fw - a.ax : a.ax;
  t.clearRect(0, 0, tint.width, tint.height);
  t.globalCompositeOperation = 'source-over';
  drawAnim(t, a, i, ox, a.ay, flip);
  t.globalCompositeOperation = 'source-atop';
  t.globalAlpha = alpha;
  t.fillStyle = color;
  t.fillRect(0, 0, a.fw, a.fh);
  t.globalAlpha = 1;
  t.globalCompositeOperation = 'source-over';
  g.drawImage(tint, 0, 0, a.fw, a.fh, Math.round(x - ox), Math.round(y - a.ay), a.fw, a.fh);
}
