"""
Utilidades de Blender (bpy) para las fotos de producto de VOLCHE.

Todo se construye por código: tablas con madera procedural horneada
(tools/wood/wood.py), herrajes, props de estilismo, luz y cámara.
Se ejecuta con el módulo `bpy` de PyPI (Blender 5.0, Python 3.11).
"""
from __future__ import annotations

import math
import os
import sys
import time

import bpy  # noqa: I001  (bpy debe importarse antes que bmesh/mathutils)
import bmesh
import numpy as np
from mathutils import Euler, Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "wood"))
import wood  # noqa: E402

CACHE = os.environ.get("VOLCHE_TEX_CACHE", os.path.join(HERE, ".texcache"))
os.makedirs(CACHE, exist_ok=True)


# ------------------------------------------------------------------ scene --
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.lights, bpy.data.cameras):
        for b in list(block):
            block.remove(b)


def setup_render(w, h, samples=256, look="AgX - Medium High Contrast", exposure=0.0, threshold=0.01):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.device = "CPU"
    sc.cycles.samples = samples
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = threshold
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = "OPENIMAGEDENOISE"
    sc.cycles.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    sc.cycles.denoising_prefilter = "ACCURATE"
    sc.cycles.max_bounces = 10
    sc.cycles.diffuse_bounces = 5
    sc.cycles.glossy_bounces = 5
    sc.cycles.transmission_bounces = 10
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.sample_clamp_indirect = 8.0
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.view_settings.view_transform = "AgX"
    sc.view_settings.look = look
    sc.view_settings.exposure = exposure
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_depth = "16"
    sc.render.threads_mode = "AUTO"
    return sc


def render(path):
    sc = bpy.context.scene
    sc.render.filepath = path
    t = time.time()
    bpy.ops.render.render(write_still=True)
    print(f"[render] {os.path.basename(path)} {sc.render.resolution_x}x{sc.render.resolution_y} "
          f"in {time.time() - t:.0f}s", flush=True)


def world_sky(elev=18, rot=210, strength=0.35, sun_disc=False):
    w = bpy.data.worlds.new("sky")
    bpy.context.scene.world = w
    nt = w.node_tree
    nt.nodes.clear()
    sky = nt.nodes.new("ShaderNodeTexSky")
    sky.sky_type = "MULTIPLE_SCATTERING"
    sky.sun_disc = sun_disc
    sky.sun_elevation = math.radians(elev)
    sky.sun_rotation = math.radians(rot)
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = strength
    out = nt.nodes.new("ShaderNodeOutputWorld")
    nt.links.new(sky.outputs[0], bg.inputs[0])
    nt.links.new(bg.outputs[0], out.inputs[0])
    return w


def world_color(rgb, strength=1.0):
    w = bpy.data.worlds.new("bg")
    bpy.context.scene.world = w
    nt = w.node_tree
    bg = nt.nodes.get("Background") or nt.nodes.new("ShaderNodeBackground")
    col = hexlin(rgb) if isinstance(rgb, str) else srgb_to_lin(rgb)
    bg.inputs[0].default_value = (*col, 1.0)
    bg.inputs[1].default_value = strength
    return w


def camera(loc, target, lens=50, fstop=None, focus=None, sensor=36, shift=(0, 0)):
    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = lens
    cam_data.sensor_width = sensor
    cam_data.shift_x, cam_data.shift_y = shift
    cam = bpy.data.objects.new("cam", cam_data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location = Vector(loc)
    look_at(cam, Vector(target))
    if fstop:
        cam_data.dof.use_dof = True
        cam_data.dof.aperture_fstop = fstop
        cam_data.dof.focus_distance = focus if focus else (Vector(loc) - Vector(target)).length
    bpy.context.scene.camera = cam
    return cam


def look_at(obj, target, roll=0.0):
    d = target - obj.location
    q = d.to_track_quat("-Z", "Y")
    obj.rotation_euler = q.to_euler()
    if roll:
        obj.rotation_euler.rotate_axis("Z", roll)


def area_light(loc, target, size=1.0, size_y=None, power=200, color=(1, 1, 1), spread=180):
    ld = bpy.data.lights.new("area", "AREA")
    ld.energy = power
    ld.color = color
    if size_y:
        ld.shape = "RECTANGLE"
        ld.size, ld.size_y = size, size_y
    else:
        ld.size = size
    ld.spread = math.radians(spread)
    ob = bpy.data.objects.new("area", ld)
    bpy.context.scene.collection.objects.link(ob)
    ob.location = Vector(loc)
    look_at(ob, Vector(target))
    return ob


def sun(direction_to_sun, strength=4.0, angle=0.6, color=(1.0, 0.93, 0.83)):
    ld = bpy.data.lights.new("sun", "SUN")
    ld.energy = strength
    ld.angle = math.radians(angle)
    ld.color = color
    ob = bpy.data.objects.new("sun", ld)
    bpy.context.scene.collection.objects.link(ob)
    d = Vector(direction_to_sun).normalized()
    ob.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    return ob


# -------------------------------------------------------------- materials --
def srgb_to_lin(c):
    c = np.asarray(c, float)
    return tuple(np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4))


