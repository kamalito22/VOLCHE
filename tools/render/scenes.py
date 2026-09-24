"""
Escenas fotográficas de VOLCHE (Blender Cycles).

Uso:
    python tools/render/scenes.py <escena> [--preview] [--out DIR]

Escenas: hero, flotante, mensula, toallero, tablones, macro_<especie>, kit
"""
from __future__ import annotations

import argparse
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vlib as V  # noqa: E402
from mathutils import Vector  # noqa: E402

import numpy as np  # noqa: E402

rad = math.radians


# ------------------------------------------------------------- helpers ----
def room(wall="#e3d6c3", wall2="#d3c1a8", floor="#b99f80", wall_w=6.0, wall_h=3.4):
    wm = V.plaster("pared", wall, wall2, scale=1.0, bump=0.22)
    V.plane("muro", wall_w, wall_h, wm, (0, 0.0, wall_h / 2), (rad(90), 0, 0))
    fm = V.principled("piso", floor, 0.55)
    V.plane("suelo", wall_w, 6, fm, (0, -3, 0))


def sunlight(target, d, strength=4.2, angle=0.7, gobo=True, leaves=True, win=(1.7, 2.1, 2, 3), dist=2.8,
             color=(1.0, 0.9, 0.78)):
    d = Vector(d).normalized()
    V.sun(d, strength=strength, angle=angle, color=color)
    if gobo:
        V.window_gobo("ventana", center=Vector(target) + d * dist, normal=d, w=win[0], h=win[1], cols=win[2],
                      rows=win[3])
    if leaves:
        leaf = V.leaf_mat("hoja_sombra")
        stem = V.principled("tallo_sombra", "#4d3b2a", 0.8)
        base = Vector(target) + d * (dist * 0.55)
        side = d.cross(Vector((0, 0, 1))).normalized()
        rng = np.random.default_rng(4)
        for i in range(5):
            b = base + side * rng.uniform(-0.6, 0.2) + Vector((0, 0, rng.uniform(0.1, 0.9)))
            obs = V.branch(f"sombra{i}", tuple(b), tuple(side * rng.uniform(0.5, 1.0) + Vector((0, 0, -0.3))),
                           rng.uniform(0.5, 0.8), leaf, stem, seed=10 + i, leaves=18, leaf_size=0.035, bend=0.25)
            for o in obs:
                o.visible_camera = False
                o.visible_glossy = False


def warm_fill(loc=(0.0, -3.5, 1.6), target=(0, 0, 1.3), power=90, size=3.0):
    return V.area_light(loc, target, size=size, power=power, color=(1.0, 0.86, 0.72))


def vase_profile(h=0.26, r=0.055, neck=0.018, lip=0.024):
    pts = []
    for i in range(24):
        t = i / 23
        # cuerpo ovoide que se estrecha al cuello
        body = r * math.sin(math.pi * min(1.0, t * 1.15)) ** 0.8
        rr = max(neck, body) if t < 0.82 else neck + (lip - neck) * ((t - 0.82) / 0.18) ** 2
        pts.append((max(0.012, rr), h * t))
    return pts


def vessel(name, outer, thick=0.004, mat=None, loc=(0, 0, 0)):
    """Recipiente con pared: perfil exterior + interior desplazado."""
    inner = [(max(0.0005, r - thick), z) for r, z in outer[::-1] if z > thick]
    prof = [(0.0005, 0.0)] + outer + inner + [(0.0005, thick)]
    return V.lathe(name, prof, 96, mat, loc, close_bottom=False, subsurf=1)


def pilea(name, base, mat_leaf, mat_stem, n=11, seed=3, size=1.0):
    rng = np.random.default_rng(seed)
    base = Vector(base)
    for i in range(n):
        ang = 2 * math.pi * i / n + rng.uniform(-0.2, 0.2)
        up = rng.uniform(0.35, 1.0)
        length = rng.uniform(0.07, 0.13) * size
        tip = base + Vector((math.cos(ang) * length * 0.8, math.sin(ang) * length * 0.8, length * up + 0.02))
        mid = base.lerp(tip, 0.5) + Vector((0, 0, 0.02 * size))
        V.bezier_tube(f"{name}_p{i}", [tuple(base), tuple(mid), tuple(tip)], 0.0012, mat_stem)
        s = rng.uniform(0.022, 0.034) * size
        seg = 24
        verts = [(0, 0, 0)] + [(math.cos(2 * math.pi * j / seg) * s, math.sin(2 * math.pi * j / seg) * s, 0)
                                for j in range(seg)]
        verts = [(x, y, 0.22 * (x * x + y * y) / s) for x, y, z in verts]
        faces = [(0, 1 + j, 1 + (j + 1) % seg) for j in range(seg)]
        lf = V.mesh_from(f"{name}_h{i}", verts, faces, mat_leaf)
        out = (tip - base).normalized()
        nrm = (Vector((0, 0, 1)) * 1.4 + out * 0.9).normalized()
        lf.location = tip + out * s * 0.6
        lf.rotation_euler = nrm.to_track_quat("Z", "Y").to_euler()
        sol = lf.modifiers.new("sol", "SOLIDIFY")
        sol.thickness = 0.0008
        sub = lf.modifiers.new("sub", "SUBSURF")
        sub.levels = sub.render_levels = 1


