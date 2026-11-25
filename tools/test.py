#!/usr/bin/env python3
# Teste completo antes de publicar (regra 13). Uso: python3 tools/test.py   (~3 min)
# Confere: sintaxe dos JS, bola não atravessa a raquete, service worker em dia e, no Chrome headless:
# CPU × CPU, 2 Jogadoras, online com duas "jogadoras" (partida, revanche, pausa, queda, saída),
# código errado, sprites (com provisórios) e offline + atualização do service worker.
# Só biblioteca padrão. Precisa de google-chrome e node. Sem Pillow, pula os sprites; sem internet, pula o online.
import json, os, shutil, socket, subprocess, sys, tempfile, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TMP = tempfile.mkdtemp(prefix='pingpow-test-')
PY = sys.executable
results = []


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


def run(cmd, cwd=ROOT, env=None):
    p = subprocess.run(cmd, cwd=cwd, env=env, shell=isinstance(cmd, str), capture_output=True, text=True)
    return p.returncode, p.stdout + p.stderr


def serve(folder, port):
    return subprocess.Popen([PY, '-m', 'http.server', str(port), '--bind', '127.0.0.1', '--directory', folder],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def copy_project(name):
    dst = os.path.join(TMP, name)
    shutil.copytree(ROOT, dst, ignore=shutil.ignore_patterns('.git', 'referencias', 'CLAUDE.md', 'node_modules'))
    return dst


def browser(name, url, steps, logs=True):
    out = os.path.join(TMP, name)
    os.makedirs(out, exist_ok=True)
    env = dict(os.environ, CDP_PORT=str(free_port()))
    code, text = run([PY, os.path.join(ROOT, 'tools', 'cdp.py'), out, url, json.dumps(steps)], env=env)
    ok = code == 0 and (not logs or 'logs: 0' in text)
    return ok, text


def record(name, t0, ok, text=''):
    results.append((name, ok, time.time() - t0, text))
    print(('✅' if ok else '❌'), name, f'({time.time() - t0:.0f} s)', flush=True)


def vis(i): return f'!document.getElementById("{i}").hidden'
def hid(i): return f'document.getElementById("{i}").hidden'
SCORE = ['expect', '/\\d+ × \\d+/.test(document.getElementById("over-score").textContent)', 'placar final']
# Espera o jogo carregar (o rótulo da versão é preenchido no boot), toca e espera o menu terminar de entrar.
BOOT = [['until', 'document.getElementById("version").textContent.length > 0', 20], ['tap', 195, 400],
        ['until', '!document.getElementById("screen-menu").hidden', 10], ['wait', 0.6]]


# ---------- Sem navegador ----------
def static_checks():
    t0 = time.time()
    files = [os.path.join('js', f) for f in os.listdir(os.path.join(ROOT, 'js')) if f.endswith('.js')] + ['sw.js']
    bad = [f for f in files if run(['node', '--experimental-default-type=module', '--check', f])[0]]
    record('sintaxe dos JS', t0, not bad, 'com erro: ' + ', '.join(bad))
    t0 = time.time(); code, text = run(['node', 'tools/sim_tunnel.mjs'])
    record('bola não atravessa a raquete (até o teto do smash)', t0, code == 0 and ' 0 atravessaram' in text, text)
    t0 = time.time(); code, text = run([PY, 'tools/release.py', '--check'])
    record('service worker em dia (versão e lista do cache)', t0, code == 0, text)


# ---------- Navegador ----------
def t_cpu(base):
    t0 = time.time()
    ok, text = browser('cpu', base + '/?debug=1&bot=easy', [
        ['until', vis('screen-over'), 240], SCORE,
        ['until', hid('screen-over'), 25], ['expect', vis('hud'), 'revanche começou']])
    record('CPU × CPU até o fim + revanche', t0, ok, text)


def t_local(base):
    t0 = time.time()
    ok, text = browser('local', base + '/', BOOT + [
        ['tapsel', '#btn-local'], ['wait', 1],
        ['expect', 'document.getElementById("hud").classList.contains("local")', 'HUD da P2 girado'],
        ['tapsel', '#btn-pause'], ['expect', vis('screen-pause'), 'pausou'],
        ['tapsel', '#btn-resume'], ['wait', 0.5], ['expect', hid('screen-pause'), 'continuou']])
    record('2 Jogadoras, pausa e continuar', t0, ok, text)


def t_online(base):
    t0 = time.time()
    code = os.path.join(TMP, 'code.txt')
    online = BOOT + [['tapsel', '#btn-online'], ['wait', 0.4]]
    host = online + [
        ['tapsel', '#btn-host'], ['until', 'document.getElementById("room-code").textContent.length===4', 25],
        ['save', 'document.getElementById("room-code").textContent', code],
        ['until', vis('hud'), 45], ['until', vis('screen-over'), 240], SCORE,
        ['until', hid('screen-over'), 25],                    # revanche: as duas CPUs confirmam
        ['wait', 2], ['tapsel', '#btn-pause'],
        ['until', hid('screen-pause'), 20],                   # a convidada tocou em Continuar
        ['until', vis('screen-pause'), 30],                   # a convidada caiu e voltou: as duas pausadas
        ['expect', 'netDebug.state().open && !netDebug.state().lost', 'reconectou'],
        ['wait', 3], ['tapsel', '#btn-resume'],               # dá tempo da convidada ver a pausa
        ['until', vis('notice'), 40],
        ['expect', 'document.getElementById("notice").textContent.includes("saiu")', 'aviso de que a outra saiu']]
    guest = online + [
        ['tapsel', '#btn-join'], ['typefile', '#join-code', code, 40], ['tapsel', '#btn-join-go'],
        ['until', vis('hud'), 45], ['until', vis('screen-over'), 240], SCORE,
        ['until', hid('screen-over'), 25],
        ['until', vis('screen-pause'), 25],                   # o host pausou
        ['wait', 1], ['tapsel', '#btn-resume'], ['wait', 2],
        ['eval', 'netDebug.drop()'],
        ['until', 'netDebug.state().open && !netDebug.state().lost', 15],
        ['until', vis('screen-pause'), 10],
        ['until', hid('screen-pause'), 30],                   # o host continuou
        ['wait', 1], ['tapsel', '#btn-pause'], ['wait', 0.5], ['tapsel', '#btn-pause-menu'], ['wait', 1],
        ['expect', vis('screen-menu'), 'voltou ao menu']]
    with ThreadPoolExecutor(2) as ex:
        fh = ex.submit(browser, 'online-host', base + '/?debug=1&bot=hard&online=1', host)
        fg = ex.submit(browser, 'online-guest', base + '/?debug=1&bot=easy&online=1', guest)
        (okh, th), (okg, tg) = fh.result(), fg.result()
    record('online: partida, revanche, pausa, queda/reconexão e saída', t0, okh and okg, '[host]\n' + th + '\n[convidada]\n' + tg)


def t_badcode(base):
    t0 = time.time()
    bad = os.path.join(TMP, 'bad.txt'); open(bad, 'w').write('ZZZZ')
    ok, text = browser('badcode', base + '/', BOOT + [
        ['tapsel', '#btn-online'], ['wait', 0.4], ['tapsel', '#btn-join'], ['typefile', '#join-code', bad, 5],
        ['tapsel', '#btn-join-go'], ['wait', 0.5], ['eval', 'document.getElementById("join-status").textContent'],
        ['until', 'document.getElementById("join-status").classList.contains("err")', 30],
        ['eval', 'document.getElementById("join-status").textContent'], ['shot', 'fim'],
        ['expect', 'document.getElementById("join-status").textContent.includes("não encontrada")', 'sala não encontrada']])
    record('online: código errado', t0, ok, text)


def t_sprites():
    t0 = time.time()
    proj = copy_project('proj-sprites')
    code, text = run([PY, 'tools/fake_sprites.py', os.path.join(proj, 'assets', 'sprites')])
    code2, text2 = run([PY, 'tools/sprites.py', proj])
    if code or code2 or '21 de 21' not in text2:
        record('sprites (provisórios)', t0, False, text + text2); return
    port = free_port(); srv = serve(proj, port)
    try:
        time.sleep(0.5)
        names = json.dumps(['a_back_idle', 'a_front_run', 'b_back_swing', 'b_win', 'ball', 'arena_bg', 'icon_fire', 'a_portrait'])
        ok, text = browser('sprites', f'http://127.0.0.1:{port}/?debug=1&bot=easy', [
            ['wait', 3],
            ['expect', f'import("./js/sprites.js").then(s => {names}.every(n => s.anim(n)))', 'sprites carregados'],
            ['expect', 'document.querySelector("canvas[data-key]").width === 64', 'retrato 64×64'],
            ['shot', 'partida']])
    finally:
        srv.kill()
    record('sprites (provisórios): personagens, bola, ícones, retratos e fundo', t0, ok, text)


def t_offline():
    t0 = time.time()
    proj = copy_project('proj-sw')
    port = free_port(); pidf = os.path.join(TMP, 'sw.pid')
    start = f'cd "{proj}" && ({PY} -m http.server {port} --bind 127.0.0.1 >/dev/null 2>&1 & echo $! > "{pidf}")'
    stop = f'kill $(cat "{pidf}")'
    rel = lambda v: f'{PY} "{ROOT}/tools/release.py" --root "{proj}" {v} "v{v} teste" >/dev/null'
    label = lambda v: f'document.getElementById("version").textContent === "v{v} teste"'
    run(start); time.sleep(0.7)
    try:
        ok, text = browser('offline', f'http://127.0.0.1:{port}/?sw=1', [
            ['until', '!!navigator.serviceWorker.controller', 30],
            ['until', 'import("./js/config.js").then(m => caches.has("pingpow-v" + m.CONFIG.VERSION))', 30],
            ['sh', stop], ['reload'],                                      # sem servidor
            ['expect', vis('screen-boot') + ' && document.getElementById("version").textContent.length > 0', 'abre offline'],
            ['expect', 'document.fonts.load(\'27px "Jersey 15"\').then(f => f.length > 0)', 'fonte offline'],
            ['expect', 'Promise.all(["hit1.wav", "music_game.mp3"].map(f => fetch("./assets/audio/" + f).then(r => r.ok)))'
                       '.then(a => a.every(Boolean))', 'som offline'],
            ['sh', rel('9.9.9') + ' && ' + start], ['wait', 0.7], ['reload'],  # versão nova no servidor
            ['until', label('9.9.9'), 60],                                 # na abertura, aplica sozinha
            ['wait', 1], ['tap', 195, 400], ['until', vis('screen-menu'), 10],
            ['sh', rel('9.9.10')],
            ['eval', 'navigator.serviceWorker.getRegistration().then(r => r.update()).then(() => 1)'],
            ['until', vis('update'), 60],                                  # no menu, mostra o aviso
            ['tapsel', '#update'],
            ['until', label('9.9.10'), 30],
            ['expect', 'caches.keys().then(k => k.filter(x => x.startsWith("pingpow-")).length === 1)', 'cache antigo apagado']],
            logs=False)  # offline, o navegador reclama de rede: esperado
    finally:
        run(stop)
    record('offline + atualização (na abertura e pelo aviso)', t0, ok, text)


def internet():
    try:
        return urllib.request.urlopen('https://0.peerjs.com/peerjs/id', timeout=6).status == 200
    except Exception:
        return False


def main():
    print('Teste completo (pasta temporária:', TMP + ')', flush=True)
    static_checks()
    port = free_port(); srv = serve(ROOT, port); base = f'http://127.0.0.1:{port}'
    time.sleep(0.5)
    jobs = [lambda: t_cpu(base), lambda: t_local(base), t_offline]
    if internet(): jobs += [lambda: t_online(base), lambda: t_badcode(base)]
    else: print('⚠️  sem acesso ao servidor do PeerJS: online pulado', flush=True)
    try:
        import PIL  # noqa: F401
        jobs.append(t_sprites)
    except ImportError:
        print('⚠️  sem Pillow (pip install pillow): teste de sprites pulado', flush=True)
    try:
        with ThreadPoolExecutor(len(jobs)) as ex:
            for f in [ex.submit(j) for j in jobs]: f.result()
    finally:
        srv.kill()
    bad = [r for r in results if not r[1]]
    for name, _, _, text in bad:
        print(f'\n--- {name} ---\n' + '\n'.join(text.strip().splitlines()[-25:]))
    print(f'\n{len(results) - len(bad)} de {len(results)} ok.', 'Prints e logs em ' + TMP if bad else '')
    if not bad: shutil.rmtree(TMP, ignore_errors=True)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
