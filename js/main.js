// Boot, loop de passo fixo e máquina de estados.
import { CONFIG } from './config.js';
import { initInput, applyInput, setSingleSide, resetInput } from './input.js';
import { createMatch, updateMatch, isWin } from './match.js';
import { initRender, draw, toLogical } from './render.js';
import { PADDLE_Y } from './physics.js';
import * as ui from './ui.js';
import * as fx from './fx.js';
import { createPowers, onHit, activate } from './powers.js';
import { createAI, updateAI } from './ai.js';
import * as audio from './audio.js';

const { PHYS, TEXTS, PLAYERS, FX, RULES, AUDIO, BALL, PADDLE, COLORS: C } = CONFIG;
const { sfx } = audio;
// ?debug=1&bot=hard → CPU contra CPU (pra testar e assistir)
const BOT = CONFIG.DEBUG ? new URLSearchParams(location.search).get('bot') : null;

let state = 'BOOT'; // BOOT | MENU | PLAYING | PAUSED | GAME_OVER (POINT = fase da partida)
let game = null;    // partida de verdade: { m, pw, ais }
let demo = null;    // CPU × CPU sem som, no fundo do menu
let last = 0, acc = 0, fpsT = 0, fpsN = 0;
let pausedByRotate = false;
let hitStop = 0, slow = false, hintPending = false;

function newGame(mode, keys, level, aiSides) {
  const ais = [null, null];
  for (const s of aiSides) ais[s] = createAI(level, s);
  return { m: createMatch(mode, keys, level), pw: createPowers(), ais, restartAt: 0 };
}
const newDemo = () => newGame('cpu', ['a', 'b'], CONFIG.CPU.demoLevel, [0, 1]);

function nameOf(m, side) {
  const n = PLAYERS[m.keys[side]].name;
  return m.mode === 'cpu' && side === 1 ? `${n} (${TEXTS.cpuName})` : n;
}

function startMatch(mode, level = 'normal') {
  const who = ui.getWho();
  const other = who === 'a' ? 'b' : 'a';
  game = newGame(mode, [who, other], level, mode === 'cpu' ? (BOT ? [0, 1] : [1]) : []);
  setSingleSide(mode === 'cpu');
  resetInput();
  fx.clear();
  hitStop = 0; slow = false;
  hintPending = !BOT && ui.takeHint();
  ui.setHud(game.m, true);
  ui.show(null);
  audio.music('game');
  audio.musicRate(1);
  audio.duck(false);
  state = 'PLAYING';
}

function toMenu() {
  game = null;
  fx.clear();
  ui.setHud(null, false);
  ui.show('menu');
  audio.music('menu');
  audio.duck(false);
  state = 'MENU';
}

function pause() {
  if (state !== 'PLAYING') return;
  state = 'PAUSED';
  audio.duck(true);
  ui.show('pause');
}

function resume() {
  if (state !== 'PAUSED' || isLandscape()) return;
  state = 'PLAYING';
  resetInput();
  audio.duck(false);
  ui.show(null);
  last = performance.now();
}

// Toque/tecla de uma jogadora humana.
function usePower(side) {
  if (state !== 'PLAYING' || !game || game.ais[side]) return;
  doPower(game, side, true);
}

function doPower(g, side, live) {
  const p = activate(g.pw, g.m, side);
  if (!p) return;
  const own = g.m.paddles[side], foe = g.m.paddles[1 - side];
  if (p === 'freeze') {
    fx.burst(foe.x, foe.y, 30, ['#fff', C.freeze, '#5bc0ff'], { speed: [30, 140], life: [0.4, 0.9], size: [1, 3] });
    fx.ring(foe.x, foe.y, C.freeze, 30, 0.5);
    fx.flash(C.freeze, 0.35, 1 - side);
  } else {
    const fire = p === 'smash';
    fx.burst(own.x, own.y, 24, fire ? [C.fire, C.fire2, C.fire3] : [C.curve, C.curve2, '#fff'],
      { speed: [30, 120], life: [0.3, 0.7], size: [1, 3], grav: fire ? -60 : 0 });
    fx.ring(own.x, own.y, fire ? C.fire : C.curve, 26, 0.4);
  }
  if (!live) return;
  sfx.power(p);
  ui.toast(TEXTS.powerNames[p], 1.1, 'power-' + p);
}

