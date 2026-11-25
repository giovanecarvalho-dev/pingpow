# Driver mínimo do Chrome via DevTools Protocol: abre a página, executa passos e tira prints.
# Só biblioteca padrão (tem um cliente WebSocket próprio). Usado pelo tools/test.sh.
# Uso: python3 tools/cdp.py <pasta de saída> <url> '<passos json>'
# Passos: ["wait",s] ["until","expr js",timeout] ["expect","expr js","descrição"] ["eval","expr"]
#         ["tap",x,y] ["tapsel","seletor"] ["drag","seletor",de,ate] ["shot","nome"] ["reload"]
#         ["save","expr js","arquivo"] (grava o valor) · ["typefile","seletor","arquivo",timeout] (espera o arquivo e digita)
#         ["sh","comando"] (roda no shell, ex.: derrubar o servidor pra testar o offline)
# Expressões podem devolver Promise (são aguardadas). Sai com código 1 se um "until" estourar ou um "expect" falhar.
# Dois Chromes ao mesmo tempo (ex.: host e convidada do online): CDP_PORT=9334 numa das execuções.
import json, sys, time, base64, subprocess, urllib.request, urllib.parse, os, shutil, socket, struct

OUT = sys.argv[1]; URL = sys.argv[2]; STEPS = json.loads(sys.argv[3]); W, H = 390, 844
PORT = int(os.environ.get('CDP_PORT', 9333))


