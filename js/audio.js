// Áudio via WebAudio: efeitos e músicas CC0 em assets/audio (ver assets/CREDITOS.md).
// Se um arquivo não carregar, entra um som sintetizado no lugar.
import { CONFIG } from './config.js';

const { AUDIO, BALL } = CONFIG;
const MIX = AUDIO.mix;
const DIR = './assets/audio/';
const FILES = {
  hit1: 'hit1.wav', hit2: 'hit2.wav', hit3: 'hit3.wav', wall: 'wall.wav', smash: 'smash.wav',
  freeze: 'freeze.wav', ice: 'ice.wav', click: 'click.wav',
  curve: 'curve.mp3', fire: 'fire.mp3', ready: 'ready.mp3', point: 'point.mp3', pointBad: 'pointBad.mp3',
  matchPoint: 'matchPoint.mp3', lose: 'lose.mp3',
  music_menu: 'music_menu.mp3', music_game: 'music_game.mp3', music_win: 'music_win.mp3',
};
const buffers = {};
let ac = null, master = null, sfxBus = null, musicBus = null;
let muted = false, ducked = false;
let track = null, wantTrack = null, wantRate = 1;
let clapBuf = null;
const vol = { music: AUDIO.defaultMusic, sfx: AUDIO.defaultSfx }; // controles da jogadora (0 a 1)
try {
  muted = localStorage.getItem('pingpow.muted') === '1';
  for (const k of ['music', 'sfx']) { const v = parseFloat(localStorage.getItem('pingpow.vol.' + k)); if (v >= 0 && v <= 1) vol[k] = v; }
} catch { /* sem storage */ }
// Curva quadrática: o controle "anda" de forma mais natural pro ouvido.
const busGain = (k) => AUDIO[k] * vol[k] * vol[k] * (k === 'music' && ducked ? 0.3 : 1);

// Os bytes começam a baixar já; a decodificação espera o áudio ser liberado.
const raw = {};
for (const [k, f] of Object.entries(FILES)) {
  raw[k] = fetch(DIR + f).then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
}

export const isMuted = () => muted;
const live = () => ac && !muted && ac.state === 'running';

function decode(ab) {
  return new Promise((res) => {
    try {
      const p = ac.decodeAudioData(ab, res, () => res(null)); // forma com callback: Safari antigo
      if (p && p.catch) p.catch(() => res(null));
    } catch { res(null); }
  });
}

// Chamar dentro de um toque (iOS só libera áudio após gesto).
export function unlock() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ac.destination);
      sfxBus = ac.createGain();
      sfxBus.gain.value = busGain('sfx');
      sfxBus.connect(master);
      musicBus = ac.createGain();
      musicBus.gain.value = busGain('music');
      musicBus.connect(master);
      for (const k of Object.keys(FILES)) {
        raw[k].then((ab) => ab && decode(ab)).then((b) => {
          if (!b) return;
          buffers[k] = b;
          if (k === wantTrack && !track) startTrack();
        });
      }
    }
    if (ac.state !== 'running') ac.resume();
    const src = ac.createBufferSource();
    src.buffer = ac.createBuffer(1, 1, 22050);
    src.connect(ac.destination);
    src.start(0);
  } catch { /* sem áudio */ }
}

export function suspend() { try { if (ac && ac.state === 'running') ac.suspend(); } catch { /* ok */ } }

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('pingpow.muted', muted ? '1' : '0'); } catch { /* sem storage */ }
  if (master) master.gain.value = muted ? 0 : 1;
  return muted;
}

// ---------- Música (loop com crossfade) ----------
function startTrack() {
  if (!ac) return;
  const t = ac.currentTime;
  if (track) {
    const old = track;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(old.gain.gain.value, t);
    old.gain.gain.linearRampToValueAtTime(0, t + 0.4);
    old.src.stop(t + 0.45);
    track = null;
  }
  const buf = wantTrack && buffers[wantTrack];
  if (!buf) return; // começa quando terminar de carregar
  const src = ac.createBufferSource(), gn = ac.createGain();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = wantRate;
  gn.gain.setValueAtTime(0, t);
  gn.gain.linearRampToValueAtTime(1, t + 0.5);
  src.connect(gn).connect(musicBus);
  src.start(t);
  track = { name: wantTrack, src, gain: gn };
}

// name: 'menu' | 'game' | 'win' | null (silêncio)
export function music(name) {
  const k = name ? 'music_' + name : null;
  if (k === wantTrack) return;
  wantTrack = k;
  wantRate = 1;
  startTrack();
}

export function musicRate(r) {
  wantRate = r;
  if (track) track.src.playbackRate.setTargetAtTime(r, ac.currentTime, 0.25);
}

function applyBus(k) {
  const bus = k === 'music' ? musicBus : sfxBus;
  if (bus) bus.gain.setTargetAtTime(busGain(k), ac.currentTime, 0.05);
}

export function duck(on) { ducked = on; applyBus('music'); }

export const getVolume = (k) => vol[k];
export function setVolume(k, v) {
  vol[k] = Math.max(0, Math.min(1, v));
  try { localStorage.setItem('pingpow.vol.' + k, String(vol[k])); } catch { /* sem storage */ }
  applyBus(k);
}

// ---------- Efeitos ----------
function play(name, { rate = 1, vol = 1, delay = 0 } = {}) {
  const b = buffers[name];
  if (!live() || !b) return false;
  const t = ac.currentTime + delay;
  const src = ac.createBufferSource(), gn = ac.createGain();
  src.buffer = b;
  src.playbackRate.value = rate;
  gn.gain.value = vol;
  src.connect(gn).connect(sfxBus);
  src.start(t);
  return true;
}