def hexlin(h):
    return srgb_to_lin(wood.hex2rgb(h))


def principled(name, color="#808080", rough=0.5, metallic=0.0, spec=0.5, coat=0.0, coat_rough=0.1,
               sheen=0.0, sss=0.0, transmission=0.0, ior=1.45, alpha=1.0):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    col = hexlin(color) if isinstance(color, str) else color
    p.inputs["Base Color"].default_value = (*col, 1)
    p.inputs["Roughness"].default_value = rough
    p.inputs["Metallic"].default_value = metallic
    p.inputs["Specular IOR Level"].default_value = spec
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Coat Roughness"].default_value = coat_rough
    p.inputs["Sheen Weight"].default_value = sheen
    p.inputs["Subsurface Weight"].default_value = sss
    p.inputs["Transmission Weight"].default_value = transmission
    p.inputs["IOR"].default_value = ior
    p.inputs["Alpha"].default_value = alpha
    return m


def _node(nt, kind, **kw):
    n = nt.nodes.new(kind)
    for k, v in kw.items():
        if k.startswith("in_"):
            n.inputs[k[3:].replace("_", " ")].default_value = v
        else:
            setattr(n, k, v)
    return n


def plaster(name="plaster", color="#e8e0d3", color2=None, scale=1.0, bump=0.25, rough=0.92):
    """Pared de estuco / cal: moteado suave + micro relieve."""
    m = principled(name, color, rough)
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    tc = _node(nt, "ShaderNodeTexCoord")
    n1 = _node(nt, "ShaderNodeTexNoise", in_Scale=1.6 * scale, in_Detail=6.0, in_Roughness=0.62)
    n2 = _node(nt, "ShaderNodeTexNoise", in_Scale=60.0 * scale, in_Detail=8.0, in_Roughness=0.7)
    nt.links.new(tc.outputs["Object"], n1.inputs["Vector"])
    nt.links.new(tc.outputs["Object"], n2.inputs["Vector"])
    ramp = _node(nt, "ShaderNodeValToRGB")
    c1 = hexlin(color)
    c2 = hexlin(color2) if color2 else tuple(v * 0.9 for v in c1)
    ramp.color_ramp.elements[0].position = 0.35
    ramp.color_ramp.elements[0].color = (*c2, 1)
    ramp.color_ramp.elements[1].position = 0.7
    ramp.color_ramp.elements[1].color = (*c1, 1)
    nt.links.new(n1.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], p.inputs["Base Color"])
    mx = _node(nt, "ShaderNodeMath", operation="MULTIPLY_ADD", in_Value=0.5)
    nt.links.new(n2.outputs["Fac"], mx.inputs[0])
    mx.inputs[1].default_value = 1.0
    mx.inputs[2].default_value = 0.0
    bmp = _node(nt, "ShaderNodeBump", in_Strength=bump, in_Distance=0.002)
    nt.links.new(n2.outputs["Fac"], bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], p.inputs["Normal"])
    return m


