"""
Convierte los renders PNG (16 bit) a WebP responsivos en public/img/.

Uso:
    python tools/render/export_web.py <carpeta_renders> [--suffix _prev]
"""
from __future__ import annotations

import argparse
import os

from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "..", "public", "img")

SETS = {
    "hero": ("hero-lifestyle", (800, 1400, 2000)),
    "flotante": ("flotante", (600, 1000, 1400)),
    "mensula": ("mensula", (600, 1000, 1400)),
    "toallero": ("toallero", (600, 1000, 1400)),
    "tablones": ("tablones", (800, 1000, 1400)),
    "macro_pino": ("macro-pino", (600, 900, 1200)),
    "macro_encino": ("macro-encino", (600, 900, 1200)),
    "macro_parota": ("macro-parota", (600, 900, 1200)),
    "macro_nogal": ("macro-nogal", (600, 900, 1200)),
    "kit": ("kit", (600, 1000, 1400)),
}


def load(path):
    im = Image.open(path)
    if im.mode in ("I;16", "I;16B", "I"):
        im = im.point(lambda v: v / 257).convert("L")
    return im.convert("RGB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("--suffix", default="")
    a = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    for key, (name, widths) in SETS.items():
        p = os.path.join(a.src, f"{key}{a.suffix}.png")
        if not os.path.exists(p):
            print("falta", p)
            continue
        im = load(p)
        for w in widths:
            h = round(im.height * w / im.width)
            r = im.resize((w, h), Image.LANCZOS) if w < im.width else im.copy()
            if w < im.width:
                r = r.filter(ImageFilter.UnsharpMask(radius=0.6, percent=40, threshold=2))
            r.save(os.path.join(OUT, f"{name}-{w}.webp"), "WEBP", quality=82, method=6)
        print("ok", name, im.size)
        if key == "hero":
            # imagen para redes sociales 1200x630
            w, h = im.size
            ch = round(w * 630 / 1200)
            top = max(0, (h - ch) // 2)
            og = im.crop((0, top, w, top + ch)).resize((1200, 630), Image.LANCZOS)
            og.save(os.path.join(HERE, "..", "..", "public", "og.jpg"), "JPEG", quality=86, optimize=True,
                    progressive=True)


if __name__ == "__main__":
    main()
