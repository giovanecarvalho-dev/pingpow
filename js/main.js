// Boot, loop de passo fixo e máquina de estados.
import { CONFIG } from './config.js';
import { initInput, applyInput, setSingleSide, resetInput } from './input.js';
import { createMatch, updateMatch } from './match.js';
import { initRender, draw, toLogical } from './render.js';
import * as ui from './ui.js';

const { PHYS, TEXTS, PLAYERS } = CONFIG;
let state = 'BOOT'; // BOOT | MENU | PLAYING | PAUSED | GAME_OVER (POINT = fase da partida)
let match = null;
let last = 0, acc = 0, fpsT = 0, fpsN = 0;
let pausedByRotate = false;

function nameOf(side) {
  const n = PLAYERS[match.keys[side]].name;
  return match.mode === 'cpu' && side === 1 ? `${n} (${TEXTS.cpuName})` : n;
}

function startMatch(mode, level) {
  const who = ui.getWho();
  const other = who === 'a' ? 'b' : 'a';
  match = createMatch(mode, [who, other], level);
  setSingleSide(mode === 'cpu');
  resetInput();
  ui.setHud(match, true);
  ui.show(null);
  state = 'PLAYING';
}

function toMenu() {
  match = null;
  ui.setHud(null, false);
  ui.show('menu');
  state = 'MENU';
}

function pause() {
  if (state !== 'PLAYING') return;
  state = 'PAUSED';
  ui.show('pause');
}

function resume() {
  if (state !== 'PAUSED' || isLandscape()) return;
  state = 'PLAYING';
  resetInput();
  ui.show(null);
  last = performance.now();
}

function usePower(side) {
  if (state !== 'PLAYING') return;
  // Fase 1, etapa 2: poderes.
}

function handleEvents() {
  for (const e of match.events) {
    if (e.type === 'serve') ui.toast(ui.fill(TEXTS.serve, nameOf(e.side)), CONFIG.RULES.serveDelay);
    else if (e.type === 'point') ui.toast(ui.fill(TEXTS.point, nameOf(e.side)), CONFIG.RULES.pointPause);
    else if (e.type === 'win') { state = 'GAME_OVER'; ui.showOver(match); }
  }
  match.events.length = 0;
}

function step(dt) {
  applyInput(match.paddles[0]);
  if (match.mode === 'local') applyInput(match.paddles[1]);
  updateMatch(match, dt);
  handleEvents();
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, PHYS.maxFrame);
  last = now;
  if (state === 'PLAYING') {
    acc += dt;
    while (acc >= PHYS.step && state === 'PLAYING') { step(PHYS.step); acc -= PHYS.step; }
    ui.updateHud(match, null);
  } else acc = 0;
  draw(match, dt);
  if (CONFIG.DEBUG) {
    fpsT += dt; fpsN++;
    if (fpsT >= 0.5) { ui.setFps(Math.round(fpsN / fpsT)); fpsT = 0; fpsN = 0; }
  }
  requestAnimationFrame(frame);
}

// ---------- Orientação e visibilidade ----------
const touchDevice = matchMedia('(pointer: coarse)').matches;
function isLandscape() { return touchDevice && innerWidth > innerHeight; }
function checkOrientation() {
  const land = isLandscape();
  ui.setRotate(land);
  if (land && state === 'PLAYING') { pause(); pausedByRotate = true; }
  if (!land && pausedByRotate) pausedByRotate = false; // continua pausado; ela toca em Continuar
}
addEventListener('resize', checkOrientation);
addEventListener('orientationchange', () => setTimeout(checkOrientation, 100));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---------- Boot ----------
initRender(document.getElementById('game'));
initInput(toLogical, usePower);
ui.initUI({
  boot: () => { toMenu(); ui.maybeInstallHint(); },
  start: startMatch,
  pause, resume, menu: toMenu,
  rematch: () => startMatch(match.mode, match.level),
  power: usePower,
  mute: () => false,
});
checkOrientation();
last = performance.now();
requestAnimationFrame(frame);
