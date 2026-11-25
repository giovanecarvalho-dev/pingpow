// Online: conexão P2P com PeerJS (WebRTC). Sala com código, ping, queda e reconexão.
// Não sabe nada do jogo: entrega mensagens (objetos JSON) e avisa quando a conexão cai ou volta.
import { CONFIG } from './config.js';

const { NET } = CONFIG;
let peer = null, conn = null, pending = null;
let role = null;           // 'host' | 'guest' | null
let code = '', sid = '';   // sid: identifica a convidada quando ela reconecta
let started = false;       // a convidada já entrou na sala
let h = {};                // callbacks: code, ready, message, lost, back, fail, warn
let lastRecv = 0, lastPing = 0, lastTry = 0, lostAt = 0, lost = false, ping = 0;
let timer = 0, joinTimer = 0, lib = null;

export const getRole = () => role;
export const getPing = () => ping;
export const isLost = () => lost;
export const active = () => role !== null;
// ?debug=1: netDebug.drop() derruba a conexão (testa a reconexão).
if (CONFIG.DEBUG) window.netDebug = { drop: () => conn && conn.close(), state: () => ({ role, lost, ping, open: !!(conn && conn.open) }) };

function loadLib() {
  if (window.Peer) return Promise.resolve();
  lib = lib || new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = './js/vendor/peerjs.min.js';
    s.onload = ok;
    s.onerror = () => { lib = null; s.remove(); fail(new Error('peerjs')); };
    document.head.appendChild(s);
  });
  return lib;
}

const peerOpts = () => (NET.iceServers ? { config: { iceServers: NET.iceServers } } : {});

function newCode() {
  let c = '';
  for (let i = 0; i < NET.codeLen; i++) c += NET.codeChars[Math.floor(Math.random() * NET.codeChars.length)];
  return c;
}

export function send(msg) {
  if (conn && conn.open) try { conn.send(msg); } catch { /* canal fechando */ }
}

// ---------- Host ----------
export async function host(handlers) {
  leave();
  h = handlers; role = 'host';
  try { await loadLib(); } catch { return fail('server'); }
  if (role === 'host' && h === handlers) openHost();
}

function openHost() {
  code = newCode();
  const p = peer = new window.Peer(NET.prefix + code, peerOpts());
  p.on('open', () => { if (p === peer) h.code?.(code); });
  p.on('connection', (c) => { if (p === peer) accept(c); });
  p.on('disconnected', () => { if (p === peer) keepSignal(); });
  p.on('error', (e) => {
    if (p !== peer) return;
    if (e.type === 'unavailable-id') { p.destroy(); openHost(); } // código em uso: sorteia outro
    else if (!conn) fail(errKind(e)); // durante a partida quem decide é o ping
  });
}

// Mantém o host no servidor de sinalização (é por ele que a convidada reconecta).
function keepSignal() {
  if (peer && !peer.destroyed && peer.disconnected) try { peer.reconnect(); } catch { /* tenta de novo no próximo tick */ }
}

function accept(c) {
  c.on('data', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      if (msg.v !== CONFIG.VERSION) { refuse(c, 'version'); h.warn?.('version'); return; }
      if (conn && msg.sid !== sid) { refuse(c, 'busy'); return; } // sala cheia (ou outra pessoa)
      const again = !!conn;
      if (conn && conn !== c) try { conn.close(); } catch { /* já fechou */ }
      conn = c; sid = msg.sid;
      c.send({ t: 'welcome' });
      touch();
      if (again) back(); else { startTimer(); h.ready?.(); }
    } else if (c === conn) receive(msg);
  });
  c.on('close', () => { if (c === conn) goLost(); });
  c.on('error', () => { if (c === conn) goLost(); });
}

function refuse(c, why) {
  try { c.send({ t: 'bad', why }); } catch { /* ignora */ }
  setTimeout(() => { try { c.close(); } catch { /* ignora */ } }, 500);
}

