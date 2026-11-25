// PWA: registra o service worker (sw.js) e avisa quando uma versão nova terminou de baixar.
// Só liga no site de verdade (HTTPS) ou com ?sw=1. No servidor local fica desligado e se desinstala,
// pra o cache não servir arquivo velho enquanto se edita o código.
// Emergência: CONFIG.OFFLINE = false + tools/sw-kill.js no lugar do sw.js (ver o topo desse arquivo).
import { CONFIG } from './config.js';

let reg = null;

export function initPWA(onUpdate) {
  const sw = navigator.serviceWorker;
  if (!sw) return;
  const on = CONFIG.OFFLINE && (location.protocol === 'https:' || new URLSearchParams(location.search).has('sw'));
  if (!on) {
    sw.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    return;
  }
  // Trocou de versão (depois do toque no aviso): recarrega com os arquivos novos.
  let had = !!sw.controller, reloading = false;
  sw.addEventListener('controllerchange', () => {
    if (!had) { had = true; return; } // primeira instalação: só passou a controlar a página
    if (!reloading) { reloading = true; location.reload(); }
  });
  const check = () => { if (reg && reg.waiting && sw.controller) onUpdate(); };
  const watch = (n) => { if (n) n.addEventListener('statechange', () => { if (n.state === 'installed') check(); }); };
  sw.register('./sw.js', { updateViaCache: 'none' }).then((r) => {
    reg = r;
    check();
    watch(r.installing); // a busca pode ter começado antes desta linha
    r.addEventListener('updatefound', () => watch(r.installing));
  }).catch(() => {});
  // O app instalado volta do segundo plano sem recarregar: procura versão nova nessa hora.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && reg) reg.update().catch(() => {}); });
}

export const hasUpdate = () => !!(reg && reg.waiting && navigator.serviceWorker.controller);
export function applyUpdate() { if (hasUpdate()) reg.waiting.postMessage('skip'); }
