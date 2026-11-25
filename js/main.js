// Boot, loop de passo fixo e máquina de estados.
import { CONFIG } from './config.js';
import { initInput, applyInput, setSingleSide, resetInput } from './input.js';
import { createMatch, updateMatch, isWin } from './match.js';
import { initRender, draw, toLogical, refreshBackground } from './render.js';
import { loadSprites } from './sprites.js';
import { PADDLE_Y, stepPaddle } from './physics.js';
import * as ui from './ui.js';
import * as fx from './fx.js';
import { createPowers, onHit, activate } from './powers.js';
import { createAI, updateAI } from './ai.js';
import * as audio from './audio.js';
import * as net from './net.js';
import * as pwa from './pwa.js';
import { snapshot, packEvent, createReplica, pushSnap, pushEvents, updateReplica } from './sync.js';

const { PHYS, TEXTS, PLAYERS, FX, RULES, AUDIO, BALL, PADDLE, NET, COLORS: C } = CONFIG;
const W = CONFIG.WORLD.w;
const { sfx } = audio;
const PARAMS = new URLSearchParams(location.search);
// ?debug=1&bot=hard → CPU contra CPU (pra testar e assistir). Com &online=1, a CPU joga a partida online.
const BOT = CONFIG.DEBUG ? PARAMS.get('bot') : null;
const BOT_LEVEL = CONFIG.CPU[BOT] ? BOT : 'hard';

// BOOT | MENU | PLAYING | PAUSED | GAME_OVER | NET_WAIT (online: reconectando). POINT = fase da partida.
let state = 'BOOT';
let game = null;    // partida de verdade: { m, pw, ais } · online: host tem remote/out; convidada é uma réplica
let demo = null;    // CPU × CPU sem som, no fundo do menu
let last = 0, acc = 0, fpsT = 0, fpsN = 0;
let pausedByRotate = false;
let hitStop = 0, slow = false, hintPending = false;
// Online
let stepTs = 0;               // hora (host) do passo de física atual, pros eventos
let remoteIn = null;          // último input da convidada (host)
let votes = [false, false];   // revanche: [eu, a outra]
let netPrev = 'PAUSED', lastSnap = 0, lastInput = 0, inSeq = 0, lastPingUi = 0;

function newGame(mode, keys, level, aiSides) {
  const ais = [null, null];
  for (const s of aiSides) ais[s] = createAI(level, s);
  return { m: createMatch(mode, keys, level), pw: createPowers(), ais, restartAt: 0 };
}
const newDemo = () => newGame('cpu', ['a', 'b'], CONFIG.CPU.demoLevel, [0, 1]);
const isHost = () => net.getRole() === 'host';
const onlineGame = () => !!game && game.m.mode === 'online';
// Lado controlado por alguém daqui (não CPU, não a outra jogadora do online).
const isMine = (g, s) => !g.ais[s] && !(g.remote && g.remote[s]);
const hudFlags = (g) => [0, 1].map((s) => !isMine(g, s));

function nameOf(m, side) {
  const n = PLAYERS[m.keys[side]].name;
  return m.mode === 'cpu' && side === 1 ? `${n} (${TEXTS.cpuName})` : n;
}

function startMatch(mode, level = 'normal') {
  const who = ui.getWho();
  const other = who === 'a' ? 'b' : 'a';
  beginMatch(newGame(mode, [who, other], level, mode === 'cpu' ? (BOT ? [0, 1] : [1]) : []));
}

function beginMatch(g) {
  game = g;
  votes = [false, false];
  setSingleSide(g.m.mode !== 'local');
  resetInput();
  fx.clear();
  hitStop = 0; slow = false; acc = 0;
  hintPending = !BOT && ui.takeHint();
  ui.setHud(g.m, true);
  ui.show(null);
  ui.netWait(false);
  ui.showUpdate(false); // atualização só no menu (recarregar no meio da partida derrubaria o online)
  audio.music('game');
  audio.musicRate(1);
  audio.duck(false);
  state = 'PLAYING';
}

function toMenu(msg) {
  if (net.active()) net.leave(true);
  game = null;
  fx.clear();
  ui.setHud(null, false);
  ui.netWait(false);
  ui.show('menu');
  ui.showUpdate(pwa.hasUpdate());
  if (msg) ui.notice(msg);
  audio.music('menu');
  audio.duck(false);
  state = 'MENU';
}