def frame_print(name, w, h, loc, lean=rad(8), frame_col="#1b1714", art=None):
    """Cuadro apoyado contra la pared (marco + paspartú + lámina)."""
    root = V.bpy.data.objects.new(name, None)
    V.link(root)
    fm = V.principled(name + "_marco", frame_col, 0.5)
    t, d = 0.012, 0.018
    V.box(name + "_a", w, d, t, fm, (0, 0, t / 2), bevel=0.001).parent = root
    V.box(name + "_b", w, d, t, fm, (0, 0, h - t / 2), bevel=0.001).parent = root
    V.box(name + "_c", t, d, h, fm, (-w / 2 + t / 2, 0, h / 2), bevel=0.001).parent = root
    V.box(name + "_d", t, d, h, fm, (w / 2 - t / 2, 0, h / 2), bevel=0.001).parent = root
    pm = V.principled(name + "_pasp", "#efe9dd", 0.9)
    V.box(name + "_p", w - 2 * t, 0.002, h - 2 * t, pm, (0, 0.004, h / 2)).parent = root
    if art:
        am = V.principled(name + "_arte", "#ffffff", 0.8)
        nt = am.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = V.bpy.data.images.load(art)
        tc = nt.nodes.new("ShaderNodeTexCoord")
        mp = nt.nodes.new("ShaderNodeMapping")
        aw, ah = (w - 2 * t) * 0.62, (h - 2 * t) * 0.62
        mp.inputs["Scale"].default_value = (1 / aw, 1 / ah, 1)
        mp.inputs["Location"].default_value = (0.5, 0.5, 0)
        nt.links.new(tc.outputs["Object"], mp.inputs["Vector"])
        # la lámina está en el plano xz -> usamos (x, z) como uv
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        comb = nt.nodes.new("ShaderNodeCombineXYZ")
        nt.links.new(tc.outputs["Object"], sep.inputs[0])
        nt.links.new(sep.outputs["X"], comb.inputs[0])
        nt.links.new(sep.outputs["Y"], comb.inputs[1])
        nt.links.new(comb.outputs[0], mp.inputs["Vector"])
        nt.links.new(mp.outputs[0], tex.inputs[0])
        nt.links.new(tex.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
        art_ob = V.plane(name + "_lamina", aw, ah, am, (0, 0.0025, h / 2), (rad(90), 0, 0))
        art_ob.parent = root
    root.location = Vector(loc)
    root.rotation_euler = (lean, 0, 0)
    return root


def make_art(path, kind="arch", size=(900, 1200)):
    from PIL import Image, ImageDraw, ImageFilter
    w, h = size
    im = Image.new("RGB", size, (236, 228, 214))
    dr = ImageDraw.Draw(im)
    if kind == "arch":
        dr.rectangle([w * 0.22, h * 0.42, w * 0.78, h * 0.86], fill=(176, 94, 58))
        dr.ellipse([w * 0.22, h * 0.14, w * 0.78, h * 0.70], fill=(176, 94, 58))
        dr.ellipse([w * 0.52, h * 0.2, w * 0.72, h * 0.35], fill=(222, 186, 120))
    elif kind == "lines":
        for i in range(9):
            y = h * (0.2 + 0.07 * i)
            dr.line([w * 0.18, y, w * 0.82, y + 30 * math.sin(i)], fill=(60, 52, 44), width=6)
    else:
        dr.ellipse([w * 0.2, h * 0.25, w * 0.8, h * 0.7], fill=(92, 104, 84))
    im = im.filter(ImageFilter.GaussianBlur(1.2))
    # grano de papel
    arr = np.asarray(im).astype(np.float32)
    arr += np.random.default_rng(1).normal(0, 4, arr.shape)
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(path)
    return path


def books_row(prefix, x0, y, z, specs, lean_last=0.0, parent=None):
    """Libros de pie, uno junto a otro. specs: [(grosor, alto, fondo, color), ...]

    lean_last > 0: el último libro se recarga (hacia la izquierda) en su vecino.
    """
    x = x0
    rng = np.random.default_rng(len(prefix) + len(specs))
    for i, (w, h, d, c) in enumerate(specs):
        if i == len(specs) - 1 and lean_last:
            th = abs(lean_last)
            # la esquina superior izquierda toca al libro anterior
            bl = x + h * math.sin(th) - w * math.cos(th) * 0.0
            cx = bl + (w / 2) * math.cos(th)
            V.book(f"{prefix}{i}", w, h, d, c, (cx, y, z + (w / 2) * math.sin(th)), (0, -th, 0))
        else:
            V.book(f"{prefix}{i}", w, h, d, c, (x + w / 2, y + rng.uniform(-0.004, 0.004), z),
                   (0, 0, rng.uniform(-0.03, 0.03)))
        x += w + 0.0015


def books_stack(prefix, x, y, z, specs, twist=0.05):
    """Pila de libros acostados; devuelve la altura de la cara superior."""
    rng = np.random.default_rng(len(prefix))
    for i, (w, h, d, c) in enumerate(specs):
        # rotado 90° en Y: el alto queda en x y el grosor en vertical
        V.book(f"{prefix}{i}", w, h, d, c, (x - h / 2 + rng.uniform(-0.006, 0.006), y, z + w / 2),
               (0, rad(90), rng.uniform(-twist, twist)))
        z += w
    return z


# -------------------------------------------------------------- scenes ----
def scene_hero(preview):
    """Estilo de vida: dos repisas de nogal en muro de cal con luz de mañana."""
    V.setup_render(*((1200, 675) if preview else (2000, 1125)), samples=48 if preview else 160,
                   threshold=0.015, look="AgX - Medium High Contrast", exposure=0.15)
    room(wall="#e6d9c6", wall2="#d7c5ab")
    z1, z2 = 1.62, 1.22
    V.board("repisa_a", 110, 22, 4.0, "nogal", seed=11, density=16, loc=(-0.12, -0.111, z1))
    V.board("repisa_b", 80, 22, 4.0, "nogal", seed=23, density=16, loc=(0.26, -0.111, z2))
    top1, top2 = z1 + 0.02, z2 + 0.02
    # --- repisa superior
    ztop = books_stack("pila", -0.55, -0.1, top1, [(0.03, 0.24, 0.17, "#8f4a2f"), (0.022, 0.22, 0.16, "#8b977b"),
                                                   (0.028, 0.2, 0.15, "#d7c8ad")])
    bowl = V.ceramic("cuenco", "#2b2724", 0.45, glaze=0.3)
    vessel("cuenco", [(0.035, 0.0), (0.05, 0.012), (0.062, 0.03), (0.066, 0.042)], 0.004, bowl,
           (-0.55, -0.1, ztop))
    vm = V.ceramic("jarron", "#e9e1d3", 0.55, glaze=0.25)
    vessel("jarron", vase_profile(0.27, 0.06, 0.02, 0.026), 0.004, vm, (-0.12, -0.11, top1))
    leaf = V.leaf_mat("euca", "#7f9277", "#a9b98c")
    stem = V.principled("tallo", "#6a5a44", 0.7)
    V.branch("rama1", (-0.12, -0.11, top1 + 0.25), (-0.5, -0.15, 0.9), 0.46, leaf, stem, seed=1, leaves=16,
             leaf_size=0.02, bend=0.2)
    V.branch("rama2", (-0.12, -0.11, top1 + 0.25), (0.45, -0.25, 0.85), 0.42, leaf, stem, seed=2, leaves=14,
             leaf_size=0.019, bend=-0.25)
    V.branch("rama3", (-0.12, -0.105, top1 + 0.25), (0.05, -0.05, 1.0), 0.36, leaf, stem, seed=3, leaves=12,
             leaf_size=0.018, bend=0.1)
    art = make_art(os.path.join(V.CACHE, "arte_arco.png"), "arch")
    frame_print("cuadro", 0.3, 0.4, (0.24, -0.045, top1), lean=rad(-7), frame_col="#6b4a33", art=art)
    # --- repisa inferior
    books_row("libro", -0.1, -0.1, top2, [(0.028, 0.23, 0.16, "#2e2b28"), (0.02, 0.21, 0.15, "#6f7556"),
                                          (0.034, 0.24, 0.17, "#a0583a"), (0.024, 0.2, 0.15, "#cfbfa2"),
                                          (0.03, 0.225, 0.16, "#4b5563")], lean_last=rad(14))
    pot = V.ceramic("maceta", "#b86a45", 0.8, speckle=False, glaze=0.0)
    vessel("maceta", [(0.045, 0.0), (0.055, 0.02), (0.06, 0.07), (0.058, 0.09)], 0.005, pot,
           (0.45, -0.1, top2))
    soil = V.principled("tierra", "#2e2219", 0.95)
    V.cylinder("tierra", 0.053, 0.005, soil, (0.45, -0.1, top2 + 0.078))
    pilea("pilea", (0.45, -0.1, top2 + 0.08), V.leaf_mat("pilea", "#56733f", "#9dbb62"),
          V.principled("pilea_t", "#6d8a4a", 0.6), n=12, seed=5)
    glass = V.principled("ambar", "#b8742c", 0.05, transmission=1.0, ior=1.5)
    vessel("vela", [(0.034, 0.0), (0.036, 0.004), (0.036, 0.085)], 0.003, glass, (0.6, -0.09, top2))
    wax = V.principled("cera", "#efe4cf", 0.5, sss=0.5)
    V.cylinder("cera", 0.032, 0.06, wax, (0.6, -0.09, top2 + 0.004))
    V.world_sky(elev=22, rot=160, strength=0.12)
    sunlight((0.0, 0.0, 1.45), (-0.8, -1.0, 0.72), strength=4.6, angle=0.9, win=(1.6, 2.4, 2, 3), dist=3.0)
    warm_fill(power=70)
    V.camera((0.62, -2.45, 1.58), (0.05, -0.08, 1.5), lens=42, fstop=5.6, focus=2.45)


def scene_flotante(preview):
    """Producto: tres repisas flotantes de parota, luz lateral suave."""
    V.setup_render(*((800, 1000) if preview else (1400, 1750)), samples=48 if preview else 128,
                   threshold=0.015, exposure=0.1)
    room(wall="#ece5d9", wall2="#ddd1bf")
    zs = [1.72, 1.4, 1.08]
    lens = [70, 70, 70]
    for i, (z, L) in enumerate(zip(zs, lens)):
        V.board(f"flot{i}", L, 20, 3.8, "parota", seed=31 + i, density=18, loc=(0, -0.1, z))
    # estilismo mínimo
    vm = V.ceramic("florero", "#2a2623", 0.4, glaze=0.35)
    vessel("florero", vase_profile(0.18, 0.045, 0.016, 0.02), 0.004, vm, (0.2, -0.1, zs[0] + 0.019))
    leaf = V.leaf_mat("euca2", "#7f9277", "#a9b98c")
    stem = V.principled("tallo2", "#6a5a44", 0.7)
    V.branch("r1", (0.2, -0.1, zs[0] + 0.19), (-0.4, -0.2, 1.0), 0.3, leaf, stem, seed=7, leaves=12,
             leaf_size=0.017, bend=0.25)
    ztop = books_stack("pf", -0.18, -0.1, zs[1] + 0.019, [(0.028, 0.22, 0.16, "#ded2bd"),
                                                          (0.02, 0.2, 0.15, "#8a4b31")])
    cup = V.ceramic("taza", "#c9b79c", 0.5)
    vessel("taza", [(0.03, 0.0), (0.038, 0.01), (0.042, 0.075)], 0.003, cup, (-0.18, -0.1, ztop))
    pot = V.ceramic("maceta2", "#d8d0c2", 0.7, glaze=0.1)
    vessel("maceta2", [(0.04, 0.0), (0.05, 0.02), (0.052, 0.08)], 0.004, pot, (0.14, -0.1, zs[2] + 0.019))
    soil = V.principled("tierra2", "#2e2219", 0.95)
    V.cylinder("tierra2", 0.047, 0.004, soil, (0.14, -0.1, zs[2] + 0.09))
    pilea("pil2", (0.14, -0.1, zs[2] + 0.093), V.leaf_mat("pil2", "#56733f", "#9dbb62"),
          V.principled("pil2t", "#6d8a4a", 0.6), n=10, seed=9, size=0.9)
    V.world_sky(elev=30, rot=150, strength=0.1)
    sunlight((0, 0, 1.4), (-1.0, -0.8, 0.55), strength=3.6, angle=2.5, gobo=True, leaves=False,
             win=(1.2, 2.6, 1, 4), dist=2.4)
    warm_fill(power=110, loc=(0.8, -3.2, 1.4))
    V.camera((0.55, -2.25, 1.42), (0.0, -0.1, 1.4), lens=55, fstop=6.3, focus=2.3)


def strip_path(name, pts2d, width, thick, mat, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0012):
    """Pletina de acero siguiendo una trayectoria 2D (y, z); ancho en x."""
    P = [Vector((0, y, z)) for y, z in pts2d]
    verts, faces = [], []
    n = len(P)
    for i in range(n):
        a = P[max(0, i - 1)]
        b = P[min(n - 1, i + 1)]
        tng = (b - a).normalized()
        nrm = Vector((0, -tng.z, tng.y))
        for sx in (-width / 2, width / 2):
            for st in (-thick / 2, thick / 2):
                q = P[i] + nrm * st
                verts.append((sx, q.y, q.z))
    for i in range(n - 1):
        b0, b1 = i * 4, (i + 1) * 4
        # 0:(-w,-t) 1:(-w,+t) 2:(+w,-t) 3:(+w,+t)
        faces += [(b0 + 0, b1 + 0, b1 + 1, b0 + 1), (b0 + 2, b0 + 3, b1 + 3, b1 + 2),
                  (b0 + 0, b0 + 2, b1 + 2, b1 + 0), (b0 + 1, b1 + 1, b1 + 3, b0 + 3)]
    faces += [(0, 1, 3, 2), ((n - 1) * 4 + 0, (n - 1) * 4 + 2, (n - 1) * 4 + 3, (n - 1) * 4 + 1)]
    ob = V.mesh_from(name, verts, faces, mat, smooth=False)
    if bevel:
        bm = ob.modifiers.new("bev", "BEVEL")
        bm.width = bevel
        bm.segments = 3
        bm.limit_method = "ANGLE"
    ob.location = Vector(loc)
    ob.rotation_euler = rot
    return ob


def l_bracket(name, x, z_top, arm_h=0.15, arm_d=0.17, width=0.03, thick=0.005, mat=None, r=0.03):
    """Ménsula en L con esquina curva: brazo vertical en la pared, horizontal bajo la repisa."""
    pts = [(0.0 - thick / 2, z_top - arm_h)]
    pts.append((-thick / 2, z_top - thick / 2 - r))
    for i in range(1, 12):
        a = math.pi * i / 24
        pts.append((-thick / 2 - r + r * math.cos(a), z_top - thick / 2 - r + r * math.sin(a)))
    pts.append((-thick / 2 - r, z_top - thick / 2))
    pts.append((-arm_d, z_top - thick / 2))
    ob = strip_path(name, pts, width, thick, mat, (x, 0, 0))
    screw = V.principled(name + "_tor", "#2a2826", 0.35, metallic=1.0)
    for k, zz in enumerate((z_top - arm_h * 0.35, z_top - arm_h * 0.8)):
        V.cylinder(f"{name}_t{k}", 0.0045, 0.0025, screw, (x, -thick - 0.0005, zz), (rad(90), 0, 0))
    return ob


def terracotta_pot(name, x, y, z, s=1.0, color="#b8683f"):
    pot = V.ceramic(name, color, 0.85, speckle=False, glaze=0.0)
    vessel(name, [(0.036 * s, 0.0), (0.045 * s, 0.02 * s), (0.05 * s, 0.075 * s), (0.056 * s, 0.08 * s),
                  (0.056 * s, 0.095 * s)], 0.005, pot, (x, y, z))
    soil = V.principled(name + "_tierra", "#2e2219", 0.95)
    V.cylinder(name + "_t", 0.05 * s, 0.004, soil, (x, y, z + 0.085 * s))
    return z + 0.089 * s


def scene_mensula(preview):
    """Repisas de pino con ménsulas negras sobre muro verde salvia."""
    V.setup_render(*((800, 1000) if preview else (1400, 1750)), samples=48 if preview else 128,
                   threshold=0.015, exposure=0.15)
    room(wall="#8f967d", wall2="#7f876d", floor="#a88d6d")
    steel = V.powder_coat()
    zs = [1.6, 1.22]
    for i, z in enumerate(zs):
        V.board(f"pino{i}", 90, 20, 2.5, "pino", seed=41 + i, density=18, loc=(0, -0.1, z + 0.0125))
        for bx in (-0.3, 0.3):
            l_bracket(f"men{i}{bx}", bx, z, mat=steel)
    top1, top2 = zs[0] + 0.025, zs[1] + 0.025
    pilea("pm1", (-0.25, -0.1, terracotta_pot("tp1", -0.25, -0.1, top1)), V.leaf_mat("pm1l", "#50703b", "#9dbb62"),
          V.principled("pm1s", "#6d8a4a", 0.6), n=13, seed=12)
    terracotta_pot("tp2", -0.08, -0.1, top1, 0.75, "#c07a52")
    pilea("pm2", (-0.08, -0.1, top1 + 0.068), V.leaf_mat("pm2l", "#5b7a45", "#a3c46a"),
          V.principled("pm2s", "#6d8a4a", 0.6), n=8, seed=13, size=0.7)
    glass = V.principled("vidrio", "#dfe6e2", 0.02, transmission=1.0, ior=1.5)
    vessel("frasco", [(0.035, 0.0), (0.04, 0.01), (0.04, 0.14), (0.028, 0.155), (0.028, 0.17)], 0.003, glass,
           (0.16, -0.1, top1))
    beans = V.principled("cafe", "#3b2618", 0.4)
    V.cylinder("granos", 0.036, 0.09, beans, (0.16, -0.1, top1 + 0.004))
    books_row("lm", 0.05, -0.1, top2, [(0.03, 0.23, 0.16, "#e5dccb"), (0.024, 0.21, 0.15, "#b0643d"),
                                       (0.034, 0.24, 0.17, "#2f2c29"), (0.02, 0.2, 0.15, "#c9b48f")],
              lean_last=rad(14))
    bowl = V.ceramic("cuenco_m", "#e8e0d2", 0.5, glaze=0.3)
    vessel("cuenco_m", [(0.03, 0.0), (0.05, 0.015), (0.065, 0.04), (0.068, 0.05)], 0.004, bowl, (-0.22, -0.1, top2))
    V.world_sky(elev=25, rot=150, strength=0.12)
    sunlight((0, 0, 1.4), (-0.9, -1.0, 0.7), strength=4.0, angle=1.2, gobo=True, leaves=True,
             win=(1.4, 2.4, 2, 3), dist=2.8)
    warm_fill(power=90, loc=(0.9, -3.0, 1.5))
    V.camera((-0.5, -2.2, 1.55), (0.0, -0.1, 1.4), lens=52, fstop=6.3, focus=2.25)


def towel(name, x, z_bar, y_bar, width=0.42, front=0.3, back=0.26, r=0.009, mat=None, seed=2):
    rng = np.random.default_rng(seed)
    nu, nv = 40, 70
    # trayectoria en (y, z): cae por delante, pasa sobre la barra, cae por detrás
    path = []
    for i in range(nv):
        t = i / (nv - 1)
        L = front + math.pi * r + back
        sdist = t * L
        if sdist < front:
            path.append((y_bar - r, z_bar - front + sdist))
        elif sdist < front + math.pi * r:
            a = math.pi - (sdist - front) / r
            path.append((y_bar + r * math.cos(a), z_bar + r * math.sin(a)))
        else:
            path.append((y_bar + r, z_bar - (sdist - front - math.pi * r)))
    verts, faces = [], []
    for j in range(nv):
        py, pz = path[j]
        hang = max(0.0, z_bar - pz) / front
        for i in range(nu):
            u = i / (nu - 1)
            xx = x - width / 2 + u * width
            fold = 0.006 * hang * math.sin(u * 2 * math.pi * 3.2) + 0.0015 * hang * math.sin(u * 23.0)
            verts.append((xx + 0.006 * hang * math.sin(u * 7.0), py - fold - 0.004 * hang,
                          pz - 0.006 * hang * (u - 0.5) ** 2))
    for j in range(nv - 1):
        for i in range(nu - 1):
            a = j * nu + i
            faces.append((a, a + 1, a + nu + 1, a + nu))
    ob = V.mesh_from(name, verts, faces, mat)
    sol = ob.modifiers.new("sol", "SOLIDIFY")
    sol.thickness = 0.004
    sub = ob.modifiers.new("sub", "SUBSURF")
    sub.levels = sub.render_levels = 1
    return ob


def scene_toallero(preview):
    """Repisa de encino con respaldo y barra de latón (baño)."""
    V.setup_render(*((800, 1000) if preview else (1400, 1750)), samples=48 if preview else 128,
                   threshold=0.015, exposure=0.1)
    room(wall="#d9bba5", wall2="#c9a78f", floor="#9c8065")
    z = 1.3
    V.board("toal", 70, 15, 2.0, "encino", seed=51, density=20, loc=(0, -0.075, z + 0.01))
    V.board("resp", 70, 2.0, 5.8, "encino", seed=52, density=20, loc=(0, -0.01, z + 0.029))
    brass = V.metal("laton", "#c9a45c", 0.22)
    bx, by, bz = 0.335, -0.13, z - 0.04
    rr = 0.012
    pts = [(-bx, by, z - 0.002)]
    for k in range(9):
        a = math.pi + (math.pi / 2) * k / 8          # de 180° a 270°
        pts.append((-bx + rr + rr * math.cos(a), by, bz + rr + rr * math.sin(a)))
    for k in range(9):
        a = 1.5 * math.pi + (math.pi / 2) * k / 8    # de 270° a 360°
        pts.append((bx - rr + rr * math.cos(a), by, bz + rr + rr * math.sin(a)))
    pts.append((bx, by, z - 0.002))
    V.tube_path("barra", pts, 0.0045, brass)
    tmat = V.terry("toalla", "#7f8b6c")
    towel("toalla", 0.08, bz + 0.0045, by, width=0.36, front=0.32, back=0.27, r=0.0075, mat=tmat)
    # sobre la repisa: toalla enrollada, frascos ámbar, plantita
    t2 = V.terry("toalla2", "#ede6da")
    t3 = V.terry("toalla3", "#c9b89c")
    V.box("dobl1", 0.2, 0.12, 0.032, t2, (-0.2, -0.078, z + 0.036), (0, 0, rad(2)), bevel=0.012, segments=4)
    V.box("dobl2", 0.19, 0.115, 0.03, t3, (-0.198, -0.078, z + 0.067), (0, 0, rad(-3)), bevel=0.011, segments=4)
    soap = V.principled("jabon", "#e8dfcf", 0.6, sss=0.3)
    V.box("jabon", 0.07, 0.045, 0.022, soap, (-0.2, -0.08, z + 0.093), (0, 0, rad(6)), bevel=0.008, segments=4)
    amber = V.principled("ambar2", "#9a5a1c", 0.08, transmission=1.0, ior=1.5)
    vessel("bote1", [(0.03, 0.0), (0.032, 0.005), (0.032, 0.12), (0.014, 0.14), (0.012, 0.15)], 0.002, amber,
           (0.06, -0.075, z + 0.02))
    pump = V.metal("bomba", "#c9a45c", 0.25)
    V.cylinder("bomba", 0.008, 0.03, pump, (0.06, -0.075, z + 0.17))
    V.box("pico", 0.035, 0.008, 0.008, pump, (0.075, -0.075, z + 0.198))
    vessel("bote2", [(0.025, 0.0), (0.027, 0.005), (0.027, 0.09), (0.012, 0.105), (0.011, 0.112)], 0.002, amber,
           (0.13, -0.075, z + 0.02))
    V.cylinder("tapa2", 0.013, 0.02, V.principled("tapa", "#1a1918", 0.4), (0.13, -0.075, z + 0.132))
    pilea("pt", (0.25, -0.075, terracotta_pot("tpt", 0.25, -0.075, z + 0.02, 0.8, "#e9e2d6")),
          V.leaf_mat("ptl", "#50703b", "#9dbb62"), V.principled("pts", "#6d8a4a", 0.6), n=9, seed=21, size=0.8)
    V.world_sky(elev=28, rot=140, strength=0.12)
    sunlight((0, 0, 1.3), (-1.0, -0.9, 0.62), strength=3.8, angle=1.6, gobo=True, leaves=True,
             win=(1.0, 1.8, 1, 2), dist=2.6)
    warm_fill(power=80, loc=(0.8, -3.0, 1.3), target=(0, 0, 1.2))
    V.camera((0.42, -1.55, 1.36), (0.0, -0.08, 1.22), lens=50, fstop=5.0, focus=1.6)


def scene_tablones(preview):
    """Cuatro especies lado a lado sobre fondo hueso (vista cenital en diagonal)."""
    V.setup_render(*((900, 600) if preview else (1800, 1200)), samples=48 if preview else 128,
                   threshold=0.015, exposure=-0.25)
    bg = V.plaster("fondo", "#e9e1d4", "#ddd2c1", scale=0.6, bump=0.08, rough=0.95)
    V.plane("mesa", 8, 8, bg, (0, 0, 0))
    specs = [("pino", 61), ("encino", 62), ("parota", 63), ("nogal", 64)]
    ang = rad(-22)
    ca, sa = math.cos(ang), math.sin(ang)
    for i, (sp, sd) in enumerate(specs):
        yy = (i - 1.5) * 0.27
        xx = (i - 1.5) * 0.05
        V.board(f"tab_{sp}", 110, 22, 3.8, sp, seed=sd, density=16,
                loc=(xx * ca - yy * sa, xx * sa + yy * ca, 0.019), rot=(0, 0, ang))
    V.world_sky(elev=35, rot=130, strength=0.1)
    V.sun((-0.8, 0.35, 1.0), strength=3.4, angle=1.0, color=(1.0, 0.92, 0.82))
    V.area_light((1.4, -1.2, 1.6), (0, 0, 0), size=2.0, power=45, color=(1.0, 0.92, 0.84))
    V.camera((0.25, -1.05, 1.6), (0.0, -0.02, 0.0), lens=44, fstop=11, focus=1.9)


def scene_macro(preview, species):
    """Macro de la esquina: testa con anillos + cara superior, luz rasante, fondo oscuro."""
    V.setup_render(*((600, 750) if preview else (1200, 1500)), samples=48 if preview else 128,
                   threshold=0.015, exposure=-0.35, look="AgX - Medium High Contrast")
    V.world_color("#120f0d", 0.15)
    base = V.principled("base", "#1a1714", 0.75)
    V.plane("mesa", 4, 4, base, (0, 0, 0))
    seeds = dict(pino=71, encino=72, parota=73, nogal=74)
    L, D, T = 40, 20, 5.0
    ang = rad(-32)
    ctr = Vector((0.1, 0.03, T / 200))
    V.board(f"macro_{species}", L, D, T, species, seed=seeds[species], density=60, end_density=110,
            loc=tuple(ctr), rot=(0, 0, ang), bevel=0.0025)
    ca, sa = math.cos(ang), math.sin(ang)

    def w(lx, ly, lz=0.0):  # local (m) -> mundo
        return ctr + Vector((lx * ca - ly * sa, lx * sa + ly * ca, lz))

    corner = w(-L / 200, -D / 200, T / 200)
    focus_pt = w(-L / 200 + 0.03, -D / 200 + 0.035, T / 200 * 0.3)
    d = Vector((-1.0, -0.7))
    d.normalize()
    cam_dir = Vector((d.x * ca - d.y * sa, d.x * sa + d.y * ca, 0.62)).normalized()
    cam_pos = focus_pt + cam_dir * 0.4
    # luz rasante cálida desde atrás-izquierda, relleno frío suave, contra cálido
    V.area_light(tuple(w(-0.55, 0.45, 0.16)), tuple(focus_pt), size=0.45, size_y=0.15, power=22,
                 color=(1.0, 0.82, 0.62))
    V.area_light(tuple(focus_pt + cam_dir * 0.9 + Vector((0.2, 0, 0.4))), tuple(focus_pt), size=1.0, power=6,
                 color=(0.92, 0.95, 1.0))
    V.area_light(tuple(w(0.3, 0.6, 0.25)), tuple(corner), size=0.4, power=12, color=(1.0, 0.75, 0.5))
    V.camera(tuple(cam_pos), tuple(focus_pt), lens=70, fstop=7.1, focus=(cam_pos - focus_pt).length)


def scene_kit(preview):
    """Flat lay del kit de instalación: soporte oculto, taquetes, pijas, plantilla."""
    V.setup_render(*((800, 800) if preview else (1600, 1600)), samples=48 if preview else 128,
                   threshold=0.015, exposure=-0.1)
    lin = V.fabric("lino", "#d9cdb9", rough=0.95, sheen=0.3, scale=420.0, bump=0.35)
    V.plane("mesa", 3, 3, lin, (0, 0, 0))
    steel = V.powder_coat()
    # placa + varillas (soporte oculto)
    V.box("placa", 0.6, 0.03, 0.004, steel, (0, 0.12, 0.002), bevel=0.001)
    for xx in (-0.2, 0.2):
        V.cylinder(f"varilla{xx}", 0.006, 0.15, steel, (xx, 0.105, 0.0065), (rad(90), 0, 0), bevel=0.001)
    holes = V.principled("hueco", "#050505", 0.9)
    for xx in (-0.27, -0.09, 0.09, 0.27):
        V.cylinder(f"h{xx}", 0.0035, 0.0006, holes, (xx, 0.12, 0.004))
    zinc = V.metal("zinc", "#8e9496", 0.3)
    plastic = V.principled("taquete", "#8f8a82", 0.45, sss=0.1)
    for i in range(4):
        x0 = -0.12 + i * 0.08
        # pija
        V.cylinder(f"pija{i}", 0.0022, 0.05, zinc, (x0, -0.08, 0.0022), (rad(90), 0, 0))
        V.lathe(f"cabeza{i}", [(0.0001, 0.0), (0.0045, 0.0), (0.0045, 0.0008), (0.0022, 0.0035)], 32, zinc,
                (x0, -0.08 + 0.0, 0.0022), close_bottom=False, subsurf=0).rotation_euler = (rad(90), 0, 0)
        # taquete con costillas
        prof = [(0.0001, 0.0), (0.0042, 0.0)]
        for k in range(8):
            z0 = 0.004 + k * 0.0045
            prof += [(0.0042, z0), (0.0034, z0 + 0.0022)]
        prof += [(0.0028, 0.042), (0.0001, 0.042)]
        tq = V.lathe(f"taq{i}", prof, 32, plastic, (x0, -0.19, 0.0042), close_bottom=False, subsurf=0)
        tq.rotation_euler = (rad(90), 0, 0)
    # plantilla de papel
    from PIL import Image, ImageDraw, ImageFont
    tpl = os.path.join(V.CACHE, "plantilla.png")
    im = Image.new("RGB", (1600, 480), (244, 240, 232))
    dr = ImageDraw.Draw(im)
    dr.line([60, 240, 1540, 240], fill=(40, 36, 32), width=3)
    for xx in (160, 560, 1040, 1440):
        dr.ellipse([xx - 16, 224, xx + 16, 256], outline=(40, 36, 32), width=3)
        dr.line([xx, 200, xx, 280], fill=(40, 36, 32), width=2)
    try:
        f = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 34)
        dr.text((60, 60), "VOLCHE  ·  PLANTILLA DE INSTALACIÓN", fill=(40, 36, 32), font=f)
        dr.text((60, 380), "Nivela, marca los 4 puntos y perfora con broca de 6 mm", fill=(90, 84, 76),
                font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 26))
    except Exception:
        pass
    im.save(tpl)
    pap = V.principled("papel", "#ffffff", 0.9)
    nt = pap.node_tree
    tx = nt.nodes.new("ShaderNodeTexImage")
    tx.image = V.bpy.data.images.load(tpl)
    tc = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(tc.outputs["UV"], tx.inputs[0])
    nt.links.new(tx.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Base Color"])
    V.bpy.ops.mesh.primitive_plane_add(size=1.0, location=(0.02, -0.33, 0.0004))
    pl = V.bpy.context.active_object
    pl.scale = (0.64, 0.19, 1)
    pl.rotation_euler = (0, 0, rad(-2))
    pl.data.materials.append(pap)
    # muestra de madera
    V.board("muestra", 16, 8, 2.0, "parota", seed=81, density=40, loc=(-0.2, -0.54, 0.01), rot=(0, 0, rad(8)))
    V.board("muestra2", 16, 8, 2.0, "nogal", seed=82, density=40, loc=(0.03, -0.55, 0.01), rot=(0, 0, rad(-5)))
    V.world_sky(elev=40, rot=120, strength=0.15)
    V.sun((-0.6, -0.4, 1.0), strength=3.4, angle=1.0, color=(1.0, 0.93, 0.84))
    V.area_light((0.8, 0.6, 1.4), (0, -0.1, 0), size=1.5, power=35)
    V.camera((0.0, -0.2, 1.3), (0.0, -0.2, 0.0), lens=58)


SCENES = {
    "hero": scene_hero,
    "flotante": scene_flotante,
    "mensula": scene_mensula,
    "toallero": scene_toallero,
    "tablones": scene_tablones,
    "macro_pino": lambda p: scene_macro(p, "pino"),
    "macro_encino": lambda p: scene_macro(p, "encino"),
    "macro_parota": lambda p: scene_macro(p, "parota"),
    "macro_nogal": lambda p: scene_macro(p, "nogal"),
    "kit": scene_kit,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("scene")
    ap.add_argument("--preview", action="store_true")
    ap.add_argument("--out", default=os.path.join(HERE, "out"))
    a = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else sys.argv[1:])
    os.makedirs(a.out, exist_ok=True)
    V.reset()
    SCENES[a.scene](a.preview)
    V.render(os.path.join(a.out, f"{a.scene}{'_prev' if a.preview else ''}.png"))


if __name__ == "__main__":
    main()