function tone(freq, dur, { type = 'square', vol = 0.25, to = null, delay = 0 } = {}) {
  if (!live()) return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), gn = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  gn.gain.setValueAtTime(vol, t);
  gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(gn).connect(sfxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// Ruído passando por um filtro que varre de f0 a f1 ("fuuush").
function whoosh(dur, vol, f0, f1, delay = 0) {
  if (!live()) return;
  const t = ac.currentTime + delay, len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), gn = ac.createGain();
  src.buffer = buf;
  f.type = 'bandpass'; f.Q.value = 1.2;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  gn.gain.setValueAtTime(0.001, t);
  gn.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3);
  gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(gn).connect(sfxBus);
  src.start(t);
}

// Aplausos sintetizados: centenas de "palmas" curtas em momentos aleatórios.
function applause(vol, secs) {
  if (!live()) return;
  if (!clapBuf) {
    const sr = ac.sampleRate, len = Math.floor(sr * 2.4);
    clapBuf = ac.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = clapBuf.getChannelData(ch);
      for (let i = 0; i < 650; i++) {
        const t = Math.pow(Math.random(), 0.9) * 2.2;
        const s0 = Math.floor(t * sr), dur = Math.floor(sr * (0.006 + Math.random() * 0.012));
        const amp = 0.3 * (0.4 + Math.random()) * Math.min(1, t * 10) * Math.max(0, 1 - t / 2.3);
        let lp = 0;
        for (let j = 0; j < dur && s0 + j < len; j++) {
          const n = Math.random() * 2 - 1;
          lp += (n - lp) * 0.5;
          d[s0 + j] += (n - lp) * amp * Math.exp((-4 * j) / dur);
        }
      }
    }
  }
  const t = ac.currentTime;
  const src = ac.createBufferSource(), f = ac.createBiquadFilter(), gn = ac.createGain();
  src.buffer = clapBuf;
  f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 0.6;
  gn.gain.setValueAtTime(vol, t);
  gn.gain.setValueAtTime(vol, t + secs * 0.6);
  gn.gain.linearRampToValueAtTime(0, t + secs);
  src.connect(f).connect(gn).connect(sfxBus);
  src.start(t);
  src.stop(t + secs + 0.05);
}

const speedK = (s) => Math.max(0, Math.min(1, (s - BALL.startSpeed) / (BALL.maxSpeed - BALL.startSpeed)));
const anyHit = () => 'hit' + (1 + Math.floor(Math.random() * 3));

export const sfx = {
  hit(power, speed = BALL.startSpeed) {
    const rate = 0.92 + speedK(speed) * 0.3 + (Math.random() - 0.5) * 0.06;
    if (!play(anyHit(), { rate, vol: MIX.hit })) tone(660, 0.06, { vol: 0.2 });
    if (power === 'smash') { if (!play('smash', { vol: MIX.smash })) tone(220, 0.25, { to: 60, type: 'sawtooth', vol: 0.3 }); whoosh(0.35, 0.5, 300, 2600); }
    else if (power === 'curve') tone(500, 0.35, { to: 1500, type: 'sine', vol: 0.18 });
  },
  bounce() { if (!play('hit2', { rate: 1.75 + Math.random() * 0.1, vol: MIX.bounce })) tone(1400, 0.03, { type: 'triangle', vol: 0.08 }); },
  wall() { if (!play('wall', { rate: 0.95 + Math.random() * 0.15, vol: MIX.wall })) tone(330, 0.05, { type: 'triangle', vol: 0.2 }); },
  serve() { if (!play('hit3', { rate: 1.25, vol: MIX.serve })) tone(880, 0.05, { type: 'triangle', vol: 0.15 }); },
  point(good, crowd) {
    if (!play(good ? 'point' : 'pointBad', { vol: MIX.point })) { tone(523, 0.1, { vol: 0.08 }); tone(good ? 784 : 392, 0.18, { vol: 0.08, delay: 0.1 }); }
    if (crowd) applause(MIX.applause, 1.3);
  },
  matchPoint() { if (!play('matchPoint', { vol: MIX.matchPoint })) tone(440, 0.4, { type: 'square', vol: 0.06 }); },
  ready() { if (!play('ready', { vol: MIX.ready })) { tone(784, 0.08, { type: 'triangle', vol: 0.1 }); tone(1175, 0.15, { type: 'triangle', vol: 0.1, delay: 0.08 }); } },
  rally() { if (!play('ready', { rate: 1.3, vol: MIX.rally })) tone(1046, 0.12, { type: 'triangle', vol: 0.15 }); },
  power(kind) {
    if (kind === 'freeze') { if (!play('freeze', { vol: MIX.freeze })) tone(1800, 0.4, { to: 600, type: 'sine', vol: 0.3 }); play('ice', { delay: 0.12, vol: MIX.ice, rate: 1.2 }); }
    else if (kind === 'smash') { if (!play('fire', { vol: MIX.fire })) tone(150, 0.3, { to: 600, type: 'sawtooth', vol: 0.25 }); whoosh(0.45, 0.35, 200, 1800); }
    else if (!play('curve', { vol: MIX.curve })) tone(400, 0.3, { to: 900, type: 'sine', vol: 0.3 });
  },
  final() { applause(MIX.applauseFinal, 2.3); },
  lose() { if (!play('lose', { vol: MIX.lose })) [523, 494, 466, 440].forEach((f, i) => tone(f, 0.3, { vol: 0.08, delay: i * 0.3 })); },
  click() { play('click', { vol: MIX.click }); },
};
