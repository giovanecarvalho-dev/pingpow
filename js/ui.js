// Telas e HUD em DOM.
import { CONFIG } from './config.js';
import { drawPortrait } from './render.js';

const { TEXTS, PLAYERS, POWERS } = CONFIG;
const $ = (id) => document.getElementById(id);
const screens = { boot: $('screen-boot'), menu: $('screen-menu'), pause: $('screen-pause'), over: $('screen-over'), sound: $('screen-sound') };
const POWER_ICON = { smash: '🔥', curve: '🌀', freeze: '❄️' };
const STORE_KEY = 'pingpow.who', HINT_KEY = 'pingpow.hint';
let toastTimer = 0, soundBack = 'menu';

export const fill = (tpl, nome) => tpl.replace('{nome}', nome);
export const playerName = (key) => PLAYERS[key].name;

function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch { /* sem storage */ } }

export function getWho() { const w = load(STORE_KEY); return w === 'b' ? 'b' : 'a'; }

// true só na primeira partida (mostra a dica de arrastar o dedo).
export function takeHint() { if (load(HINT_KEY)) return false; save(HINT_KEY, '1'); return true; }

// Título com letras que ondulam.
function splitTitle(el) {
  el.textContent = '';
  [...CONFIG.TITLE].forEach((ch, i) => {
    const s = document.createElement('span');
    s.textContent = ch === ' ' ? ' ' : ch;
    s.style.animationDelay = i * 0.08 + 's';
    el.appendChild(s);
  });
}

// Controle de volume (0 a 100%, de 5 em 5): arrastar, tocar ou setas do teclado.
function initSlider(el, h) {
  const kind = el.dataset.kind, track = el.querySelector('.track');
  const bar = track.querySelector('i'), knob = track.querySelector('b'), val = el.querySelector('.val');
  track.setAttribute('aria-label', TEXTS[kind]);
  const render = (v) => {
    const p = Math.round(v * 100) + '%';
    bar.style.width = knob.style.left = val.textContent = p;
    track.setAttribute('aria-valuenow', Math.round(v * 100));
  };
  const set = (v) => { v = Math.round(Math.min(1, Math.max(0, v)) * 20) / 20; h.setVolume(kind, v); render(v); };
  const fromX = (x) => { const r = track.getBoundingClientRect(); set((x - r.left) / r.width); };
  track.addEventListener('pointerdown', (e) => { track.setPointerCapture(e.pointerId); fromX(e.clientX); });
  track.addEventListener('pointermove', (e) => { if (track.hasPointerCapture(e.pointerId)) fromX(e.clientX); });
  track.addEventListener('pointerup', () => h.preview(kind));
  track.addEventListener('keydown', (e) => {
    const d = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05 }[e.key];
    if (d) { e.preventDefault(); e.stopPropagation(); set(h.getVolume(kind) + d); h.preview(kind); }
  });
  render(h.getVolume(kind));
}

function portrait(key) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  c.className = 'mini';
  drawPortrait(c.getContext('2d'), key);
  return c;
}

export function initUI(h) {
  document.querySelectorAll('[data-text]').forEach((el) => {
    const k = el.dataset.text;
    if (k === 'TITLE') splitTitle(el);
    else el.textContent = TEXTS[k];
  });
  document.title = CONFIG.TITLE;
  $('version').textContent = CONFIG.VERSION_LABEL;

  const chips = document.querySelectorAll('[data-who]');
  const mark = () => chips.forEach((c) => c.classList.toggle('on', c.dataset.who === getWho()));
  chips.forEach((c) => {
    const key = c.dataset.who;
    const name = document.createElement('span');
    name.textContent = PLAYERS[key].name;
    c.append(portrait(key), name);
    c.style.setProperty('--pc', PLAYERS[key].color);
    c.onclick = () => { save(STORE_KEY, key); mark(); };
  });
  mark();

  $('btn-local').onclick = () => h.start('local');
  $('btn-cpu').onclick = () => { $('cpu-levels').hidden = !$('cpu-levels').hidden; };
  document.querySelectorAll('[data-level]').forEach((b) => { b.onclick = () => h.start('cpu', b.dataset.level); });
  $('btn-pause').onclick = h.pause;
  $('btn-resume').onclick = h.resume;
  $('btn-pause-menu').onclick = h.menu;
  $('btn-over-menu').onclick = h.menu;
  $('btn-rematch').onclick = h.rematch;
  $('power-0').onclick = () => h.power(0);
  $('power-1').onclick = () => h.power(1);
  document.querySelectorAll('.btn-sound').forEach((b) => {
    b.onclick = () => { soundBack = screens.pause.hidden ? 'menu' : 'pause'; show('sound'); h.soundPanel(true); };
  });
  $('btn-sound-ok').onclick = () => { show(soundBack); h.soundPanel(false); };
  $('btn-mute').onclick = () => setMuteIcon(h.mute());
  document.querySelectorAll('.vol').forEach((el) => initSlider(el, h));
  screens.boot.addEventListener('pointerdown', h.boot, { once: true });
  $('btn-hint-close').onclick = () => { $('install-hint').hidden = true; };
  addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('button')) h.click(); });
}

