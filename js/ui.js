// Telas e HUD em DOM.
import { CONFIG } from './config.js';
import { drawPortrait } from './render.js';

const { TEXTS, PLAYERS, POWERS, NET } = CONFIG;
const $ = (id) => document.getElementById(id);
const screens = {
  boot: $('screen-boot'), menu: $('screen-menu'), pause: $('screen-pause'), over: $('screen-over'), sound: $('screen-sound'),
  online: $('screen-online'), host: $('screen-host'), join: $('screen-join'),
};
const POWER_ICON = { smash: '🔥', curve: '🌀', freeze: '❄️' };
const STORE_KEY = 'pingpow.who', HINT_KEY = 'pingpow.hint';
let toastTimer = 0, noticeTimer = 0, soundBack = 'menu';

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
  $('notice').onclick = () => { $('notice').hidden = true; };
  initOnline(h);
  addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('button')) h.click(); });
}

// Menu Online: criar sala (mostra o código) ou entrar (digita o código).
function initOnline(h) {
  const input = $('join-code'), go = $('btn-join-go');
  $('btn-online').onclick = () => show('online');
  $('btn-online-back').onclick = () => show('menu');
  $('btn-host').onclick = () => {
    $('room-code').textContent = '';
    $('btn-share').hidden = true;
    netStatus('host', TEXTS.connecting, 'wait');
    show('host');
    h.onlineHost();
  };
  // Folha de compartilhar do iOS: abre por cima do jogo (sair do app pode derrubar a sala).
  $('btn-share').onclick = () => {
    const code = $('room-code').textContent;
    const text = TEXTS.shareText.replace('{titulo}', CONFIG.TITLE).replace('{codigo}', code);
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else if (navigator.clipboard) navigator.clipboard.writeText(code).then(() => notice(TEXTS.copied), () => {});
  };
  $('btn-join').onclick = () => {
    input.value = '';
    netStatus('join', '');
    show('join');
    input.focus();
  };
  input.addEventListener('input', () => {
    const v = input.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, NET.codeLen);
    if (input.value !== v) input.value = v;
  });
  const submit = () => {
    if (go.disabled) return;
    if (input.value.length < NET.codeLen) { netStatus('join', TEXTS.codeShort, 'err'); return; }
    input.blur();
    netStatus('join', TEXTS.connecting, 'wait');
    h.onlineJoin(input.value);
  };
  go.onclick = submit;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  $('btn-host-cancel').onclick = $('btn-join-cancel').onclick = () => { h.onlineCancel(); show('online'); };
  $('btn-net-menu').onclick = () => h.menu();
}

export function setRoomCode(code) {
  $('room-code').textContent = code;
  $('btn-share').hidden = !(navigator.share || navigator.clipboard);
  netStatus('host', TEXTS.waiting, 'wait');
}

// where: 'host' | 'join' · kind: '' | 'wait' (piscando; trava o Entrar) | 'err'
export function netStatus(where, text, kind = '') {
  const el = $(where + '-status');
  el.textContent = text;
  el.classList.toggle('err', kind === 'err');
  el.classList.toggle('blink', kind === 'wait');
  if (where === 'join') $('btn-join-go').disabled = kind === 'wait';
}

export function netWait(on) { $('net-wait').hidden = !on; }

export function notice(text) {
  const el = $('notice');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { el.hidden = true; }, 4500);
}

export function setPing(ms) {
  const el = $('net-ping');
  const t = ms ? ms + ' ms' : '…';
  if (el.textContent !== t) el.textContent = t;
  el.classList.toggle('mid', ms > 120 && ms <= 250);
  el.classList.toggle('bad', ms > 250);
}

export function rematchWait(name) {
  const b = $('btn-rematch');
  b.disabled = true;
  b.textContent = fill(TEXTS.rematchWait, name);
}

export function rematchAsk(name) { $('over-note').textContent = fill(TEXTS.rematchAsk, name); }

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
  $('net-ping').hidden = m.mode !== 'online';
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
  $('over-note').textContent = '';
  $('btn-rematch').disabled = false;
  $('btn-rematch').textContent = TEXTS.rematch;
  show('over');
}

export function setRotate(on) { $('rotate').hidden = !on; }

export function maybeInstallHint() {
  const standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  if (ios && !standalone) $('install-hint').hidden = false;
}

export function setFps(v) { const el = $('fps'); el.hidden = false; el.textContent = v + ' fps'; }
