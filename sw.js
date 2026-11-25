// Service worker (Fase 5): o jogo abre offline e cada atualização chega inteira.
// Cada versão tem o próprio cache, HTML junto: HTML e JS de versões diferentes nunca se misturam.
// A versão nova baixa em segundo plano; o jogo aplica sozinho na próxima abertura
// ou mostra "Nova versão — toque para atualizar".
// NÃO editar VERSION nem a lista à mão: python3 tools/release.py <versão>
const VERSION = '0.3.1';
const CACHE = 'pingpow-v' + VERSION;
// <precache>
const FILES = [
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/ai.js',
  './js/audio.js',
  './js/config.js',
  './js/fx.js',
  './js/input.js',
  './js/main.js',
  './js/match.js',
  './js/net.js',
  './js/physics.js',
  './js/powers.js',
  './js/pwa.js',
  './js/render.js',
  './js/sprites.js',
  './js/sync.js',
  './js/ui.js',
  './js/vendor/peerjs.min.js',
  './assets/audio/click.wav',
  './assets/audio/curve.mp3',
  './assets/audio/fire.mp3',
  './assets/audio/freeze.wav',
  './assets/audio/hit1.wav',
  './assets/audio/hit2.wav',
  './assets/audio/hit3.wav',
  './assets/audio/ice.wav',
  './assets/audio/lose.mp3',
  './assets/audio/matchPoint.mp3',
  './assets/audio/music_game.mp3',
  './assets/audio/music_menu.mp3',
  './assets/audio/music_win.mp3',
  './assets/audio/point.mp3',
  './assets/audio/pointBad.mp3',
  './assets/audio/ready.mp3',
  './assets/audio/smash.wav',
  './assets/audio/wall.wav',
  './assets/fonts/Jersey15.woff2',
  './assets/icons/icon-180.png',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/sprites.json',
];
// </precache>

self.addEventListener('install', (e) => {
  // Tudo ou nada: versão incompleta não instala (o navegador tenta de novo depois).
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(FILES.map((f) =>
    fetch(f, { cache: 'reload' }).then((r) => {
      if (!r.ok) throw new Error(f + ' ' + r.status);
      return c.put(f, r);
    })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('pingpow-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// O jogo pede pra trocar de versão (toque no aviso ou na abertura do app).
self.addEventListener('message', (e) => { if (e.data === 'skip') self.skipWaiting(); });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // PeerJS e afins: rede
  const key = req.mode === 'navigate' ? './index.html' : req; // ?debug=1 etc. abrem o mesmo HTML
  e.respondWith(caches.open(CACHE)
    .then((c) => c.match(key, { ignoreSearch: true }))
    .then((r) => r || fetch(req)));
});