def fabric(name, color, rough=0.85, sheen=0.6, scale=900.0, bump=0.3):
    m = principled(name, color, rough, sheen=sheen)
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    tc = _node(nt, "ShaderNodeTexCoord")
    wv = _node(nt, "ShaderNodeTexWave", wave_type="BANDS", bands_direction="X", in_Scale=scale)
    wv2 = _node(nt, "ShaderNodeTexWave", wave_type="BANDS", bands_direction="Y", in_Scale=scale)
    nt.links.new(tc.outputs["Object"], wv.inputs["Vector"])
    nt.links.new(tc.outputs["Object"], wv2.inputs["Vector"])
    mx = _node(nt, "ShaderNodeMath", operation="MULTIPLY")
    nt.links.new(wv.outputs["Fac"], mx.inputs[0])
    nt.links.new(wv2.outputs["Fac"], mx.inputs[1])
    bmp = _node(nt, "ShaderNodeBump", in_Strength=bump, in_Distance=0.0005)
    nt.links.new(mx.outputs[0], bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], p.inputs["Normal"])
    return m


def terry(name, color, rough=0.95, sheen=1.0, scale=2600.0, bump=0.35):
    """Toalla de rizo: ruido fino (sin patrón regular que produzca moiré)."""
    m = principled(name, color, rough, sheen=sheen)
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Sheen Roughness"].default_value = 0.7
    tc = _node(nt, "ShaderNodeTexCoord")
    nz = _node(nt, "ShaderNodeTexNoise", in_Scale=scale, in_Detail=1.0, in_Roughness=0.5)
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    bmp = _node(nt, "ShaderNodeBump", in_Strength=bump, in_Distance=0.0008)
    nt.links.new(nz.outputs["Fac"], bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], p.inputs["Normal"])
    return m


def ceramic(name, color, rough=0.35, speckle=True, glaze=0.4):
    m = principled(name, color, rough, coat=glaze, coat_rough=0.15)
    if not speckle:
        return m
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    tc = _node(nt, "ShaderNodeTexCoord")
    vor = _node(nt, "ShaderNodeTexVoronoi", in_Scale=180.0)
    nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
    ramp = _node(nt, "ShaderNodeValToRGB")
    c = hexlin(color)
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (c[0] * 0.35, c[1] * 0.32, c[2] * 0.3, 1)
    ramp.color_ramp.elements[1].position = 0.06
    ramp.color_ramp.elements[1].color = (*c, 1)
    nt.links.new(vor.outputs["Distance"], ramp.inputs["Fac"])
    nz = _node(nt, "ShaderNodeTexNoise", in_Scale=6.0, in_Detail=3.0)
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    mix = _node(nt, "ShaderNodeMix", data_type="RGBA", blend_type="MULTIPLY")
    mix.inputs["Factor"].default_value = 0.12
    nt.links.new(ramp.outputs["Color"], mix.inputs["A"])
    nt.links.new(nz.outputs["Color"], mix.inputs["B"])
    nt.links.new(mix.outputs["Result"], p.inputs["Base Color"])
    return m


def metal(name, color, rough=0.3, aniso=0.0):
    m = principled(name, color, rough, metallic=1.0)
    m.node_tree.nodes["Principled BSDF"].inputs["Anisotropic"].default_value = aniso
    return m


def powder_coat(name="acero_negro", color="#141312", rough=0.42):
    m = principled(name, color, rough, spec=0.5, coat=0.0)
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    tc = _node(nt, "ShaderNodeTexCoord")
    nz = _node(nt, "ShaderNodeTexNoise", in_Scale=2500.0, in_Detail=2.0)
    nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
    bmp = _node(nt, "ShaderNodeBump", in_Strength=0.08, in_Distance=0.0003)
    nt.links.new(nz.outputs["Fac"], bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], p.inputs["Normal"])
    return m


