# Driver mínimo do Chrome via DevTools Protocol: abre a página, executa passos e tira prints.
# Requer: pip install websocket-client. Uso: python3 tools/cdp.py <pasta de saída> <url> '<passos json>'
# Passos: ["wait",s] ["until","expr js",timeout] ["tap",x,y] ["tapsel","seletor"] ["drag","seletor",de,ate] ["eval","expr"] ["shot","nome"]
# Ex.: python3 tools/cdp.py /tmp/x 'http://127.0.0.1:5173/?debug=1&bot=easy' '[["until","!document.getElementById(\"screen-over\").hidden",150],["shot","vitoria"]]'
import json, sys, time, base64, subprocess, urllib.request, websocket, os, shutil
OUT = sys.argv[1]; URL = sys.argv[2]; STEPS = json.loads(sys.argv[3]); W, H = 390, 844
prof = OUT + '/prof'; shutil.rmtree(prof, ignore_errors=True)
chrome = subprocess.Popen(['google-chrome', '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9333', '--remote-allow-origins=http://127.0.0.1:9333', f'--user-data-dir={prof}', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required',
  f'--window-size={W},{H}', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    for _ in range(50):
        try: tabs = json.load(urllib.request.urlopen('http://127.0.0.1:9333/json')); break
        except Exception: time.sleep(0.2)
    ws = websocket.create_connection([t for t in tabs if t['type'] == 'page'][0]['webSocketDebuggerUrl'], origin='http://127.0.0.1:9333')
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
        if k == 'wait': t0 = time.time(); 
        if k == 'wait':
            while time.time() - t0 < st[1]: call('Runtime.evaluate', expression='1'); time.sleep(0.2)
        elif k == 'until':
            t0 = time.time()
            while time.time() - t0 < st[2]:
                r = call('Runtime.evaluate', expression=st[1], returnByValue=True)
                if r.get('result', {}).get('value'): break
                time.sleep(0.25)
            print('until', round(time.time() - t0, 1), 's')
        elif k == 'drag':
            r = call('Runtime.evaluate', expression=f"(()=>{{const b=document.querySelector({json.dumps(st[1])}).getBoundingClientRect();return [b.x,b.y+b.height/2,b.width]}})()", returnByValue=True)
            x0, y0, w = r['result']['value']
            call('Input.dispatchTouchEvent', type='touchStart', touchPoints=[{'x': x0 + w * st[2], 'y': y0}])
            for i in range(1, 9): call('Input.dispatchTouchEvent', type='touchMove', touchPoints=[{'x': x0 + w * (st[2] + (st[3] - st[2]) * i / 8), 'y': y0}])
            call('Input.dispatchTouchEvent', type='touchEnd', touchPoints=[]); time.sleep(0.15)
        elif k == 'tap': tap(st[1], st[2])
        elif k == 'tapsel':
            r = call('Runtime.evaluate', expression=f"(()=>{{const e=document.querySelector({json.dumps(st[1])});const b=e.getBoundingClientRect();return [b.x+b.width/2,b.y+b.height/2]}})()", returnByValue=True)
            x, y = r['result']['value']; tap(x, y)
        elif k == 'eval':
            r = call('Runtime.evaluate', expression=st[1], returnByValue=True); print('EVAL', st[1][:60], '=>', r.get('result', {}).get('value'))
        elif k == 'shot':
            r = call('Page.captureScreenshot', format='png'); open(f'{OUT}/{st[1]}.png', 'wb').write(base64.b64decode(r['data'])); print('shot', st[1])
    for l in logs: print(l)
    print('logs:', len(logs))
finally:
    chrome.kill()