// No online, pausar e continuar valem pras duas (fromNet = veio da outra).
function pause(fromNet = false) {
  if (state !== 'PLAYING') return;
  state = 'PAUSED';
  audio.duck(true);
  ui.show('pause');
  if (!fromNet && onlineGame()) net.send({ t: 'pause', on: 1 });
}

function resume(fromNet = false) {
  if (state !== 'PAUSED') return;
  if (isLandscape()) { if (fromNet && onlineGame()) net.send({ t: 'pause', on: 1 }); return; }
  state = 'PLAYING';
  resetInput();
  audio.duck(false);
  ui.show(null);
  last = performance.now();
  if (!fromNet && onlineGame()) net.send({ t: 'pause', on: 0 });
}

function rematch() {
  if (!game || state !== 'GAME_OVER') return;
  if (game.m.mode !== 'online') { startMatch(game.m.mode, game.m.level); return; }
  if (votes[0]) return;
  votes[0] = true;
  net.send({ t: 'rematch' });
  if (isHost() && votes[1]) startOnline();
  else ui.rematchWait(nameOf(game.m, 1));
}

// Toque/tecla de uma jogadora humana.
function usePower(side) {
  if (state !== 'PLAYING' || !game || !isMine(game, side)) return;
  if (game.replica) guestPower();
  else doPower(game, side, true);
}

function doPower(g, side, live) {
  const p = activate(g.pw, g.m, side);
  if (!p) return;
  if (g.out) g.out.push({ type: 'power', side, p, ts: Math.round(performance.now()) });
  powerFx(g, side, p, live);
}

function powerFx(g, side, p, live) {
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
    fx.text(e.x, e.y + up * 18, TEXTS.pow, C.fire2, 27, 0.8); // 27 = 1 pixel da fonte por pixel do jogo
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
  const got = g.replica ? e.got : (e.got = onHit(g.pw, e.side)); // a convidada recebe do host
  if (got) fx.burst(e.x, e.y, 14, ['#fff', C.fire2], { speed: [30, 90], life: [0.4, 0.8] });
  if (!live) return;
  sfx.hit(e.power, e.speed);
  if (got && isMine(g, e.side)) sfx.ready();
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
  const good = m.mode === 'local' || e.side === 0 || !!BOT; // contra a CPU e no online, o lado 0 sou eu
  sfx.point(good, e.rally >= 6);
  if (e.final) sfx.final();
  ui.toast(ui.fill(TEXTS.point, nameOf(m, e.side)), e.final ? RULES.finalPause : RULES.pointPause, 'point');
  ui.popScore(e.side);
}

function onWin(g, e, live) {
  if (!live) { g.restartAt = performance.now() + 2500; return; }
  state = 'GAME_OVER';
  g.m.winner = e.side;
  fx.confetti(FX.confetti / 2);
  const lost = g.m.mode !== 'local' && e.side === 1 && !BOT;
  if (lost) {
    audio.music(null);
    sfx.lose();
    setTimeout(() => { if (state === 'GAME_OVER') audio.music('menu'); }, 2200);
  } else audio.music('win');
  ui.showOver(g.m, nameOf(g.m, e.side));
  if (g.m.mode === 'online' && votes[1]) ui.rematchAsk(nameOf(g.m, 1));
  if (BOT) setTimeout(() => { if (state === 'GAME_OVER') rematch(); }, 5000);
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
      fx.burst(e.x, e.y, 4, ['#fff', '#cfd3e0'], { dir: e.x < W / 2 ? 0 : Math.PI, spread: 2, speed: [20, 60], life: [0.15, 0.35] });
      if (live) sfx.wall();
    } else if (e.type === 'point') onPoint(g, e, live);
    else if (e.type === 'win') onWin(g, e, live);
    else if (e.type === 'power') powerFx(g, e.side, e.p, live); // só na convidada
  }
  if (g.out) for (const e of m.events) g.out.push(packEvent(e, m, stepTs)); // host → convidada
  m.events.length = 0;
}