def leaf_mat(name="hoja", color="#6f8466", back="#9fb07a"):
    m = bpy.data.materials.new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = _node(nt, "ShaderNodeOutputMaterial")
    p = _node(nt, "ShaderNodeBsdfPrincipled")
    p.inputs["Base Color"].default_value = (*hexlin(color), 1)
    p.inputs["Roughness"].default_value = 0.55
    p.inputs["Coat Weight"].default_value = 0.2
    tr = _node(nt, "ShaderNodeBsdfTranslucent")
    tr.inputs["Color"].default_value = (*hexlin(back), 1)
    mix = _node(nt, "ShaderNodeMixShader")
    mix.inputs["Fac"].default_value = 0.22
    nt.links.new(p.outputs[0], mix.inputs[1])
    nt.links.new(tr.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    return m


# ------------------------------------------------------------------ wood --
def _bake_face(tag, species, B, finish, u_rng, v_rng, fixed_axis, fixed_val, res_u, res_v, end=False, ss=2):
    """Hornea una cara plana: devuelve rutas de color/rough/height."""
    key = f"{tag}_{species}_{finish}_{res_u}x{res_v}"
    paths = [os.path.join(CACHE, f"{key}_{k}.png") for k in ("col", "rough", "h")]
    if all(os.path.exists(p) for p in paths):
        return paths
    from PIL import Image
    U_, V_ = wood.face_grid(u_rng[0], u_rng[1], v_rng[0], v_rng[1], res_u, res_v, ss)
    # v crece hacia arriba en la imagen -> invertimos filas al guardar
    F = np.full_like(U_, fixed_val)
    if fixed_axis == "z":
        P = (U_, V_, F)
    elif fixed_axis == "y":
        P = (U_, F, V_)
    else:
        P = (F, U_, V_)
    eg = np.ones_like(U_) if end else None
    rows = []
    col_all, rough_all, h_all = [], [], []
    # por bloques para no agotar memoria
    step = max(1, (1_500_000 // max(1, U_.shape[1])))
    for r0 in range(0, U_.shape[0], step):
        sl = slice(r0, r0 + step)
        c, r, h = wood.wood(P[0][sl], P[1][sl], P[2][sl], species, B, finish,
                            end_grain=None if eg is None else eg[sl])
        col_all.append(c)
        rough_all.append(r)
        h_all.append(h)
    col = wood.downsample(np.concatenate(col_all, 0), ss)[::-1]
    rough = wood.downsample(np.concatenate(rough_all, 0), ss)[::-1]
    h = wood.downsample(np.concatenate(h_all, 0), ss)[::-1]
    Image.fromarray(wood.to_u8(col)).save(paths[0])
    Image.fromarray(wood.to_u8(rough)).save(paths[1])
    hn = (h - h.min()) / max(1e-6, (h.max() - h.min()))
    Image.fromarray((hn * 65535).astype(np.uint16)).save(paths[2])
    return paths


def board(name, L, D, T, species="pino", seed=1, finish="natural", density=18.0, bevel=0.0022,
          loc=(0, 0, 0), rot=(0, 0, 0), coat=0.12, bump=0.35, end_density=None, parent=None):
    """Tabla maciza (medidas en cm) con madera horneada en 3 proyecciones.

    Ejes locales: x = largo, y = fondo, z = grosor. Posición en metros.
    """
    B = wood.board_params(seed, species, L)
    tag = f"{name}_s{seed}_{L:g}x{D:g}x{T:g}"
    ed = end_density or density * 1.6
    ru, rv = int(L * density), int(D * density)
    top = _bake_face(tag + "_top", species, B, finish, (-L / 2, L / 2), (-D / 2, D / 2), "z", T / 2, ru, rv)
    front = _bake_face(tag + "_front", species, B, finish, (-L / 2, L / 2), (-T / 2, T / 2), "y", -D / 2,
                       ru, max(8, int(T * ed)))
    end = _bake_face(tag + "_end", species, B, finish, (-D / 2, D / 2), (-T / 2, T / 2), "x", L / 2,
                     max(8, int(D * ed)), max(8, int(T * ed)), end=True)

    # malla: caja con bisel real
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * L / 100, v.co.y * D / 100, v.co.z * T / 100))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=4, profile=0.5, affect="EDGES",
                        clamp_overlap=True)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for f in me.polygons:
        f.use_smooth = True
    ob.location = Vector(loc)
    ob.rotation_euler = Euler(rot)
    if parent:
        ob.parent = parent
    # suavizado por ángulo
    mod = ob.modifiers.new("smooth", "NODES")
    try:
        bpy.context.view_layer.objects.active = ob
        ob.select_set(True)
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
    except Exception:
        pass
    ob.modifiers.remove(mod) if mod.name in ob.modifiers else None
    ob.data.materials.append(_wood_material(name, top, front, end, L, D, T, coat, bump))
    return ob


