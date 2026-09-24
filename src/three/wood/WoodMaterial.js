import * as THREE from 'three';
import woods from '../../data/woods.json';
import { woodMainGLSL, woodNoiseGLSL, woodParsGLSL } from './woodGLSL.js';

export const SPECIES = woods.species;
export const FINISHES = woods.finishes;

/** Colores sRGB crudos (el shader convierte a lineal al final). */
function srgb(hex) {
  const c = parseInt(hex.slice(1), 16);
  return new THREE.Vector3(((c >> 16) & 255) / 255, ((c >> 8) & 255) / 255, (c & 255) / 255);
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda, rnd) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > L);
  return k - 1;
}

/** Parámetros de una tabla concreta: médula, inclinación, nudos (misma lógica que wood.py). */
export function boardParams(seed, key, lengthCm = 100) {
  const S = SPECIES[key];
  const rnd = mulberry32(seed * 7919 + key.length * 131);
  const u = (a, b) => a + (b - a) * rnd();
  const knots = [];
  if (S.knots > 0) {
    const n = Math.min(4, poisson((S.knots * lengthCm) / 100, rnd));
    for (let i = 0; i < n; i++) {
      knots.push(
        new THREE.Vector4(
          u(-lengthCm * 0.42, lengthCm * 0.42),
          u(Math.PI * 0.38, Math.PI * 0.62),
          u(0.45, 1.05),
          u(0.2, 0.5),
        ),
      );
    }
  }
  return {
    pith: new THREE.Vector2(S.pith[0] + u(-2.5, 2.5), S.pith[1] + u(-3, 3)),
    tilt: new THREE.Vector2(S.tilt[0] * u(0.6, 1.4), S.tilt[1] * u(0.7, 1.3) * (rnd() > 0.5 ? 1 : -1)),
    off: new THREE.Vector3(u(-50, 50), u(-50, 50), u(-50, 50)),
    knots,
  };
}

function speciesUniform(key, board) {
  const S = SPECIES[key];
  return {
    early: srgb(S.early),
    late: srgb(S.late),
    lineCol: srgb(S.line_col),
    sap: srgb(S.sap),
    poreCol: srgb(S.pore_col),
    knot1: srgb(S.knot_col),
    knot2: srgb(S.knot_col2),
    ring: S.ring,
    ringVar: S.ring_var,
    lateA: S.late_a,
    lateB: S.late_b,
    line: S.line,
    warpA: S.warp_a,
    warpB: S.warp_b,
    warpSX: S.warp_sx,
    warpS: S.warp_s,
    streak1: S.streak1,
    streak2: S.streak2,
    streak3: S.streak3,
    colvar: S.colvar,
    mineral: S.mineral,
    ribbon: S.ribbon,
    pore: S.pore,
    poreAmt: S.pore_amt,
    sapR: S.sap_r,
    rough: S.rough,
    pith: board.pith,
    tilt: board.tilt,
    off: board.off,
    knotCount: board.knots.length,
  };
}

function padKnots(knots) {
  const out = knots.slice(0, 4);
  while (out.length < 4) out.push(new THREE.Vector4());
  return out;
}

function finishState(key) {
  const F = FINISHES[key];
  const tint = srgb(F.tint || '#000000');
  return {
    sat: F.sat,
    bright: F.bright,
    tintAmt: F.tint ? F.tint_amt : 0,
    rough: F.rough,
    late: F.late_boost,
    tr: tint.x,
    tg: tint.y,
    tb: tint.z,
  };
}

/**
 * MeshPhysicalMaterial con madera procedural.
 * La geometría debe estar en metros con el largo en X y el grosor en Y.
 */
