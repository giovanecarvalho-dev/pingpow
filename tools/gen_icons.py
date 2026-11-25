"""Gera os ícones provisórios (pixel art) em assets/icons/.
Uso: python tools/gen_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "assets" / "icons"
BG, TABLE, LINE = "#1d1a3a", "#1f7a5a", "#e9fff4"
PINK, BLUE, BALL = "#ff5d8f", "#4cc9f0", "#fff6d8"


def base() -> Image.Image:
    # Desenha em 32×32 e amplia sem suavização (cara de pixel art).
    im = Image.new("RGB", (32, 32), BG)
    d = ImageDraw.Draw(im)
    d.rectangle([7, 5, 24, 26], fill=TABLE)
    d.rectangle([7, 5, 24, 26], outline=LINE)
    d.line([5, 15, 26, 15], fill=LINE)       # rede
    d.rectangle([11, 28, 19, 29], fill=PINK)  # raquete de baixo
    d.rectangle([12, 2, 20, 3], fill=BLUE)    # raquete de cima
    d.rectangle([18, 9, 20, 11], fill=BALL)   # bola
    d.point([(19, 8), (21, 10), (17, 10)], fill=BALL)
    return im


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    im = base()
    for size in (180, 192, 512):
        im.resize((size, size), Image.NEAREST).save(OUT / f"icon-{size}.png")
        print("ok", size)


if __name__ == "__main__":
    main()