def _img(path, colorspace):
    im = bpy.data.images.load(path, check_existing=True)
    im.colorspace_settings.name = colorspace
    return im


def _wood_material(name, top, front, end, L, D, T, coat, bump):
    m = bpy.data.materials.new(name + "_wood")
    nt = m.node_tree
    p = nt.nodes["Principled BSDF"]
    p.inputs["Coat Weight"].default_value = coat
    p.inputs["Coat Roughness"].default_value = 0.22
    p.inputs["Specular IOR Level"].default_value = 0.5
    tc = _node(nt, "ShaderNodeTexCoord")
    geo = _node(nt, "ShaderNodeNewGeometry")
    sep = _node(nt, "ShaderNodeSeparateXYZ")
    nt.links.new(tc.outputs["Object"], sep.inputs[0])

    def remap(axis, size_cm):
        # coordenada objeto (m) -> [0,1]
        mth = _node(nt, "ShaderNodeMath", operation="MULTIPLY_ADD")
        nt.links.new(sep.outputs[axis], mth.inputs[0])
        mth.inputs[1].default_value = 100.0 / size_cm
        mth.inputs[2].default_value = 0.5
        return mth

    ux, uy, uz = remap("X", L), remap("Y", D), remap("Z", T)

    def vec(a, b):
        c = _node(nt, "ShaderNodeCombineXYZ")
        nt.links.new(a.outputs[0], c.inputs[0])
        nt.links.new(b.outputs[0], c.inputs[1])
        return c

    v_top, v_front, v_end = vec(ux, uy), vec(ux, uz), vec(uy, uz)

    # pesos triplanares por la normal en espacio objeto
    vt = _node(nt, "ShaderNodeVectorTransform", vector_type="NORMAL", convert_from="WORLD", convert_to="OBJECT")
    nt.links.new(geo.outputs["Normal"], vt.inputs[0])
    sn = _node(nt, "ShaderNodeSeparateXYZ")
    nt.links.new(vt.outputs[0], sn.inputs[0])
    ws = []
    for ax in ("X", "Y", "Z"):
        a = _node(nt, "ShaderNodeMath", operation="ABSOLUTE")
        nt.links.new(sn.outputs[ax], a.inputs[0])
        pw = _node(nt, "ShaderNodeMath", operation="POWER")
        nt.links.new(a.outputs[0], pw.inputs[0])
        pw.inputs[1].default_value = 6.0
        ws.append(pw)
    s1 = _node(nt, "ShaderNodeMath", operation="ADD")
    nt.links.new(ws[0].outputs[0], s1.inputs[0])
    nt.links.new(ws[1].outputs[0], s1.inputs[1])
    s2 = _node(nt, "ShaderNodeMath", operation="ADD")
    nt.links.new(s1.outputs[0], s2.inputs[0])
    nt.links.new(ws[2].outputs[0], s2.inputs[1])
    wn = []
    for w_ in ws:
        d = _node(nt, "ShaderNodeMath", operation="DIVIDE")
        nt.links.new(w_.outputs[0], d.inputs[0])
        nt.links.new(s2.outputs[0], d.inputs[1])
        wn.append(d)
    w_end, w_front, w_top = wn  # x -> testa, y -> canto, z -> cara

    def tri(i_top, i_front, i_end, cs):
        outs = []
        for pth, v in ((i_top, v_top), (i_front, v_front), (i_end, v_end)):
            t = _node(nt, "ShaderNodeTexImage", interpolation="Cubic", extension="EXTEND")
            t.image = _img(pth, cs)
            nt.links.new(v.outputs[0], t.inputs["Vector"])
            outs.append(t)
        m1 = _node(nt, "ShaderNodeMix", data_type="RGBA")
        m1.inputs["Factor"].default_value = 0
        # color = top*wt + front*wf + end*we
        a = _node(nt, "ShaderNodeVectorMath", operation="SCALE")
        nt.links.new(outs[0].outputs["Color"], a.inputs[0])
        nt.links.new(w_top.outputs[0], a.inputs["Scale"])
        b = _node(nt, "ShaderNodeVectorMath", operation="SCALE")
        nt.links.new(outs[1].outputs["Color"], b.inputs[0])
        nt.links.new(w_front.outputs[0], b.inputs["Scale"])
        c = _node(nt, "ShaderNodeVectorMath", operation="SCALE")
        nt.links.new(outs[2].outputs["Color"], c.inputs[0])
        nt.links.new(w_end.outputs[0], c.inputs["Scale"])
        ab = _node(nt, "ShaderNodeVectorMath", operation="ADD")
        nt.links.new(a.outputs[0], ab.inputs[0])
        nt.links.new(b.outputs[0], ab.inputs[1])
        abc = _node(nt, "ShaderNodeVectorMath", operation="ADD")
        nt.links.new(ab.outputs[0], abc.inputs[0])
        nt.links.new(c.outputs[0], abc.inputs[1])
        return abc

    col = tri(top[0], front[0], end[0], "sRGB")
    rgh = tri(top[1], front[1], end[1], "Non-Color")
    hgt = tri(top[2], front[2], end[2], "Non-Color")
    nt.links.new(col.outputs[0], p.inputs["Base Color"])
    sr = _node(nt, "ShaderNodeSeparateXYZ")
    nt.links.new(rgh.outputs[0], sr.inputs[0])
    nt.links.new(sr.outputs["X"], p.inputs["Roughness"])
    sh = _node(nt, "ShaderNodeSeparateXYZ")
    nt.links.new(hgt.outputs[0], sh.inputs[0])
    bmp = _node(nt, "ShaderNodeBump", in_Strength=bump, in_Distance=0.0004)
    nt.links.new(sh.outputs["X"], bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], p.inputs["Normal"])
    return m


