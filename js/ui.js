// Telas e HUD em DOM.
import { CONFIG } from './config.js';

const { TEXTS, PLAYERS, POWERS } = CONFIG;
const $ = (id) => document.getElementById(id);
const screens = { boot: $('screen-boot'), menu: $('screen-menu'), pause: $('screen-pause'), over: $('screen-over') };
const POWER_ICON = { smash: '🔥', curve: '🌀', freeze: '❄️' };
const STORE_KEY = 'pingpow.who';
let toastTimer = 0;

export const fill = (tpl, nome) => tpl.replace('{nome}', nome);
export const playerName = (key) => PLAYERS[key].name;

function load(k) { try { return localStorage.getItem(k); } catch { return null; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch { /* sem storage */ } }

export function getWho() { const w = load(STORE_KEY); return w === 'b' ? 'b' : 'a'; }

export function initUI(h) {
  document.querySelectorAll('[data-text]').forEach((el) => {
    const k = el.dataset.text;
    el.textContent = k === 'TITLE' ? CONFIG.TITLE : TEXTS[k];
  });
  document.title = CONFIG.TITLE;
  $('version').textContent = CONFIG.VERSION_LABEL;

  const chips = document.querySelectorAll('[data-who]');
  const mark = () => chips.forEach((c) => c.classList.toggle('on', c.dataset.who === getWho()));
  chips.forEach((c) => {
    c.textContent = PLAYERS[c.dataset.who].name;
    c.style.color = PLAYERS[c.dataset.who].color;
    c.onclick = () => { save(STORE_KEY, c.dataset.who); mark(); };
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
  document.querySelectorAll('.btn-mute').forEach((b) => { b.onclick = () => setMuteIcon(h.mute()); });
  screens.boot.addEventListener('pointerdown', h.boot, { once: true });
  $('btn-hint-close').onclick = () => { $('install-hint').hidden = true; };
}

export function setMuteIcon(muted) {
  document.querySelectorAll('.btn-mute').forEach((b) => { b.textContent = muted ? '🔇' : '🔊'; });
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
  }
}

// pw: estado dos poderes ({ bar:[n,n], stored:[p|null, p|null] }) ou null
export function updateHud(m, pw) {
  for (const s of [0, 1]) {
    const sc = $('score-' + s);
    if (sc.textContent !== String(m.score[s])) sc.textContent = m.score[s];
    const bar = !pw ? 0 : pw.stored[s] ? 1 : pw.bar[s] / POWERS.hitsToFill;
    $('bar-' + s).style.width = Math.round(bar * 100) + '%';
    const btn = $('power-' + s);
    const stored = pw && pw.stored[s];
    const showBtn = !!stored && !(m.mode === 'cpu' && s === 1);
    btn.hidden = !showBtn;
    if (showBtn && btn.dataset.p !== stored) { btn.dataset.p = stored; btn.textContent = POWER_ICON[stored]; }
  }
}

export function toast(text, secs = 1) {
  for (const s of [0, 1]) { $('toast-' + s).textContent = text; $('toast-' + s).classList.add('show'); }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { for (const s of [0, 1]) $('toast-' + s).classList.remove('show'); }, secs * 1000);
}

export function showOver(m) {
  const key = m.keys[m.winner];
  const name = m.mode === 'cpu' && m.winner === 1 ? `${playerName(key)} (${TEXTS.cpuName})` : playerName(key);
  $('over-msg').textContent = fill(CONFIG.WIN_MESSAGE, name);
  $('over-score').textContent = `${m.score[0]} × ${m.score[1]}`;
  $('over-portrait').style.background = PLAYERS[key].color;
  show('over');
}

export function setRotate(on) { $('rotate').hidden = !on; }

export function maybeInstallHint() {
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (ios && !standalone) $('install-hint').hidden = false;
}

export function setFps(v) { const el = $('fps'); el.hidden = false; el.textContent = v + ' fps'; }
