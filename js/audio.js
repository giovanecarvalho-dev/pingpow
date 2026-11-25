// Sons sintetizados com WebAudio (sem arquivos).
let ac = null, master = null;
let muted = false;
try { muted = localStorage.getItem('pingpow.muted') === '1'; } catch { /* sem storage */ }

export const isMuted = () => muted;

// Chamar dentro de um toque (iOS só libera áudio após gesto).
export function unlock() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ac.destination);
    }
    if (ac.state !== 'running') ac.resume();
    const src = ac.createBufferSource();
    src.buffer = ac.createBuffer(1, 1, 22050);
    src.connect(ac.destination);
    src.start(0);
  } catch { /* sem áudio */ }
}

export function toggleMute() {
  muted = !muted;
  try { localStorage.setItem('pingpow.muted', muted ? '1' : '0'); } catch { /* sem storage */ }
  if (master) master.gain.value = muted ? 0 : 0.6;
  return muted;
}

function tone(freq, dur, { type = 'square', vol = 0.25, to = null, delay = 0 } = {}) {
  if (!ac || muted || ac.state !== 'running') return;
  const t = ac.currentTime + delay;
  const o = ac.createOscillator(), gn = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  gn.gain.setValueAtTime(vol, t);
  gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(gn).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.2, delay = 0) {
  if (!ac || muted || ac.state !== 'running') return;
  const t = ac.currentTime + delay;
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource(), gn = ac.createGain();
  src.buffer = buf;
  gn.gain.value = vol;
  src.connect(gn).connect(master);
  src.start(t);
}

export const sfx = {
  hit(power) {
    if (power === 'smash') { noise(0.25, 0.35); tone(220, 0.25, { to: 60, type: 'sawtooth', vol: 0.3 }); }
    else if (power === 'curve') { tone(500, 0.3, { to: 1200, type: 'triangle', vol: 0.3 }); }
    else tone(660, 0.06, { vol: 0.2 });
  },
  wall() { tone(330, 0.05, { type: 'triangle', vol: 0.2 }); },
  serve() { tone(880, 0.05, { type: 'triangle', vol: 0.15 }); },
  point() { tone(523, 0.1, { vol: 0.2 }); tone(784, 0.18, { vol: 0.2, delay: 0.1 }); },
  ready() { tone(784, 0.08, { type: 'triangle' }); tone(1175, 0.15, { type: 'triangle', delay: 0.08 }); },
  power(kind) {
    if (kind === 'freeze') { tone(1800, 0.4, { to: 600, type: 'sine', vol: 0.3 }); noise(0.15, 0.1); }
    else if (kind === 'smash') tone(150, 0.3, { to: 600, type: 'sawtooth', vol: 0.25 });
    else tone(400, 0.3, { to: 900, type: 'sine', vol: 0.3 });
  },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { vol: 0.25, delay: i * 0.15 })); },
};