// ---------- Convidada ----------
export async function join(roomCode, handlers) {
  leave();
  h = handlers; role = 'guest'; code = roomCode;
  sid = Math.random().toString(36).slice(2, 10);
  try { await loadLib(); } catch { return fail('server'); }
  if (role !== 'guest' || h !== handlers) return;
  const p = peer = new window.Peer(peerOpts());
  p.on('open', () => { if (p === peer && (!started || lost)) dial(); });
  p.on('error', (e) => {
    if (p !== peer) return;
    if (e.type === 'peer-unavailable') { if (!started) fail('noRoom'); } // reconectando: segue tentando
    else if (!started) fail(errKind(e));
  });
  joinTimer = setTimeout(() => { if (!started) fail('fail'); }, NET.joinTimeout * 1000);
}

function dial() {
  if (pending && pending !== conn) try { pending.close(); } catch { /* ignora */ }
  const c = pending = peer.connect(NET.prefix + code, { reliable: true, serialization: 'json' });
  c.on('open', () => c.send({ t: 'hello', v: CONFIG.VERSION, sid }));
  c.on('data', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'bad') { fail(msg.why); return; }
    if (msg.t === 'welcome') {
      if (conn && conn !== c) try { conn.close(); } catch { /* ignora */ }
      conn = c; pending = null;
      touch();
      if (started) back();
      else { started = true; clearTimeout(joinTimer); startTimer(); h.ready?.(); }
    } else if (c === conn) receive(msg);
  });
  c.on('close', () => { if (c === conn) goLost(); });
  c.on('error', () => { if (c === conn) goLost(); });
}

// ---------- Comum ----------
function receive(msg) {
  touch();
  if (msg.t === 'ping') send({ t: 'pong', ts: msg.ts });
  else if (msg.t === 'pong') { const rtt = performance.now() - msg.ts; ping = ping ? Math.round(ping * 0.6 + rtt * 0.4) : Math.round(rtt); }
  else h.message?.(msg);
}

function touch() {
  lastRecv = performance.now();
  if (lost && conn && conn.open) back();
}

function startTimer() {
  clearInterval(timer);
  lastRecv = lastPing = performance.now();
  timer = setInterval(tick, 250);
}

function tick() {
  const now = performance.now();
  if (!lost) {
    if (now - lastPing >= NET.pingEvery * 1000) { lastPing = now; send({ t: 'ping', ts: now }); }
    if (now - lastRecv > NET.timeout * 1000) goLost();
    return;
  }
  if (now - lostAt > NET.reconnectSecs * 1000) { fail('lost'); return; }
  if (role === 'host') keepSignal();
  else if (now - lastTry >= NET.retryEvery * 1000) {
    lastTry = now;
    if (peer.disconnected) { try { peer.reconnect(); } catch { /* tenta de novo */ } } // ao reabrir, 'open' chama dial()
    else dial();
  }
}

function goLost() {
  if (lost || !role) return;
  lost = true; lostAt = performance.now(); lastTry = 0;
  h.lost?.();
}

function back() {
  if (!lost) return;
  lost = false; lastRecv = performance.now();
  h.back?.();
}

// Voltou pro app (o iOS congela o JS em segundo plano): dá um tempo antes de achar que caiu.
export function wake() { if (role && !lost) lastRecv = performance.now(); }

function errKind(e) {
  return ['network', 'server-error', 'socket-error', 'socket-closed', 'ssl-unavailable', 'disconnected'].includes(e.type) ? 'server' : 'fail';
}

function fail(why) {
  const cb = h.fail;
  leave();
  cb?.(why);
}

// Sai da sala. Com `bye`, avisa a outra antes de fechar.
export function leave(bye = false) {
  if (bye) send({ t: 'bye' });
  clearInterval(timer); clearTimeout(joinTimer);
  const p = peer, c = conn, q = pending;
  setTimeout(() => { // dá tempo da última mensagem sair
    for (const x of [c, q]) if (x) try { x.close(); } catch { /* ignora */ }
    if (p) try { p.destroy(); } catch { /* ignora */ }
  }, bye ? 300 : 0);
  peer = conn = pending = null;
  role = null; started = false; lost = false; ping = 0; h = {};
}