# ------------------------------------------------------------- geometry --
def link(ob, parent=None):
    bpy.context.scene.collection.objects.link(ob)
    if parent:
        ob.parent = parent
    return ob


def mesh_from(name, verts, faces, mat=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces])
    me.update()
    for p in me.polygons:
        p.use_smooth = smooth
    ob = bpy.data.objects.new(name, me)
    link(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


def lathe(name, profile, segments=96, mat=None, loc=(0, 0, 0), close_bottom=True, subsurf=1):
    """Sólido de revolución. profile: [(r, z), ...] de abajo hacia arriba (m)."""
    verts, faces = [], []
    n = len(profile)
    for i in range(segments):
        a = 2 * math.pi * i / segments
        ca, sa = math.cos(a), math.sin(a)
        for r, z in profile:
            verts.append((r * ca, r * sa, z))
    for i in range(segments):
        i2 = (i + 1) % segments
        for j in range(n - 1):
            faces.append((i * n + j, i2 * n + j, i2 * n + j + 1, i * n + j + 1))
    if close_bottom and profile[0][0] > 0:
        c = len(verts)
        verts.append((0, 0, profile[0][1]))
        for i in range(segments):
            i2 = (i + 1) % segments
            faces.append((i2 * n, i * n, c))
    ob = mesh_from(name, verts, faces, mat)
    ob.location = Vector(loc)
    if subsurf:
        sm = ob.modifiers.new("sub", "SUBSURF")
        sm.levels = sm.render_levels = subsurf
    return ob


def box(name, sx, sy, sz, mat=None, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, segments=3):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * sx, v.co.y * sy, v.co.z * sz))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segments, profile=0.5,
                        affect="EDGES", clamp_overlap=True)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    link(ob)
    for p in me.polygons:
        p.use_smooth = bevel > 0
    ob.location = Vector(loc)
    ob.rotation_euler = Euler(rot)
    if mat:
        ob.data.materials.append(mat)
    if bevel > 0:
        try:
            bpy.context.view_layer.objects.active = ob
            bpy.ops.object.select_all(action="DESELECT")
            ob.select_set(True)
            bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
        except Exception:
            pass
    return ob


def cylinder(name, r, h, mat=None, loc=(0, 0, 0), rot=(0, 0, 0), seg=48, bevel=0.0):
    prof = [(r, 0.0), (r, h)]
    if bevel:
        prof = [(r - bevel, 0.0), (r, bevel), (r, h - bevel), (r - bevel, h)]
    prof = [(0.0001, 0.0)] + prof + [(0.0001, h)]
    ob = lathe(name, prof, seg, mat, loc, close_bottom=False, subsurf=0)
    ob.rotation_euler = Euler(rot)
    return ob


