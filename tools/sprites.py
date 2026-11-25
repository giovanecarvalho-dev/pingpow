#!/usr/bin/env python3
# Gera assets/sprites.json a partir dos PNGs em assets/sprites/ e confere nomes e tamanhos.
# Uso: python3 tools/sprites.py [pasta do projeto]   (rodar de novo sempre que colocar ou trocar um PNG)
# Ajustes feitos à mão no sprites.json (fps, anchor, flip) são mantidos enquanto o tamanho do quadro não mudar.
# Só usa a biblioteca padrão. Lista dos arquivos e como gerar: assets/sprites/README.md
import json, os, struct, sys

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'assets', 'sprites')
OUT = os.path.join(ROOT, 'assets', 'sprites.json')
FPS = {'idle': 5, 'run': 10, 'swing': 0, 'win': 8}  # swing acompanha a raquete (fps não é usado)


def expected():
    e = {}
    for k in ('a', 'b'):
        for v in ('back', 'front'):
            for st in ('idle', 'run', 'swing'):
                e[f'{k}_{v}_{st}'] = {'frame': 32, 'frames': 4, 'fps': FPS[st]}
        e[f'{k}_win'] = {'frame': 32, 'frames': 4, 'fps': FPS['win']}
        e[f'{k}_portrait'] = {'size': (64, 64)}
    e['ball'] = {'size': (8, 8), 'anchor': 'center'}
    for n in ('fire', 'curve', 'ice'):
        e[f'icon_{n}'] = {'size': (16, 16), 'anchor': 'center'}
    e['arena_bg'] = {'size': (270, 480), 'anchor': 'topleft'}
    return e


def png_size(path):
    with open(path, 'rb') as f:
        head = f.read(24)
    if head[:8] != b'\x89PNG\r\n\x1a\n' or head[12:16] != b'IHDR':
        return None
    return struct.unpack('>II', head[16:24])


def main():
    exp = expected()
    old = {}
    if os.path.exists(OUT):
        try:
            old = json.load(open(OUT, encoding='utf-8')).get('anims', {})
        except ValueError:
            print('aviso: sprites.json antigo inválido, gerando do zero')
    files = {os.path.splitext(f)[0]: f for f in os.listdir(DIR) if f.lower().endswith('.png')} if os.path.isdir(DIR) else {}
    anims, missing, problems = {}, [], []
    for name, spec in exp.items():
        f = files.get(name)
        if not f:
            missing.append(name)
            continue
        size = png_size(os.path.join(DIR, f))
        if not size:
            problems.append(f'{f}: não é um PNG válido')
            continue
        w, h = size
        if 'frame' in spec:  # tira horizontal de quadros quadrados
            fs, n = spec['frame'], spec['frames']
            if w % h:
                problems.append(f'{f}: {w}×{h} não divide em quadros {h}×{h} (esperado {fs * n}×{fs}: {n} quadros de {fs}×{fs})')
                continue
            if h != fs or w // h != n:
                problems.append(f'{f}: {w}×{h} = {w // h} quadros de {h}×{h} (esperado {n} de {fs}×{fs}); incluído assim mesmo')
            a = {'file': f, 'frame': [h, h], 'frames': w // h, 'fps': spec['fps'], 'anchor': [h // 2, h]}
        else:
            ew, eh = spec['size']
            if (w, h) != (ew, eh):
                problems.append(f'{f}: {w}×{h} (esperado {ew}×{eh}); incluído assim mesmo')
            anchor = {'center': [w // 2, h // 2], 'topleft': [0, 0]}.get(spec.get('anchor'), [w // 2, h])
            a = {'file': f, 'frame': [w, h], 'frames': 1, 'anchor': anchor}
        prev = old.get(name, {})
        if prev.get('frame') == a['frame']:
            for k in ('fps', 'anchor', 'flip'):
                if k in prev:
                    a[k] = prev[k]
        anims[name] = a
    extra = sorted(set(files) - set(exp))

    lines = [f'  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}' for k, v in anims.items()]
    body = '{\n "_info": "Gerado por tools/sprites.py. fps, anchor e flip podem ser ajustados à mão (o script mantém).",\n "anims": {'
    body += ('\n' + ',\n'.join(lines) + '\n ') if lines else ''
    body += '}\n}\n'
    with open(OUT, 'w', encoding='utf-8') as out:
        out.write(body)

    print(f'sprites.json: {len(anims)} de {len(exp)} arquivos')
    if missing:
        print('faltam (o jogo usa o desenho por código):', ', '.join(missing))
    for p in problems:
        print('problema:', p)
    if extra:
        print('nome desconhecido (ignorado):', ', '.join(f + '.png' for f in extra))
    return 1 if any('não' in p for p in problems) else 0


if __name__ == '__main__':
    sys.exit(main())
