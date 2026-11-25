#!/usr/bin/env python3
# Sprites provisórios (feios de propósito) só pra testar a integração da Fase 3. NÃO usar na pasta do projeto:
# o tools/test.sh gera numa cópia temporária. Os pontinhos amarelos no canto mostram o número do quadro.
# Uso: python3 tools/fake_sprites.py <pasta assets/sprites de uma cópia>   (requer Pillow)
import math, os, sys
from PIL import Image, ImageDraw

D = sys.argv[1]
os.makedirs(D, exist_ok=True)
COL = {'a': (255, 93, 143), 'b': (76, 201, 240)}
HAIR = {'a': (74, 42, 26), 'b': (30, 23, 38)}
SKIN, DARK = (242, 198, 160), (42, 33, 64)


def fig(d, ox, k, view, state, f):
    y0 = ([0, -1, 0, 1][f] if state == 'idle' else 0) + ([0, -3, -5, -3][f] if state == 'win' else 0)
    l, r = [(0, 3), (3, 0), (0, 3), (3, 0)][f] if state == 'run' else (0, 0)
    d.rectangle([ox + 11, 25 + y0 - l, ox + 14, 31 + y0], fill=DARK)
    d.rectangle([ox + 17, 25 + y0 - r, ox + 20, 31 + y0], fill=DARK)
    d.rectangle([ox + 9, 15 + y0, ox + 22, 25 + y0], fill=COL[k])
    if state == 'win':
        d.rectangle([ox + 5, 6 + y0, ox + 8, 16 + y0], fill=SKIN); d.rectangle([ox + 23, 6 + y0, ox + 26, 16 + y0], fill=SKIN)
    elif state == 'swing':
        a = [-60, -20, 20, 50][f] * math.pi / 180
        d.line([ox + 23, 17 + y0, ox + 23 + 8 * math.cos(a), 17 + y0 + 8 * math.sin(a)], fill=SKIN, width=3)
        d.rectangle([ox + 5, 16 + y0, ox + 8, 23 + y0], fill=SKIN)
    else:
        d.rectangle([ox + 5, 16 + y0, ox + 8, 23 + y0], fill=SKIN); d.rectangle([ox + 23, 16 + y0, ox + 26, 23 + y0], fill=SKIN)
    d.ellipse([ox + 8, 1 + y0, ox + 23, 15 + y0], fill=HAIR[k] if view == 'back' else SKIN)
    if view != 'back':
        d.rectangle([ox + 8, 1 + y0, ox + 23, 4 + y0], fill=HAIR[k])
        d.rectangle([ox + 12, 8 + y0, ox + 13, 10 + y0], fill=(20, 10, 30)); d.rectangle([ox + 18, 8 + y0, ox + 19, 10 + y0], fill=(20, 10, 30))
    for i in range(f + 1):
        d.point([ox + 1 + i * 2, 1], fill=(255, 210, 63))


def strip(name, k, view, state):
    im = Image.new('RGBA', (128, 32)); d = ImageDraw.Draw(im)
    for f in range(4):
        fig(d, f * 32, k, view, state, f)
    im.save(f'{D}/{name}.png')


for k in 'ab':
    for view in ('back', 'front'):
        for st in ('idle', 'run', 'swing'):
            strip(f'{k}_{view}_{st}', k, view, st)
    strip(f'{k}_win', k, 'front', 'win')
    im = Image.new('RGBA', (64, 64), COL[k] + (255,)); d = ImageDraw.Draw(im)
    d.ellipse([12, 6, 52, 50], fill=HAIR[k]); d.ellipse([16, 14, 48, 50], fill=SKIN)
    d.rectangle([24, 28, 27, 32], fill=(20, 10, 30)); d.rectangle([37, 28, 40, 32], fill=(20, 10, 30))
    d.rectangle([28, 40, 36, 42], fill=(192, 72, 94)); d.text((4, 50), k.upper() + ' 64', fill=(255, 255, 255))
    im.save(f'{D}/{k}_portrait.png')
im = Image.new('RGBA', (8, 8)); d = ImageDraw.Draw(im)
d.ellipse([0, 0, 7, 7], fill=(255, 140, 0), outline=(120, 40, 0)); d.point([2, 2], fill='white'); im.save(f'{D}/ball.png')
for n, c in (('fire', (255, 138, 31)), ('curve', (192, 139, 255)), ('ice', (159, 227, 255))):
    im = Image.new('RGBA', (16, 16)); d = ImageDraw.Draw(im)
    d.polygon([(8, 0), (15, 8), (8, 15), (0, 8)], fill=c, outline=(21, 18, 44)); d.rectangle([6, 6, 9, 9], fill='white')
    im.save(f'{D}/icon_{n}.png')
im = Image.new('RGBA', (270, 480), (70, 50, 40, 255)); d = ImageDraw.Draw(im)
for y in range(0, 480, 12):
    d.line([0, y, 270, y], fill=(90, 66, 50))
im.save(f'{D}/arena_bg.png')
print('21 sprites provisórios em', D)