class WS:  # cliente WebSocket mínimo (texto, sem extensões), o suficiente pro DevTools
    def __init__(self, url):
        u = urllib.parse.urlparse(url)
        self.s = socket.create_connection((u.hostname, u.port))
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((f'GET {u.path} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\nUpgrade: websocket\r\n'
                        f'Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n').encode())
        buf = b''
        while b'\r\n\r\n' not in buf:
            buf += self.s.recv(4096)
        head, self.buf = buf.split(b'\r\n\r\n', 1)
        if b' 101 ' not in head.split(b'\r\n')[0]:
            raise RuntimeError(head.decode(errors='replace'))

    def _read(self, n):
        chunks, have = [self.buf], len(self.buf)
        while have < n:
            d = self.s.recv(1 << 20)
            if not d:
                raise ConnectionError('websocket fechado')
            chunks.append(d); have += len(d)
        data = b''.join(chunks)
        self.buf = data[n:]
        return data[:n]

    def send(self, text):
        data, mask = text.encode(), os.urandom(4)
        n = len(data)
        hdr = bytes([0x81]) + (bytes([0x80 | n]) if n < 126 else
                               bytes([0x80 | 126]) + struct.pack('>H', n) if n < 65536 else
                               bytes([0x80 | 127]) + struct.pack('>Q', n))
        body = (int.from_bytes(data, 'big') ^ (int.from_bytes((mask * (n // 4 + 1))[:n], 'big'))).to_bytes(n, 'big') if n else b''
        self.s.sendall(hdr + mask + body)

    def recv(self):
        msg = b''
        while True:
            b0, b1 = self._read(2)
            n = b1 & 0x7f
            if n == 126: n = struct.unpack('>H', self._read(2))[0]
            elif n == 127: n = struct.unpack('>Q', self._read(8))[0]
            if b1 & 0x80: self._read(4)
            data, op = self._read(n), b0 & 0x0f
            if op in (0, 1, 2): msg += data
            if op == 8: raise ConnectionError('websocket fechado')
            if b0 & 0x80 and op in (0, 1, 2): return msg.decode()


prof = OUT + '/prof'; shutil.rmtree(prof, ignore_errors=True)
chrome = subprocess.Popen(['google-chrome', '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  f'--remote-debugging-port={PORT}', f'--remote-allow-origins=http://127.0.0.1:{PORT}', '--disable-features=WebRtcHideLocalIpsWithMdns',
  f'--user-data-dir={prof}', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required',
  f'--window-size={W},{H}', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
failed = False
try:
    for _ in range(50):
        try: tabs = json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json')); break
        except Exception: time.sleep(0.2)
    ws = WS([t for t in tabs if t['type'] == 'page'][0]['webSocketDebuggerUrl'])
    mid = [0]; logs = []
    def call(method, **params):
        mid[0] += 1; i = mid[0]; ws.send(json.dumps({'id': i, 'method': method, 'params': params}))
        while True:
            msg = json.loads(ws.recv())
            if msg.get('method') == 'Runtime.consoleAPICalled':
                logs.append(msg['params']['type'] + ': ' + ' '.join(str(a.get('value', a.get('description', ''))) for a in msg['params']['args']))
            elif msg.get('method') == 'Runtime.exceptionThrown':
                d = msg['params']['exceptionDetails']; logs.append('EXCEPTION: ' + d.get('exception', {}).get('description', d.get('text', '')))
            elif msg.get('method') == 'Log.entryAdded':
                e = msg['params']['entry']
                if e['level'] in ('error', 'warning'): logs.append(f"LOG {e['level']}: {e['text']} {e.get('url','')}")
            if msg.get('id') == i: return msg.get('result', {})
    def js(expr):
        r = call('Runtime.evaluate', expression=expr, returnByValue=True, awaitPromise=True)
        return r.get('result', {}).get('value')
    call('Runtime.enable'); call('Log.enable'); call('Page.enable')
    call('Emulation.setDeviceMetricsOverride', width=W, height=H, deviceScaleFactor=2, mobile=True)
    call('Emulation.setTouchEmulationEnabled', enabled=True, maxTouchPoints=5)
    call('Page.navigate', url=URL); time.sleep(1.5)
    def tap(x, y):
        for t in ('touchStart', 'touchEnd'):
            call('Input.dispatchTouchEvent', type=t, touchPoints=[{'x': x, 'y': y}] if t == 'touchStart' else [])
        time.sleep(0.15)
    for st in STEPS:
        k = st[0]
        try:
            if k == 'wait':
                t0 = time.time()
                while time.time() - t0 < st[1]: call('Runtime.evaluate', expression='1'); time.sleep(0.2)
            elif k == 'until':
                t0 = time.time(); okv = False
                while time.time() - t0 < st[2]:
                    if js(st[1]): okv = True; break
                    time.sleep(0.25)
                print('until', round(time.time() - t0, 1), 's' if okv else 's TIMEOUT: ' + st[1])
                if not okv: failed = True
            elif k == 'expect':
                v = js(st[1]); print(('ok: ' if v else 'FALHOU: ') + st[2], '' if v else f'({st[1]} => {v})')
                if not v: failed = True
            elif k == 'drag':
                x0, y0, w = js(f"(()=>{{const b=document.querySelector({json.dumps(st[1])}).getBoundingClientRect();return [b.x,b.y+b.height/2,b.width]}})()")
                call('Input.dispatchTouchEvent', type='touchStart', touchPoints=[{'x': x0 + w * st[2], 'y': y0}])
                for i in range(1, 9): call('Input.dispatchTouchEvent', type='touchMove', touchPoints=[{'x': x0 + w * (st[2] + (st[3] - st[2]) * i / 8), 'y': y0}])
                call('Input.dispatchTouchEvent', type='touchEnd', touchPoints=[]); time.sleep(0.15)
            elif k == 'tap': tap(st[1], st[2])
            elif k == 'tapsel':
                x, y = js(f"(()=>{{const e=document.querySelector({json.dumps(st[1])});const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]}})()")
                tap(x, y)
            elif k == 'eval':
                print('EVAL', st[1][:60], '=>', js(st[1]))
            elif k == 'save':
                v = js(st[1]); open(st[2] + '.tmp', 'w').write(str(v)); os.replace(st[2] + '.tmp', st[2]); print('save', v)  # de uma vez
            elif k == 'typefile':
                t0 = time.time()
                while not (os.path.exists(st[2]) and os.path.getsize(st[2])) and time.time() - t0 < st[3]: call('Runtime.evaluate', expression='1'); time.sleep(0.3)
                txt = open(st[2]).read().strip()
                js(f"(()=>{{const e=document.querySelector({json.dumps(st[1])});e.value={json.dumps(txt)};e.dispatchEvent(new Event('input'))}})()")
                print('typed', txt)
            elif k == 'sh':
                subprocess.run(st[1], shell=True); print('sh', st[1][:60])
            elif k == 'reload':
                call('Page.reload', ignoreCache=False); time.sleep(1.5); print('reload')
            elif k == 'shot':
                r = call('Page.captureScreenshot', format='png'); open(f'{OUT}/{st[1]}.png', 'wb').write(base64.b64decode(r['data'])); print('shot', st[1])
        except Exception as e:  # passo quebrou (ex.: seletor sumiu)
            print('FALHOU no passo', json.dumps(st)[:80], '->', repr(e)); failed = True
    for l in logs: print(l)
    print('logs:', len(logs))
finally:
    chrome.kill()
sys.exit(1 if failed else 0)
