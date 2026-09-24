"""
VOLCHE · madera procedural sólida (solid texture).

La madera se modela como un tronco real: anillos de crecimiento alrededor de
una médula (pith) ligeramente inclinada respecto a la tabla. Cortar ese
"tronco" con los planos de la tabla produce la veta catedral en las caras,
arcos de anillos en las testas (end grain) y líneas rectas en los cantos,
igual que en la madera de verdad.

La misma función está portada a GLSL en src/three/wood/woodShader.js
(hash pcg3d + ruido de gradiente idénticos), así que las texturas horneadas
para Blender y el 3D en tiempo real del sitio muestran la misma veta.

Unidades: centímetros. Ejes de la tabla: x = largo (dirección de la fibra),
y = ancho/fondo, z = grosor.
"""
from __future__ import annotations

import numpy as np

np.seterr(over="ignore")

U = np.uint32
INV_U32 = np.float32(2.0 / 4294967295.0)


# ---------------------------------------------------------------- noise ----
# Hash barato por esquina: productos por eje combinados con XOR + lowbias32.
# (x+1)*K = x*K + K, así que las 8 esquinas comparten las 3 multiplicaciones.
KX, KY, KZ = U(0x8DA6B343), U(0xD8163841), U(0xCB1AB31F)


def _mix32(h):
    h = h ^ (h >> U(16))
    h = h * U(0x7FEB352D)
    h = h ^ (h >> U(15))
    h = h * U(0x846CA68B)
    h = h ^ (h >> U(16))
    return h


def _grad(h):
    h = _mix32(h)
    gx = (h & U(1023)).astype(np.float32) * np.float32(2.0 / 1023.0) - 1
    gy = ((h >> U(10)) & U(1023)).astype(np.float32) * np.float32(2.0 / 1023.0) - 1
    gz = ((h >> U(20)) & U(1023)).astype(np.float32) * np.float32(2.0 / 1023.0) - 1
    return gx, gy, gz


def gnoise(px, py, pz):
    """Ruido de gradiente 3D (quintic). Desviación típica ~0.31."""
    px = np.asarray(px, np.float32) + np.float32(4096.0)
    py = np.asarray(py, np.float32) + np.float32(4096.0)
    pz = np.asarray(pz, np.float32) + np.float32(4096.0)
    px, py, pz = np.broadcast_arrays(px, py, pz)
    ix, iy, iz = np.floor(px), np.floor(py), np.floor(pz)
    fx, fy, fz = px - ix, py - iy, pz - iz
    ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10)
    uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10)
    uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10)
    x0 = ix.astype(U) * KX
    y0 = iy.astype(U) * KY
    z0 = iz.astype(U) * KZ
    x1, y1, z1 = x0 + KX, y0 + KY, z0 + KZ

    def corner(hx, hy, hz, dx, dy, dz):
        gx, gy, gz = _grad(hx ^ hy ^ hz)
        return gx * (fx - dx) + gy * (fy - dy) + gz * (fz - dz)

    n000, n100 = corner(x0, y0, z0, 0, 0, 0), corner(x1, y0, z0, 1, 0, 0)
    n010, n110 = corner(x0, y1, z0, 0, 1, 0), corner(x1, y1, z0, 1, 1, 0)
    n001, n101 = corner(x0, y0, z1, 0, 0, 1), corner(x1, y0, z1, 1, 0, 1)
    n011, n111 = corner(x0, y1, z1, 0, 1, 1), corner(x1, y1, z1, 1, 1, 1)
    x00 = n000 + (n100 - n000) * ux
    x10 = n010 + (n110 - n010) * ux
    x01 = n001 + (n101 - n001) * ux
    x11 = n011 + (n111 - n011) * ux
    y0_ = x00 + (x10 - x00) * uy
    y1_ = x01 + (x11 - x01) * uy
    return (y0_ + (y1_ - y0_) * uz) * np.float32(1.6)


def nfbm(px, py, pz, octaves=3):
    """fBm normalizado a desviación típica ~1."""
    s = 0.0
    a, f = 1.0, 1.0
    for o in range(octaves):
        s = s + a * gnoise(px * f + o * 17.31, py * f + o * 31.77, pz * f + o * 47.13)
        a *= 0.5
        f *= 2.03
    return s * np.float32((1.0, 3.27, 2.92, 2.86, 2.84)[octaves])


