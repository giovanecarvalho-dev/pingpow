// Barra de poder e os 3 poderes.
import { CONFIG } from './config.js';

const { POWERS } = CONFIG;
export const POWER_LIST = ['smash', 'curve', 'freeze'];

export function createPowers() {
  return { bar: [0, 0], stored: [null, null] };
}

// Rebatida da jogadora `side`. Retorna o poder sorteado se a barra encheu.
export function onHit(pw, side) {
  if (pw.stored[side]) return null; // não enche com poder guardado
  if (++pw.bar[side] < POWERS.hitsToFill) return null;
  pw.bar[side] = 0;
  pw.stored[side] = POWER_LIST[Math.floor(Math.random() * POWER_LIST.length)];
  return pw.stored[side];
}

// Ativa o poder guardado. Smash e curva ficam carregados na raquete; congelar é imediato.
export function activate(pw, m, side) {
  const p = pw.stored[side];
  if (!p) return null;
  pw.stored[side] = null;
  if (p === 'freeze') m.paddles[1 - side].frozen = POWERS.freezeSecs;
  else m.paddles[side].armed = p;
  return p;
}
