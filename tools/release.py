#!/usr/bin/env python3
# Nova versão pra publicar: sobe o VERSION (js/config.js e sw.js) e refaz a lista do cache offline do sw.js.
# Uso: python3 tools/release.py 0.3.2 ["v0.3 protótipo"]   (o rótulo do menu é opcional)
#      python3 tools/release.py --check                      (só confere; o tools/test.sh usa)
#      python3 tools/release.py --root <pasta> ...            (outra cópia do projeto; usado nos testes)
# Todo push precisa de versão nova: é ela que faz o service worker baixar a atualização.
import json, os, re, sys

args = sys.argv[1:]
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if args[:1] == ['--root']:
    ROOT, args = os.path.abspath(args[1]), args[2:]
CONFIG, SW = os.path.join(ROOT, 'js', 'config.js'), os.path.join(ROOT, 'sw.js')


def files():
    """Tudo que o jogo usa, com caminhos relativos ao sw.js."""
    out = ['./index.html', './manifest.webmanifest']
    pats = [('css', ('.css',)), ('js', ('.js',)), ('js/vendor', ('.js',)), ('assets/audio', ('.wav', '.mp3')),
            ('assets/fonts', ('.woff2',)), ('assets/icons', ('.png',))]
    for d, exts in pats:
        full = os.path.join(ROOT, d)
        out += sorted(f'./{d}/{f}' for f in os.listdir(full) if f.endswith(exts) and os.path.isfile(os.path.join(full, f)))
    sj = os.path.join(ROOT, 'assets', 'sprites.json')
    if os.path.exists(sj):
        out.append('./assets/sprites.json')
        anims = json.load(open(sj, encoding='utf-8')).get('anims', {})
        out += sorted({f"./assets/sprites/{a['file']}" for a in anims.values()})
    return out


def read(p): return open(p, encoding='utf-8').read()


def precache_block(lst):
    body = ''.join(f"\n  '{f}'," for f in lst)
    return f"// <precache>\nconst FILES = [{body}\n];\n// </precache>"


cfg, sw = read(CONFIG), read(SW)
cfg_v = re.search(r"VERSION: '([^']+)'", cfg).group(1)
sw_v = re.search(r"const VERSION = '([^']+)';", sw).group(1)
block = precache_block(files())
cur_block = re.search(r'// <precache>.*?// </precache>', sw, re.S).group(0)

if args[:1] == ['--check']:
    probs = []
    if cfg_v != sw_v: probs.append(f'VERSION diferente: config.js {cfg_v} × sw.js {sw_v}')
    if cur_block != block: probs.append('lista do cache desatualizada (arquivo novo ou removido)')
    for p in probs: print('problema:', p)
    print('sw.js ok' if not probs else 'rode: python3 tools/release.py <versão nova>')
    sys.exit(1 if probs else 0)

if not args:
    print(__doc__ or 'uso: python3 tools/release.py <versão> ["rótulo"]'); sys.exit(2)
v = args[0]
if not re.fullmatch(r'\d+\.\d+\.\d+', v): sys.exit('versão no formato 0.3.2')
cfg = re.sub(r"VERSION: '[^']+'", f"VERSION: '{v}'", cfg, count=1)
if len(args) > 1:
    cfg = re.sub(r"VERSION_LABEL: '[^']+'", f"VERSION_LABEL: '{args[1]}'", cfg, count=1)
sw = re.sub(r"const VERSION = '[^']+';", f"const VERSION = '{v}';", sw, count=1)
sw = sw.replace(cur_block, block)
open(CONFIG, 'w', encoding='utf-8').write(cfg)
open(SW, 'w', encoding='utf-8').write(sw)
print(f'versão {cfg_v} → {v} · {len(files())} arquivos no cache offline')
