// Pointer multitouch + teclado de debug.
import { CONFIG } from './config.js';

const H = CONFIG.WORLD.h;
const pointers = new Map(); // pointerId -> { side, x }
const keys = new Set();
let toLogical = (x, y) => ({ x, y });
let singleSide = false; // modo CPU: qualquer toque controla a P1
let onPower = () => {};

export const targets = [null, null]; // X alvo de cada lado vindo do toque (null = sem toque)

export function initInput(mapFn, powerCb) {
  toLogical = mapFn;
  onPower = powerCb;

  addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('button, input, .screen, #install-hint, #net-wait, #notice')) return;
    const p = toLogical(e.clientX, e.clientY);
    const side = singleSide ? 0 : (p.y >= H / 2 ? 0 : 1);
    pointers.set(e.pointerId, { side });
    targets[side] = p.x;
  });
  addEventListener('pointermove', (e) => {
    const ptr = pointers.get(e.pointerId);
    if (!ptr) return;
    targets[ptr.side] = toLogical(e.clientX, e.clientY).x;
  });
  const end = (e) => pointers.delete(e.pointerId);
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);

  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return; // digitando o código da sala
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyW') onPower(0);
    if (e.code === 'ArrowUp') onPower(1);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // iOS: sem rolagem, zoom por pinça ou duplo toque.
  document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  let lastEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastEnd < 300 && !(e.target.closest && e.target.closest('button'))) e.preventDefault();
    lastEnd = now;
  }, { passive: false });
}

export function setSingleSide(v) { singleSide = v; }
export function resetInput() { pointers.clear(); targets[0] = targets[1] = null; }

// Aplica o input na raquete do lado indicado.
export function applyInput(paddle) {
  const s = paddle.side;
  const left = s === 0 ? 'KeyA' : 'ArrowLeft', right = s === 0 ? 'KeyD' : 'ArrowRight';
  const dir = (keys.has(right) ? 1 : 0) - (keys.has(left) ? 1 : 0);
  if (dir) { paddle.target = paddle.x + dir * 200; targets[s] = null; }
  else if (targets[s] != null) paddle.target = targets[s];
  else paddle.target = paddle.x;
}