export function setMuteIcon(muted) {
  document.querySelectorAll('.btn-sound').forEach((b) => { b.textContent = muted ? '🔇' : '🔊'; });
  $('btn-mute').textContent = muted ? TEXTS.unmute : TEXTS.mute;
  $('screen-sound').classList.toggle('muted', muted);
}

export function show(name) {
  for (const [k, el] of Object.entries(screens)) el.hidden = k !== name;
  $('cpu-levels').hidden = true;
}

export function setHud(m, visible) {
  const hud = $('hud');
  hud.hidden = !visible;
  if (!m) return;
  hud.classList.toggle('local', m.mode === 'local');
  for (const s of [0, 1]) {
    const key = m.keys[s];
    $('name-' + s).textContent = m.mode === 'cpu' && s === 1 ? `${playerName(key)} (${TEXTS.cpuName})` : playerName(key);
    $('score-' + s).style.color = PLAYERS[key].color;
    $('bar-' + s).parentElement.style.setProperty('--pc', PLAYERS[key].color);
  }
}

// pw: estado dos poderes ({ bar:[n,n], stored:[p|null, p|null] }) ou null · cpu: [bool, bool] lados da CPU
export function updateHud(m, pw, cpu = [false, false]) {
  for (const s of [0, 1]) {
    const sc = $('score-' + s);
    if (sc.textContent !== String(m.score[s])) sc.textContent = m.score[s];
    const stored = pw && pw.stored[s];
    const bar = !pw ? 0 : stored ? 1 : pw.bar[s] / POWERS.hitsToFill;
    const bi = $('bar-' + s);
    const wd = Math.round(bar * 100) + '%';
    if (bi.style.width !== wd) bi.style.width = wd;
    bi.parentElement.classList.toggle('full', !!stored);
    const btn = $('power-' + s);
    const showBtn = !!stored && !cpu[s];
    btn.hidden = !showBtn;
    if (showBtn && btn.dataset.p !== stored) { btn.dataset.p = stored; btn.textContent = POWER_ICON[stored]; }
  }
}

export function popScore(side) {
  const el = $('score-' + side);
  el.classList.remove('pop');
  void el.offsetWidth; // reinicia a animação
  el.classList.add('pop');
}

// kind: serve | point | match | rally | power-smash | power-curve | power-freeze
export function toast(text, secs = 1, kind = '', sub = '') {
  for (const s of [0, 1]) {
    const el = $('toast-' + s);
    el.className = 'toast ' + kind;
    el.textContent = text;
    if (sub) { const sm = document.createElement('small'); sm.textContent = sub; el.appendChild(sm); }
    void el.offsetWidth;
    el.classList.add('show');
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { for (const s of [0, 1]) $('toast-' + s).classList.remove('show'); }, secs * 1000);
}

export function showOver(m, name) {
  const key = m.keys[m.winner];
  $('over-msg').textContent = fill(CONFIG.WIN_MESSAGE, name);
  $('over-score').textContent = `${m.score[0]} × ${m.score[1]}`;
  const box = $('over-portrait');
  box.textContent = '';
  box.style.setProperty('--pc', PLAYERS[key].color);
  box.appendChild(portrait(key));
  show('over');
}

export function setRotate(on) { $('rotate').hidden = !on; }

export function maybeInstallHint() {
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (ios && !standalone) $('install-hint').hidden = false;
}

export function setFps(v) { const el = $('fps'); el.hidden = false; el.textContent = v + ' fps'; }