def tube_path(name, pts, radius, mat=None, bevel_res=12):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = bevel_res
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        sp.points[i].co = (*p, 1)
    ob = bpy.data.objects.new(name, cu)
    link(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


def bezier_tube(name, pts, radius, mat=None, bevel_res=6, taper=None):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = bevel_res
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
        if taper:
            bp.radius = taper[i]
    ob = bpy.data.objects.new(name, cu)
    link(ob)
    if mat:
        ob.data.materials.append(mat)
    return ob


def plane(name, sx, sy, mat=None, loc=(0, 0, 0), rot=(0, 0, 0)):
    ob = mesh_from(name, [(-sx / 2, -sy / 2, 0), (sx / 2, -sy / 2, 0), (sx / 2, sy / 2, 0), (-sx / 2, sy / 2, 0)],
                   [(0, 1, 2, 3)], mat, smooth=False)
    ob.location = Vector(loc)
    ob.rotation_euler = Euler(rot)
    return ob


def sweep(name, width, depth, height, radius, mat=None, loc=(0, 0, 0)):
    """Fondo infinito de estudio (ciclorama): suelo que se curva hacia la pared."""
    prof = []
    steps = 24
    prof.append((-depth, 0.0))
    for i in range(steps + 1):
        a = -math.pi / 2 + (math.pi / 2) * i / steps
        prof.append((radius * math.cos(a) - radius + 0.0, radius + radius * math.sin(a)))
    prof.append((0.0, height))
    # prof: (y, z) sobre la línea; extruimos en x
    verts, faces = [], []
    for x in (-width / 2, width / 2):
        for y, z in prof:
            verts.append((x, y + depth * 0 + 0.0, z))
    n = len(prof)
    for j in range(n - 1):
        faces.append((j, j + 1, n + j + 1, n + j))
    # y: de -depth (frente) a 0 (pared)
    ob = mesh_from(name, [(v[0], -v[1] if False else v[1], v[2]) for v in verts], faces, mat)
    ob.location = Vector(loc)
    return ob


# --------------------------------------------------------------- props ----
def book(name, w, h, d, cover="#6b3d2e", loc=(0, 0, 0), rot=(0, 0, 0), page="#efe6d4", parent=None):
    """Libro: tapas + bloque de páginas. w = grosor lomo, h = alto, d = fondo."""
    root = bpy.data.objects.new(name, None)
    link(root)
    cov = fabric(name + "_tapa", cover, rough=0.75, sheen=0.35, scale=700.0, bump=0.15)
    pag = principled(name + "_pag", page, 0.85)
    t = 0.0022
    box(name + "_t1", t, d, h, cov, (-w / 2 + t / 2, 0, 0), bevel=0.0008).parent = root
    box(name + "_t2", t, d, h, cov, (w / 2 - t / 2, 0, 0), bevel=0.0008).parent = root
    box(name + "_lomo", w, t * 1.2, h, cov, (0, -d / 2 + t * 0.6, 0), bevel=0.001).parent = root
    pb = box(name + "_hojas", w - 2 * t, d - t * 1.5, h - 0.006, pag, (0, 0.0005, 0), bevel=0.0006)
    pb.parent = root
    # rayado de páginas
    nt = pag.node_tree
    pr = nt.nodes["Principled BSDF"]
    tc = _node(nt, "ShaderNodeTexCoord")
    wv = _node(nt, "ShaderNodeTexWave", wave_type="BANDS", bands_direction="X", in_Scale=1400.0,
               in_Distortion=2.0)
    nt.links.new(tc.outputs["Object"], wv.inputs["Vector"])
    bmp = _node(nt, "ShaderNodeBump", in_Strength=0.25, in_Distance=0.0003)
    nt.links.new(wv.outputs["Fac"], bmp.inputs["Height"])
    nt.links.new(bmp.outputs["Normal"], pr.inputs["Normal"])
    root.location = Vector(loc)
    root.rotation_euler = Euler(rot)
    if parent:
        root.parent = parent
    # el origen del libro está en su centro; lo subimos para que apoye en z=0
    for c in root.children:
        c.location.z += h / 2
    return root


def branch(name, base, direction, length, leaf_mat, stem_mat, seed=0, leaves=14, leaf_size=0.022,
           bend=0.15):
    """Rama tipo eucalipto: tallo curvo con hojas redondas alternas."""
    rng = np.random.default_rng(seed)
    base = Vector(base)
    d = Vector(direction).normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 1e-3:
        side = Vector((1, 0, 0))
    side.normalize()
    pts = []
    for i in range(6):
        t = i / 5
        p = base + d * length * t + side * bend * length * t * t + Vector((0, 0, -0.08 * length * t * t))
        pts.append(p)
    bezier_tube(name + "_tallo", [tuple(p) for p in pts], 0.0018, stem_mat, taper=[1, 0.9, 0.8, 0.6, 0.45, 0.3])
    # hojas
    leaf_objs = []
    for i in range(leaves):
        t = 0.18 + 0.8 * i / max(1, leaves - 1)
        # posición interpolada en la polilínea
        f = t * 5
        k = min(4, int(f))
        p = pts[k].lerp(pts[k + 1], f - k)
        tang = (pts[k + 1] - pts[k]).normalized()
        s = leaf_size * (1.15 - 0.45 * t) * rng.uniform(0.85, 1.15)
        ang = (i % 2) * math.pi + rng.uniform(-0.4, 0.4)
        # disco ligeramente cóncavo
        seg = 20
        verts = [(0, 0, 0)]
        for j in range(seg):
            a = 2 * math.pi * j / seg
            verts.append((math.cos(a) * s, math.sin(a) * s * 0.92, 0.0))
        for j in range(seg):
            a = 2 * math.pi * j / seg
            verts.append((math.cos(a) * s * 0.5, math.sin(a) * s * 0.46, 0.0))
        faces = [(0, 1 + seg + j, 1 + seg + (j + 1) % seg) for j in range(seg)]
        faces += [(1 + seg + j, 1 + j, 1 + (j + 1) % seg, 1 + seg + (j + 1) % seg) for j in range(seg)]
        verts = [(x, y, 0.18 * (x * x + y * y) / s) for (x, y, z) in verts]
        lf = mesh_from(f"{name}_h{i}", verts, faces, leaf_mat)
        normal = tang.cross(side if i % 2 == 0 else -side).normalized()
        off = (side if i % 2 == 0 else -side) * s * 0.9
        lf.location = p + off
        rot_q = normal.to_track_quat("Z", "Y")
        lf.rotation_euler = rot_q.to_euler()
        lf.rotation_euler.rotate_axis("Z", ang)
        lf.rotation_euler.rotate_axis("X", rng.uniform(-0.5, 0.5))
        sol = lf.modifiers.new("sol", "SOLIDIFY")
        sol.thickness = 0.0006
        leaf_objs.append(lf)
    return leaf_objs


def window_gobo(name, center, normal, w=2.2, h=2.6, cols=3, rows=4, frame=0.06, mat=None):
    """Marco de ventana que proyecta sombras (fuera de cámara)."""
    if mat is None:
        mat = principled(name + "_m", "#111111", 0.9)
    parts = []
    c = Vector(center)
    for i in range(cols + 1):
        x = -w / 2 + w * i / cols
        parts.append(box(f"{name}_v{i}", frame, 0.05, h, mat, (x, 0, 0)))
    for j in range(rows + 1):
        z = -h / 2 + h * j / rows
        parts.append(box(f"{name}_h{j}", w, 0.05, frame * 0.8, mat, (0, 0, z)))
    # pared alrededor del hueco
    ext = 6.0
    parts.append(box(f"{name}_L", ext, 0.05, ext * 2, mat, (-w / 2 - ext / 2, 0, 0)))
    parts.append(box(f"{name}_R", ext, 0.05, ext * 2, mat, (w / 2 + ext / 2, 0, 0)))
    parts.append(box(f"{name}_T", w, 0.05, ext, mat, (0, 0, h / 2 + ext / 2)))
    parts.append(box(f"{name}_B", w, 0.05, ext, mat, (0, 0, -h / 2 - ext / 2)))
    root = bpy.data.objects.new(name, None)
    link(root)
    for p in parts:
        p.parent = root
        p.visible_camera = False
    root.location = c
    root.rotation_euler = Vector(normal).to_track_quat("Y", "Z").to_euler()
    return root