export class WoodMaterial extends THREE.MeshPhysicalMaterial {
  constructor({ species = 'parota', finish = 'natural', seed = 1, length = 90, ...params } = {}) {
    super({
      roughness: 0.5,
      metalness: 0,
      clearcoat: 0.28,
      clearcoatRoughness: 0.32,
      ...params,
    });
    this.species = species;
    this.finish = finish;
    this.seed = seed;
    this.length = length;
    const board = boardParams(seed, species, length);
    this.wood = {
      uWoodA: { value: speciesUniform(species, board) },
      uWoodB: { value: speciesUniform(species, board) },
      uKnotsA: { value: padKnots(board.knots) },
      uKnotsB: { value: padKnots(board.knots) },
      uWoodMix: { value: 0 },
      uWipeFront: { value: -1e4 },
      uWipeGlow: { value: 1.4 },
      uFinSat: { value: 1 },
      uFinBright: { value: 1 },
      uFinTint: { value: new THREE.Vector3() },
      uFinTintAmt: { value: 0 },
      uFinRough: { value: 0 },
      uFinLate: { value: 0 },
      uRaw: { value: 0 },
      uRawFront: { value: -1e4 },
      uOil: { value: 1 },
      uOilFront: { value: 1e4 },
      uBump: { value: 0.00035 },
    };
    this.fin = finishState(finish);
    this.applyFinish();
  }

  onBeforeCompile(shader) {
    Object.assign(shader.uniforms, this.wood);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWoodP;\nvarying vec3 vWoodN;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n vWoodP = vec3(position.x, -position.z, position.y) * 100.0;\n vWoodN = vec3(normal.x, -normal.z, normal.y);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${woodNoiseGLSL}\n${woodParsGLSL}`)
      .replace('#include <map_fragment>', woodMainGLSL)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = woodRough;')
      .replace(
        '#include <normal_fragment_maps>',
        '#include <normal_fragment_maps>\n normal = woodPerturb(-vViewPosition, normal, vec2(dFdx(woodH), dFdy(woodH)) * uBump, faceDirection);',
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += woodGlow;')
      .replace(
        '#include <lights_physical_fragment>',
        '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\n material.clearcoat *= clamp(woodCoat, 0.0, 1.0);\n#endif',
      );
  }

  customProgramCacheKey() {
    return 'volche-wood-1';
  }

  /** Cambia la tabla (otra veta) sin animación. */
  setBoard(seed = this.seed, length = this.length) {
    this.seed = seed;
    this.length = length;
    const b = boardParams(seed, this.species, length);
    this.wood.uWoodA.value = speciesUniform(this.species, b);
    this.wood.uKnotsA.value = padKnots(b.knots);
  }

  /** Prepara la especie destino; luego animar setWipe(0→1) y commit(). */
  prepareSpecies(key, seed = this.seed) {
    const b = boardParams(seed, key, this.length);
    this.wood.uWoodB.value = speciesUniform(key, b);
    this.wood.uKnotsB.value = padKnots(b.knots);
    this._pending = { key, seed };
  }

  setWipe(t) {
    const half = this.length / 2 + 3;
    const tt = Math.min(0.9999, Math.max(0.0001, t));
    this.wood.uWoodMix.value = tt;
    this.wood.uWipeFront.value = -half + 2 * half * tt;
  }

  commitSpecies() {
    if (!this._pending) return;
    this.species = this._pending.key;
    this.seed = this._pending.seed;
    this.wood.uWoodA.value = this.wood.uWoodB.value;
    this.wood.uKnotsA.value = this.wood.uKnotsB.value;
    this.wood.uWoodMix.value = 0;
    this.wood.uWipeFront.value = -1e4;
    this._pending = null;
  }

  /** Estado de acabado animable (gsap puede interpolar this.fin). */
  finishTarget(key) {
    this.finish = key;
    return finishState(key);
  }

  applyFinish() {
    const f = this.fin;
    const w = this.wood;
    w.uFinSat.value = f.sat;
    w.uFinBright.value = f.bright;
    w.uFinTintAmt.value = f.tintAmt;
    w.uFinRough.value = f.rough;
    w.uFinLate.value = f.late;
    w.uFinTint.value.set(f.tr, f.tg, f.tb);
  }
}

/** Swatch 2D (sRGB) para UI: color medio de cada especie. */
export function speciesSwatch(key) {
  const S = SPECIES[key];
  return { early: S.early, late: S.late, label: S.label };
}