def nnoise(px, py, pz):
    return gnoise(px, py, pz) * np.float32(3.27)


# ------------------------------------------------------------- helpers ----
def hex2rgb(h):
    h = h.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], np.float32)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    return a + (b - a) * t


def luminance(c):
    return (c * np.array([0.2126, 0.7152, 0.0722], np.float32)).sum(-1, keepdims=True)


# ------------------------------------------------------------- species ----
# Fuente única de verdad compartida con el sitio web (src/data/woods.json).
# Colores sRGB calibrados con fotos de cada madera terminada en aceite.
import json as _json
import os as _os

_WOODS = _json.load(open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)),
                                        "..", "..", "src", "data", "woods.json"), encoding="utf-8"))
SPECIES = _WOODS["species"]
FINISHES = _WOODS["finishes"]


def board_params(seed: int, species: str, length=120.0):
    """Posición de la médula, inclinación y nudos de una tabla concreta."""
    S = SPECIES[species]
    rng = np.random.default_rng(seed)
    cy, cz = S["pith"]
    ty, tz = S["tilt"]
    knots = []
    n = int(rng.poisson(S["knots"] * length / 100.0)) if S["knots"] > 0 else 0
    for _ in range(min(n, 4)):
        knots.append(dict(
            x=float(rng.uniform(-length * 0.45, length * 0.45)),
            phi=float(rng.uniform(np.pi * 0.38, np.pi * 0.62)),  # hacia la cara
            rad=float(rng.uniform(0.45, 1.05)),
            rise=float(rng.uniform(0.2, 0.5)),
        ))
    return dict(
        cy=cy + float(rng.uniform(-2.5, 2.5)),
        cz=cz + float(rng.uniform(-3.0, 3.0)),
        ty=ty * float(rng.uniform(0.6, 1.4)),
        tz=tz * float(rng.uniform(0.7, 1.3)) * (1 if rng.random() > 0.5 else -1),
        off=rng.uniform(-50, 50, size=3).astype(np.float32),
        knots=knots,
    )


