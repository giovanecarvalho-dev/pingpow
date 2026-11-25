// Boot, loop de passo fixo e máquina de estados.
import { CONFIG } from './config.js';
import { initInput, applyInput, setSingleSide, resetInput } from './input.js';
import { createMatch, updateMatch } from './match.js';
import { initRender, draw, toLogical } from './render.js';
import * as ui from './ui.js';
import { createPowers, onHit, activate } from './powers.js';
import { createAI, updateAI } from './ai.js';
import { unlock, toggleMute, isMuted, sfx } from './audio.js';

const { PHYS, TEXTS, PLAYERS } = CONFIG;
let state = 'BOOT'; // BOOT | MENU | PLAYING | PAUSED | GAME_OVER (POINT = fase da partida)
let match = null, pw = null, ai = null;
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
  pw = createPowers();
  ai = mode === 'cpu' ? createAI(level) : null;
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

// Toque/tecla de uma jogadora humana.
function usePower(side) {
  if (match && match.mode === 'cpu' && side === 1) return;
  doPower(side);
}

function doPower(side) {
  if (state !== 'PLAYING' || !pw) return;
  const p = activate(pw, match, side);
  if (p) sfx.power(p);
}

function handleEvents() {
  for (const e of match.events) {
    if (e.type === 'serve') ui.toast(ui.fill(TEXTS.serve, nameOf(e.side)), CONFIG.RULES.serveDelay);
    else if (e.type === 'launch') sfx.serve();
    else if (e.type === 'hit') { sfx.hit(e.power); if (onHit(pw, e.side)) sfx.ready(); }
    else if (e.type === 'wall') sfx.wall();
    else if (e.type === 'point') { sfx.point(); ui.toast(ui.fill(TEXTS.point, nameOf(e.side)), CONFIG.RULES.pointPause); }
    else if (e.type === 'win') { state = 'GAME_OVER'; sfx.win(); ui.showOver(match); }
  }
  match.events.length = 0;
}

function step(dt) {
  applyInput(match.paddles[0]);
  if (match.mode === 'local') applyInput(match.paddles[1]);
  else updateAI(ai, match, pw, dt, doPower);
  updateMatch(match, dt);
  handleEvents();
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, PHYS.maxFrame);
  last = now;
  if (state === 'PLAYING') {
    acc += dt;
    while (acc >= PHYS.step && state === 'PLAYING') { step(PHYS.step); acc -= PHYS.step; }
    ui.updateHud(match, pw);
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
  boot: () => { unlock(); toMenu(); ui.maybeInstallHint(); },
  start: startMatch,
  pause, resume, menu: toMenu,
  rematch: () => startMatch(match.mode, match.level),
  power: usePower,
  mute: toggleMute,
});
ui.setMuteIcon(isMuted());
// iOS pode suspender o áudio ao sair do app: retoma no próximo toque.
addEventListener('pointerdown', unlock);
checkOrientation();
last = performance.now();
requestAnimationFrame(frame);