function stepGame(g, dt, live) {
  const m = g.m;
  for (const s of [0, 1]) {
    const p = m.paddles[s];
    if (g.ais[s]) updateAI(g.ais[s], m, g.pw, dt, (side) => doPower(g, side, live));
    else if (g.remote && g.remote[s]) {
      if (remoteIn) { p.target = remoteIn.x; p.speedMul = Math.min(1, Math.max(0.1, remoteIn.sm || 1)); }
    } else applyInput(p);
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

// ---------- Online ----------
// Host: começa (ou recomeça) a partida. A convidada joga do lado 1 e controla a raquete pelo input que manda.
function startOnline() {
  const who = ui.getWho(), keys = [who, who === 'a' ? 'b' : 'a']; // se escolheram a mesma, a convidada fica com a outra
  net.send({ t: 'start', keys });
  const g = newGame('online', keys, BOT_LEVEL, BOT ? [0] : []);
  g.remote = [false, true];
  g.out = [];
  remoteIn = null;
  beginMatch(g);
}

// Convidada: não simula; desenha a réplica e manda o dedo.
function startGuest(keys) {
  const g = createReplica(keys);
  if (BOT) g.ais[0] = createAI(BOT_LEVEL, 0);
  beginMatch(g);
}

function guestPower() {
  if (state !== 'PLAYING' || !game.pw.stored[0]) return;
  game.pending = performance.now();
  game.pw.stored[0] = null;
  net.send({ t: 'pw' });
}

function guestFrame(now, dt) {
  const g = game, m = g.m, own = m.paddles[0];
  const due = updateReplica(g, now);
  if (state === 'PLAYING') {
    if (g.ais[0]) updateAI(g.ais[0], m, g.pw, dt, guestPower);
    else applyInput(own);
    if (now - lastInput >= 1000 / NET.inputRate) {
      lastInput = now;
      net.send({ t: 'i', x: Math.round((W - own.target) * 10) / 10, sm: own.speedMul, sq: ++inSeq });
    }
  }
  stepPaddle(own, dt); // previsão local: a raquete dela responde na hora
  if (m.phase === 'serve' && m.server === 0) m.ball.x = own.x; // no saque, a bola acompanha a raquete dela
  if (g.slow || g.slow !== slow) fx.zoom(g.slow ? FX.slowZoom : 1, m.ball.x, m.ball.y);
  slow = g.slow;
  m.events.push(...due);
  handleEvents(g, true);
  ui.updateHud(m, g.pw, hudFlags(g));
}

function hostSend(now) {
  const g = game;
  if (!net.active() || net.isLost()) { g.out = []; return; }
  if (g.out.length) { net.send({ t: 'e', ev: g.out }); g.out = []; }
  if (now - lastSnap >= 1000 / NET.snapRate) {
    lastSnap = now;
    const ts = state === 'PLAYING' ? now - (acc / (slow ? FX.slowMo : 1)) * 1000 : now;
    net.send(snapshot(g, ts, slow));
  }
}

function onNetMessage(msg) {
  const host = isHost(), replica = game && game.replica;
  switch (msg.t) {
    case 'start': if (!host) startGuest(msg.keys); break;
    case 's': if (replica) pushSnap(game, msg, performance.now()); break;
    case 'e': if (replica) pushEvents(game, msg.ev); break;
    case 'i': if (host && (!remoteIn || msg.sq > remoteIn.sq)) remoteIn = msg; break;
    case 'pw': if (host && game && state === 'PLAYING') doPower(game, 1, true); break;
    case 'pause': if (msg.on) pause(true); else resume(true); break;
    case 'rematch':
      votes[1] = true;
      if (state !== 'GAME_OVER') break; // ainda vendo o fim: o recado aparece na tela de vitória
      if (host && votes[0]) startOnline();
      else ui.rematchAsk(nameOf(game.m, 1));
      break;
    case 'bye': toMenu(game ? ui.fill(TEXTS.netLeft, nameOf(game.m, 1)) : TEXTS.netLost); break;
    default: break;
  }
}

const NET_ERR = { server: 'netServer', noRoom: 'netNoRoom', version: 'netVersion', busy: 'netBusy', lost: 'netLost' };

function netHandlers(where) {
  return {
    code: ui.setRoomCode,
    warn: () => ui.netStatus('host', TEXTS.netVersion, 'err'),
    ready: () => { if (isHost()) startOnline(); else ui.netStatus('join', TEXTS.connected, 'wait'); },
    message: onNetMessage,
    lost: () => {
      if (!onlineGame() || state === 'NET_WAIT') return;
      netPrev = state === 'PLAYING' ? 'PAUSED' : state; // ao voltar, fica pausado
      if (state === 'PLAYING') audio.duck(true);
      state = 'NET_WAIT';
      ui.netWait(true);
    },
    back: () => {
      if (state !== 'NET_WAIT') return;
      ui.netWait(false);
      state = netPrev;
      if (state === 'PAUSED') { ui.show('pause'); net.send({ t: 'pause', on: 1 }); }
    },
    fail: (why) => {
      const text = TEXTS[NET_ERR[why] || 'netFail'];
      if (onlineGame()) toMenu(text);
      else ui.netStatus(where, text, 'err');
    },
  };
}

function frame(now) {
  const dt = Math.min((now - last) / 1000, PHYS.maxFrame);
  last = now;
  if (game && game.replica) {
    if (state === 'PLAYING' || state === 'GAME_OVER') guestFrame(now, dt);
  } else if (state === 'PLAYING') {
    let sim = dt;
    if (hitStop > 0) { const h = Math.min(hitStop, sim); hitStop -= h; sim -= h; }
    const rate = slow ? FX.slowMo : 1;
    acc += sim * rate;
    while (acc >= PHYS.step && state === 'PLAYING' && hitStop <= 0) {
      stepTs = now - ((acc - PHYS.step) / rate) * 1000;
      stepGame(game, PHYS.step, true);
      acc -= PHYS.step;
    }
    if (hitStop > 0) acc = 0;
    if (game) { updateSlowMo(); ui.updateHud(game.m, game.pw, hudFlags(game)); }
  } else if (state === 'MENU' || state === 'BOOT') {
    if (!demo || (demo.restartAt && now > demo.restartAt)) demo = newDemo();
    acc += dt;
    while (acc >= PHYS.step) { stepGame(demo, PHYS.step, false); acc -= PHYS.step; }
  } else acc = 0;
  if (game && game.out) hostSend(now);
  if (onlineGame() && now - lastPingUi > 500) { lastPingUi = now; ui.setPing(net.getPing()); }
  const shown = state === 'MENU' || state === 'BOOT' ? demo : game;
  const ready = shown && !(shown.replica && shown.off == null); // convidada: espera o 1º snapshot
  draw(ready ? shown.m : null, dt, state === 'GAME_OVER');
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
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(); audio.suspend(); } else net.wake();
});