function onHitFx(g, e, live) {
  const m = g.m, up = e.side === 0 ? -1 : 1;
  const dir = up * Math.PI / 2, col = PLAYERS[m.keys[e.side]].color;
  const k = Math.max(0, (e.speed - BALL.startSpeed) / (BALL.maxSpeed - BALL.startSpeed));
  if (e.power === 'smash') {
    fx.burst(e.x, e.y, 28, [C.fire, C.fire2, C.fire3, '#fff'], { dir, spread: 2.2, speed: [60, 200], life: [0.3, 0.7], size: [1, 3] });
    fx.ring(e.x, e.y, C.fire2, 28, 0.35);
    fx.text(e.x, e.y + up * 18, TEXTS.pow, C.fire2, 22, 0.8);
    fx.shake(FX.shakeSmash);
    fx.flash(C.fire, 0.3);
    if (live) hitStop = Math.max(hitStop, FX.smashStop);
  } else if (e.power === 'curve') {
    fx.burst(e.x, e.y, 18, [C.curve, C.curve2, '#fff'], { dir, spread: 2.6, speed: [40, 140], life: [0.3, 0.6] });
    fx.ring(e.x, e.y, C.curve, 22, 0.35);
    fx.shake(3);
    if (live) hitStop = Math.max(hitStop, FX.hitStop * 2);
  } else {
    fx.burst(e.x, e.y, 5 + Math.round(k * 8), ['#fff', C.fire2, col], { dir, spread: 1.8, speed: [40, 110 + k * 80], life: [0.15, 0.35] });
    fx.ring(e.x, e.y, '#fff', 10 + k * 8, 0.2);
    fx.shake(FX.shakeHit * k * 2);
    if (live) hitStop = Math.max(hitStop, FX.hitStop);
  }
  const got = onHit(g.pw, e.side);
  if (got) fx.burst(e.x, e.y, 14, ['#fff', C.fire2], { speed: [30, 90], life: [0.4, 0.8] });
  if (!live) return;
  sfx.hit(e.power, e.speed);
  if (got && !g.ais[e.side]) sfx.ready();
  if (e.rally % FX.rallyEvery === 0) { ui.toast(TEXTS.rally.replace('{n}', e.rally), 1.1, 'rally'); sfx.rally(); }
}

function onPoint(g, e, live) {
  const m = g.m, col = PLAYERS[m.keys[e.side]].color;
  fx.burst(e.x, e.y, e.final ? 50 : 30, [col, '#fff', C.fire2], { speed: [40, 170], life: [0.4, 0.9], size: [1, 3], grav: 60 });
  fx.ring(e.x, e.y, col, 30, 0.45);
  fx.shake(e.final ? FX.shakeFinal : FX.shakePoint);
  fx.flash(e.final ? '#fff' : col, e.final ? 0.6 : 0.22, e.final ? -1 : 1 - e.side);
  if (e.final) fx.confetti(FX.confetti);
  if (!live) return;
  hitStop = Math.max(hitStop, FX.pointStop);
  const good = m.mode !== 'cpu' || e.side === 0 || !!BOT;
  sfx.point(good, e.rally >= 6);
  if (e.final) sfx.final();
  ui.toast(ui.fill(TEXTS.point, nameOf(m, e.side)), e.final ? RULES.finalPause : RULES.pointPause, 'point');
  ui.popScore(e.side);
}

function onWin(g, e, live) {
  if (!live) { g.restartAt = performance.now() + 2500; return; }
  state = 'GAME_OVER';
  fx.confetti(FX.confetti / 2);
  const cpuWon = g.m.mode === 'cpu' && e.side === 1 && !BOT;
  if (cpuWon) {
    audio.music(null);
    sfx.lose();
    setTimeout(() => { if (state === 'GAME_OVER') audio.music('menu'); }, 2200);
  } else audio.music('win');
  ui.showOver(g.m, nameOf(g.m, e.side));
  if (BOT) setTimeout(() => { if (state === 'GAME_OVER') startMatch('cpu', g.m.level); }, 5000);
}