# ---------------------------------------------------------------- wood ----
def wood(px, py, pz, species="pino", board=None, finish="natural", end_grain=None, detail=1.0):
    """Evalúa la madera sólida en posiciones 3D (cm).

    Devuelve albedo sRGB (…,3), roughness (…), height (…).
    end_grain: máscara 0..1 donde la superficie es testa.
    detail: 0..1 escala el detalle fino (para evitar aliasing en miniaturas).
    """
    S = SPECIES[species]
    F = FINISHES[finish]
    B = board or board_params(1, species)
    px = np.asarray(px, np.float32)
    py = np.asarray(py, np.float32)
    pz = np.asarray(pz, np.float32)
    ox, oy, oz = (float(v) for v in B["off"])

    # -- coordenadas del tronco: distancia radial a la médula inclinada
    yy = py - (B["cy"] + B["ty"] * px)
    zz = pz - (B["cz"] + B["tz"] * px)

    # -- nudos: ramas que nacen en la médula y cruzan la tabla
    knot_mask = np.zeros_like(px)
    knot_d = np.ones_like(px) * 9.0
    bump = np.zeros_like(px)
    halo = np.zeros_like(px)
    for k in B["knots"]:
        dy, dz, dx = np.cos(k["phi"]), np.sin(k["phi"]), k["rise"]
        nrm = np.sqrt(dx * dx + dy * dy + dz * dz)
        dx, dy, dz = dx / nrm, dy / nrm, dz / nrm
        rx = px - k["x"]
        s = rx * dx + yy * dy + zz * dz
        qx, qy, qz = rx - s * dx, yy - s * dy, zz - s * dz
        d = np.sqrt(qx * qx + qy * qy + qz * qz)
        front = (s > 0).astype(np.float32)
        rad = k["rad"] * (0.4 + 0.6 * smoothstep(0.0, 25.0, s))
        dn = d / rad
        bump = bump + 1.25 * rad * np.exp(-dn * dn * 0.45) * front
        halo = np.maximum(halo, np.exp(-np.maximum(dn - 1.0, 0) ** 2 * 3.0) * front)
        m = (1.0 - smoothstep(0.9, 1.0, dn)) * front
        knot_d = np.where(m > knot_mask, dn, knot_d)
        knot_mask = np.maximum(knot_mask, m)

    r0 = np.sqrt(yy * yy + zz * zz)
    r = r0 + bump
    arc = np.arctan2(zz, yy) * np.maximum(r, 1.0)  # distancia tangencial (cm)
    # las fibras corren rectas a lo largo de x y se desvían alrededor de los nudos
    push = r / np.maximum(r0, 1e-3)
    fy_ = yy * push + B["cy"]
    fz_ = zz * push + B["cz"]

    # -- anillos deformados (grande + fino), alargados en la dirección de la fibra
    wa = nfbm((px + ox) * S["warp_sx"], (py + oy) * S["warp_s"], (pz + oz) * S["warp_s"], 3)
    wb = nnoise((px + ox) * S["warp_sx"] * 3.0, (r + oy) * S["warp_s"] * 3.0, (arc + oz) * S["warp_s"] * 3.0)
    r_w = r + S["warp_a"] * wa + S["warp_b"] * wb * detail

    t = r_w / S["ring"]
    t = t + S["ring_var"] * nnoise(r_w * 0.23 + ox, oy * 0.1 + 3.1, oz * 0.1)
    f = t - np.floor(t)
    late = smoothstep(S["late_a"], S["late_b"], f)
    edge_line = smoothstep(0.86, 0.975, f) * (1.0 - smoothstep(0.985, 1.0, f))
    late = late * (1.0 - smoothstep(0.985, 1.0, f))

    # -- fibras en "espacio tronco" (siguen la deformación de los anillos)
    s1 = nfbm((px + ox) * 0.06, (fy_ + oy) * 2.4, (fz_ + oz) * 2.4, 2)
    s2 = nfbm((px + ox) * 0.25, (fy_ + oy) * 14.0, (fz_ + oz) * 14.0, 2) * detail
    s3 = nnoise((px + ox) * 0.9, (fy_ + oy) * 45.0, (fz_ + oz) * 45.0) * detail
    cv = nnoise((px + ox) * 0.011, (py + oy) * 0.07, (pz + oz) * 0.07)

    early = hex2rgb(S["early"])
    latec = hex2rgb(S["late"])
    linec = hex2rgb(S["line_col"])
    # años con anillo más marcado
    yr = nnoise(np.floor(t) * 0.61 + ox, oy * 0.3 + 1.7, oz * 0.3)
    yr_k = 0.65 + 0.35 * smoothstep(-1.2, 1.2, yr)
    lat = (late * yr_k)[..., None]
    col = mix(early, latec, lat)
    col = mix(col, linec, (edge_line * S["line"] * yr_k)[..., None])

    shade = 1.0 + S["streak1"] * s1 + S["streak2"] * s2 + S["streak3"] * s3 + S["colvar"] * cv
    if S["ribbon"] > 0:  # grano entrelazado (bandas de brillo)
        rib = np.sin((py + oy) * 1.1 + 1.8 * nfbm((px + ox) * 0.015, (py + oy) * 0.05, oz, 2))
        shade = shade + S["ribbon"] * rib
    col = col * shade[..., None]
    if S["mineral"] > 0:  # vetas minerales oscuras
        mn = nfbm((px + ox) * 0.03, (fy_ + oy) * 0.9, (fz_ + oz) * 0.9, 2)
        col = col * (1.0 - S["mineral"] * smoothstep(0.9, 2.2, mn))[..., None]

    # -- albura (sapwood)
    if S["sap_r"] < 900:
        sap_t = smoothstep(S["sap_r"] - 0.3, S["sap_r"] + 0.3, r_w)
        sapc = hex2rgb(S["sap"]) * (1.0 + 0.6 * S["streak1"] * s1 + 0.5 * S["streak2"] * s2)[..., None]
        sapc = mix(sapc, sapc * 0.88, lat * 0.7)
        col = mix(col, sapc, sap_t[..., None])

    # -- poros
    pores = np.zeros_like(px)
    if S["pore"] == 1:  # anillo poroso (encino)
        band = 1.0 - smoothstep(0.06, 0.28, f)
        pn = gnoise((px + ox) * 1.1, (fy_ + oy) * 34.0, (fz_ + oz) * 34.0)
        pores = smoothstep(0.16, 0.5, pn) * band
        pn2 = gnoise((px + ox) * 0.8, (fy_ + oy) * 21.0, (fz_ + oz) * 21.0)
        pores = np.maximum(pores, smoothstep(0.5, 0.78, pn2) * 0.55)
        ray = gnoise((px + ox) * 0.45, (r_w + oy) * 9.0, (arc + oz) * 55.0)
        col = col * (1.0 + 0.07 * smoothstep(0.5, 0.85, ray))[..., None]
    elif S["pore"] == 2:  # poro difuso (nogal, parota)
        pn = gnoise((px + ox) * 0.8, (fy_ + oy) * 27.0, (fz_ + oz) * 27.0)
        pores = smoothstep(0.4, 0.72, pn)
    pores = pores * detail
    porec = hex2rgb(S["pore_col"])
    col = mix(col, porec * (0.85 + 0.3 * lat), (pores * S["pore_amt"])[..., None])

    # -- nudos
    if B["knots"]:
        kr = knot_d * 5.0 + 0.7 * gnoise(px * 0.8 + ox, py * 0.8, pz * 0.8)
        kf = kr - np.floor(kr)
        kcol = mix(hex2rgb(S["knot_col"]), hex2rgb(S["knot_col2"]), smoothstep(0.45, 0.95, kf)[..., None])
        kcol = kcol * (0.9 + 0.2 * smoothstep(0.0, 0.6, knot_d))[..., None]
        rim = smoothstep(0.8, 0.97, knot_d) * 0.55
        kcol = mix(kcol, hex2rgb(S["knot_col2"]) * 0.75, rim[..., None])
        kcol = kcol * (1.0 + 0.06 * s1)[..., None]
        col = col * (1.0 - 0.12 * halo * (1 - knot_mask))[..., None]
        col = mix(col, kcol, knot_mask[..., None])

    # -- acabado
    lum = luminance(col)
    col = mix(lum, col, F["sat"]) * F["bright"]
    if F["late_boost"] > 0:
        col = col * (1.0 - F["late_boost"] * np.clip(lat + edge_line[..., None] * 0.5, 0, 1))
    if F["tint"] is not None:
        col = mix(col, hex2rgb(F["tint"]) * (0.7 + 0.6 * lum), F["tint_amt"])

    rough = S["rough"] + F["rough"] - 0.05 * late + 0.1 * pores + 0.02 * s2
    if end_grain is not None:
        eg = np.asarray(end_grain, np.float32)
        col = col * mix(np.float32(1.0), np.float32(0.8), eg)[..., None]
        rough = rough + 0.16 * eg

    height = 0.5 - 0.12 * (1 - late) - 0.55 * pores * S["pore_amt"] + 0.05 * s2 + 0.03 * s3 - 0.1 * knot_mask
    return np.clip(col, 0, 1), np.clip(rough, 0.05, 1.0), height


# ------------------------------------------------------- face sampling ----
def face_grid(u0, u1, v0, v1, res_u, res_v, ss=1):
    """Rejilla de muestreo (centros de pixel) con supersampling ss×ss."""
    du, dv = (u1 - u0) / (res_u * ss), (v1 - v0) / (res_v * ss)
    us = u0 + du * (np.arange(res_u * ss, dtype=np.float32) + 0.5)
    vs = v0 + dv * (np.arange(res_v * ss, dtype=np.float32) + 0.5)
    return np.meshgrid(us, vs)


def downsample(img, ss):
    if ss == 1:
        return img
    h, w = img.shape[0] // ss, img.shape[1] // ss
    if img.ndim == 3:
        return img.reshape(h, ss, w, ss, img.shape[2]).mean(axis=(1, 3))
    return img.reshape(h, ss, w, ss).mean(axis=(1, 3))


def normal_from_height(h, strength, px_size_cm):
    gy, gx = np.gradient(h.astype(np.float32), px_size_cm)
    nx, ny, nz = -gx * strength, gy * strength, np.ones_like(h)
    n = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / n, ny / n, nz / n], -1) * 0.5 + 0.5


def to_u8(img):
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)
