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


def make_og(im):
    """Imagen para compartir (1200x630): texto sobre ébano + recorte de la foto del hero."""
    from PIL import ImageDraw, ImageFont

    fonts = os.path.join(HERE, "..", "..", "node_modules", "@fontsource", "instrument-serif", "files")
    W, H = 1200, 630
    og = Image.new("RGBA", (W, H), (21, 17, 14, 255))
    w, h = im.size
    # zona de la repisa superior (jarrón, lámina)
    box = (int(w * 0.33), 0, int(w * 0.86), h)
    photo = im.crop(box)
    pw = round(photo.width * H / photo.height)
    photo = photo.resize((pw, H), Image.LANCZOS).convert("RGBA")
    x0 = W - pw
    og.alpha_composite(photo, (x0, 0))
    grad = Image.new("L", (W, 1))
    for x in range(W):
        t = 1.0 if x < x0 else max(0.0, 1 - (x - x0) / 170)
        grad.putpixel((x, 0), int(255 * t ** 1.6))
    shade = Image.new("RGBA", (W, H), (21, 17, 14, 255))
    shade.putalpha(grad.resize((W, H)))
    og = Image.alpha_composite(og, shade)
    d = ImageDraw.Draw(og)
    try:
        serif = ImageFont.truetype(os.path.join(fonts, "instrument-serif-latin-400-normal.woff"), 118)
        italic = ImageFont.truetype(os.path.join(fonts, "instrument-serif-latin-400-italic.woff"), 118)
        small = ImageFont.truetype(os.path.join(fonts, "instrument-serif-latin-400-normal.woff"), 46)
        body = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
    except OSError:
        og.convert("RGB").save(os.path.join(HERE, "..", "..", "public", "og.jpg"), "JPEG", quality=86)
        return
    d.text((64, 56), "VOLCHE", font=small, fill=(239, 232, 220))
    d.ellipse((66, 142, 76, 152), fill=(196, 154, 82))
    d.text((88, 134), "TALLER DE MADERA · HECHO A MANO EN MÉXICO", font=ImageFont.truetype(
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf", 15), fill=(167, 156, 142))
    d.text((60, 200), "Del tablón", font=serif, fill=(239, 232, 220))
    d.text((60, 318), "a tu pared.", font=italic, fill=(227, 192, 127))
    d.text((64, 492), "Repisas de madera maciza, a tu medida.", font=body, fill=(200, 190, 176))
    d.text((64, 526), "Diseña la tuya en 3D y cotiza por WhatsApp.", font=body, fill=(200, 190, 176))
    og.convert("RGB").save(os.path.join(HERE, "..", "..", "public", "og.jpg"), "JPEG", quality=88, optimize=True,
                           progressive=True)


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
            q = 88 if key.startswith("macro") else 84
            r.save(os.path.join(OUT, f"{name}-{w}.webp"), "WEBP", quality=q, method=6)
        print("ok", name, im.size)
        if key == "hero":
            make_og(im)


if __name__ == "__main__":
    main()