function handleEvents(g, live) {
  const m = g.m;
  for (const e of m.events) {
    if (e.type === 'serve') {
      if (!live) continue;
      const mp = e.mp >= 0, who = ui.fill(TEXTS.serve, nameOf(m, e.side));
      audio.musicRate(mp ? AUDIO.matchPointRate : 1);
      if (mp) { sfx.matchPoint(); ui.toast(TEXTS.matchPoint, RULES.serveDelay + 0.3, 'match', who); }
      else if (hintPending) { ui.toast(who, RULES.serveDelay + 1.5, 'serve', TEXTS.dragHint); hintPending = false; }
      else ui.toast(who, RULES.serveDelay, 'serve');
    } else if (e.type === 'launch') { if (live) sfx.serve(); }
    else if (e.type === 'hit') onHitFx(g, e, live);
    else if (e.type === 'bounce') {
      fx.ring(e.x, e.y, '#ffffff', 6, 0.22);
      fx.burst(e.x, e.y, 3, ['#dff5e8', '#9fd8bd'], { speed: [10, 30], life: [0.15, 0.3] });
      if (live) sfx.bounce();
    } else if (e.type === 'wall') {
      fx.burst(e.x, e.y, 4, ['#fff', '#cfd3e0'], { dir: e.x < CONFIG.WORLD.w / 2 ? 0 : Math.PI, spread: 2, speed: [20, 60], life: [0.15, 0.35] });
      if (live) sfx.wall();
    } else if (e.type === 'point') onPoint(g, e, live);
    else if (e.type === 'win') onWin(g, e, live);
  }
  m.events.length = 0;
}

function stepGame(g, dt, live) {
  const m = g.m;
  for (const s of [0, 1]) {
    if (g.ais[s]) updateAI(g.ais[s], m, g.pw, dt, (side) => doPower(g, side, live));
    else applyInput(m.paddles[s]);
  }
  updateMatch(m, dt);
  handleEvents(g, live);
}

// Câmera lenta + zoom quando a bola já passou da raquete no ponto que fecha a partida.
function updateSlowMo() {
  const m = game.m, b = m.ball;
  let on = false;
  if (m.phase === 'rally') {
    const loser = b.vy > 0 ? 0 : 1, reach = PADDLE.h / 2 + BALL.radius;
    const past = loser === 0 ? b.y > PADDLE_Y[0] + reach : b.y < PADDLE_Y[1] - reach;
    on = past && isWin(m.score[1 - loser] + 1, m.score[loser]);
  }
  if (on || on !== slow) fx.zoom(on ? FX.slowZoom : 1, b.x, b.y);
  slow = on;
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, PHYS.maxFrame);
  last = now;
  if (state === 'PLAYING') {
    let sim = dt;
    if (hitStop > 0) { const h = Math.min(hitStop, sim); hitStop -= h; sim -= h; }
    acc += slow ? sim * FX.slowMo : sim;
    while (acc >= PHYS.step && state === 'PLAYING' && hitStop <= 0) { stepGame(game, PHYS.step, true); acc -= PHYS.step; }
    if (hitStop > 0) acc = 0;
    if (game) { updateSlowMo(); ui.updateHud(game.m, game.pw, game.ais.map(Boolean)); }
  } else if (state === 'MENU' || state === 'BOOT') {
    if (!demo || (demo.restartAt && now > demo.restartAt)) demo = newDemo();
    acc += dt;
    while (acc >= PHYS.step) { stepGame(demo, PHYS.step, false); acc -= PHYS.step; }
  } else acc = 0;
  const shown = state === 'MENU' || state === 'BOOT' ? demo : game;
  draw(shown ? shown.m : null, dt);
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
document.addEventListener('visibilitychange', () => { if (document.hidden) { pause(); audio.suspend(); } });

// ---------- Boot ----------
initRender(document.getElementById('game'));
initInput(toLogical, usePower);
ui.initUI({
  boot: () => { audio.unlock(); toMenu(); ui.maybeInstallHint(); },
  start: startMatch,
  pause, resume, menu: toMenu,
  rematch: () => startMatch(game.m.mode, game.m.level),
  power: usePower,
  mute: audio.toggleMute,
  click: sfx.click,
});
ui.setMuteIcon(audio.isMuted());
// iOS pode suspender o áudio ao sair do app: retoma no próximo toque.
addEventListener('pointerdown', audio.unlock);
checkOrientation();
if (BOT) startMatch('cpu', CONFIG.CPU[BOT] ? BOT : 'hard');
last = performance.now();
requestAnimationFrame(frame);