// ---------- Boot ----------
initRender(document.getElementById('game'));
initInput(toLogical, usePower);
ui.initUI({
  boot: () => { audio.unlock(); toMenu(); ui.maybeInstallHint(); },
  start: startMatch,
  pause: () => pause(), resume: () => resume(), menu: () => toMenu(),
  rematch,
  power: usePower,
  onlineHost: () => net.host(netHandlers('host')),
  onlineJoin: (code) => net.join(code, netHandlers('join')),
  onlineCancel: () => net.leave(),
  update: pwa.applyUpdate,
  mute: audio.toggleMute,
  getVolume: audio.getVolume,
  setVolume: audio.setVolume,
  preview: (kind) => { if (kind === 'sfx') sfx.hit(); },
  soundPanel: (open) => audio.duck(!open && state === 'PAUSED'), // sem abafar a música enquanto ajusta
  click: sfx.click,
});
ui.setMuteIcon(audio.isMuted());
// Versão nova baixada: na abertura (ainda em "Toque para jogar") aplica direto; no menu, mostra o aviso.
pwa.initPWA(() => {
  if (state === 'BOOT') pwa.applyUpdate();
  else if (state === 'MENU') ui.showUpdate(true);
});
// Pixel art (Fase 3): sem os arquivos, fica tudo no desenho por código.
loadSprites().then((any) => { if (any) { refreshBackground(); ui.refreshPortraits(); } });
// iOS pode suspender o áudio ao sair do app: retoma no próximo toque.
addEventListener('pointerdown', audio.unlock);
checkOrientation();
if (BOT && !PARAMS.has('online')) startMatch('cpu', BOT_LEVEL);
last = performance.now();
requestAnimationFrame(frame);
