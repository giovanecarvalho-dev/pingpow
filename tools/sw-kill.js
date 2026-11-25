// EMERGÊNCIA: o service worker deu problema (ex.: a cliente ficou presa numa versão quebrada).
// 1. Copie este arquivo por cima do sw.js:   cp tools/sw-kill.js sw.js
// 2. Em js/config.js, ponha OFFLINE: false (senão a página registra o service worker de novo).
// 3. Publique (git push). Na próxima abertura, ele apaga os caches, se desinstala e recarrega do servidor.
// Pra voltar ao normal: git checkout do sw.js antigo, OFFLINE: true e python3 tools/release.py <versão nova>.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith('pingpow-')) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url);
})()));
