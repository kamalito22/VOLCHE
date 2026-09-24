/**
 * Madera procedural sólida en GLSL (WebGL2).
 *
 * Port 1:1 de tools/wood/wood.py: mismo hash (pcg3d), mismo ruido de
 * gradiente y la misma construcción de anillos alrededor de una médula
 * inclinada. La veta se evalúa en 3D por píxel, así que la tabla puede
 * cambiar de largo/fondo sin estirar la textura y las testas muestran
 * los anillos reales.
 *
 * Ejes madera: x = largo (fibra), y = fondo, z = grosor. Unidades: cm.
 */

export const woodNoiseGLSL = /* glsl */ `
const uint KX = 0x8da6b343u;
const uint KY = 0xd8163841u;
const uint KZ = 0xcb1ab31fu;

vec3 hgrad(uint h) {
  h ^= h >> 16u; h *= 0x7feb352du;
  h ^= h >> 15u; h *= 0x846ca68bu;
  h ^= h >> 16u;
  return vec3(uvec3(h, h >> 10u, h >> 20u) & 1023u) * (2.0 / 1023.0) - 1.0;
}

float gnoise(vec3 p) {
  p += 4096.0;
  vec3 i = floor(p);
  vec3 f = p - i;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  uvec3 c = uvec3(i);
  uint x0 = c.x * KX, x1 = x0 + KX;
  uint y0 = c.y * KY, y1 = y0 + KY;
  uint z0 = c.z * KZ, z1 = z0 + KZ;
  float n000 = dot(hgrad(x0 ^ y0 ^ z0), f);
  float n100 = dot(hgrad(x1 ^ y0 ^ z0), f - vec3(1.0, 0.0, 0.0));
  float n010 = dot(hgrad(x0 ^ y1 ^ z0), f - vec3(0.0, 1.0, 0.0));
  float n110 = dot(hgrad(x1 ^ y1 ^ z0), f - vec3(1.0, 1.0, 0.0));
  float n001 = dot(hgrad(x0 ^ y0 ^ z1), f - vec3(0.0, 0.0, 1.0));
  float n101 = dot(hgrad(x1 ^ y0 ^ z1), f - vec3(1.0, 0.0, 1.0));
  float n011 = dot(hgrad(x0 ^ y1 ^ z1), f - vec3(0.0, 1.0, 1.0));
  float n111 = dot(hgrad(x1 ^ y1 ^ z1), f - vec3(1.0, 1.0, 1.0));
  float x00 = mix(n000, n100, u.x);
  float x10 = mix(n010, n110, u.x);
  float x01 = mix(n001, n101, u.x);
  float x11 = mix(n011, n111, u.x);
  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z) * 1.6;
}

const vec3 OCT1 = vec3(17.31, 31.77, 47.13);

float nnoise(vec3 p) { return gnoise(p) * 3.27; }

float nfbm2(vec3 p) {
  return (gnoise(p) + 0.5 * gnoise(p * 2.03 + OCT1)) * 2.92;
}

float nfbm3(vec3 p) {
  return (gnoise(p) + 0.5 * gnoise(p * 2.03 + OCT1) + 0.25 * gnoise(p * 4.1209 + 2.0 * OCT1)) * 2.86;
}
`;

export const woodParsGLSL = /* glsl */ `
struct WoodSp {
  vec3 early; vec3 late; vec3 lineCol; vec3 sap; vec3 poreCol; vec3 knot1; vec3 knot2;
  float ring; float ringVar; float lateA; float lateB; float line;
  float warpA; float warpB; float warpSX; float warpS;
  float streak1; float streak2; float streak3; float colvar; float mineral; float ribbon;
  float pore; float poreAmt; float sapR; float rough;
  vec2 pith; vec2 tilt; vec3 off; float knotCount;
};

uniform WoodSp uWoodA;
uniform WoodSp uWoodB;
uniform vec4 uKnotsA[4];
uniform vec4 uKnotsB[4];
uniform float uWoodMix;     // 0 = A, 1 = B; intermedio = barrido
uniform float uWipeFront;   // cm en x
uniform float uWipeGlow;

// acabado
uniform float uFinSat;
uniform float uFinBright;
uniform vec3  uFinTint;
uniform float uFinTintAmt;
uniform float uFinRough;
uniform float uFinLate;

// estados del taller (historia de ensamble)
uniform float uRaw;         // 1 = tabla en bruto (aserrada)
uniform float uRawFront;    // cm: a la derecha del frente sigue en bruto
uniform float uOil;         // 1 = con aceite
uniform float uOilFront;    // cm: a la izquierda del frente ya tiene aceite
uniform float uBump;        // metros por unidad de altura
uniform float uCoat;        // clearcoat máximo con aceite

varying vec3 vWoodP;
varying vec3 vWoodN;

float woodRough;
float woodH;
float woodCoat;
vec3 woodGlow;

struct WoodOut { vec3 col; float rough; float h; float late; };

WoodOut woodEval(WoodSp S, int which, vec3 p, float eg, float detail, float detail1, float tw) {
  vec3 o = S.off;
  float yy = p.y - (S.pith.x + S.tilt.x * p.x);
  float zz = p.z - (S.pith.y + S.tilt.y * p.x);

  // nudos: ramas que nacen de la médula
  float knotMask = 0.0, knotD = 9.0, bump = 0.0, halo = 0.0;
  for (int i = 0; i < 4; i++) {
    if (float(i) >= S.knotCount) break;
    vec4 k = which == 0 ? uKnotsA[i] : uKnotsB[i];
    vec3 d = normalize(vec3(k.w, cos(k.y), sin(k.y)));
    vec3 r = vec3(p.x - k.x, yy, zz);
    float s = dot(r, d);
    float dist = length(r - s * d);
    float front = step(0.0, s);
    float rad = k.z * (0.4 + 0.6 * smoothstep(0.0, 25.0, s));
    float dn = dist / rad;
    bump += 1.25 * rad * exp(-dn * dn * 0.45) * front;
    float e = max(dn - 1.0, 0.0);
    halo = max(halo, exp(-e * e * 3.0) * front);
    float m = (1.0 - smoothstep(0.9, 1.0, dn)) * front;
    if (m > knotMask) knotD = dn;
    knotMask = max(knotMask, m);
  }

  float r0 = sqrt(yy * yy + zz * zz);
  float r = r0 + bump;
  float arc = atan(zz, yy) * max(r, 1.0);
  float push = r / max(r0, 1e-3);
  float fy = yy * push + S.pith.x;
  float fz = zz * push + S.pith.y;

  float wa = nfbm3(vec3((p.x + o.x) * S.warpSX, (p.y + o.y) * S.warpS, (p.z + o.z) * S.warpS));
  float wb = nnoise(vec3((p.x + o.x) * S.warpSX * 3.0, (r + o.y) * S.warpS * 3.0, (arc + o.z) * S.warpS * 3.0));
  float rw = r + S.warpA * wa + S.warpB * wb * detail;

  float t = rw / S.ring;
  t += S.ringVar * nnoise(vec3(rw * 0.23 + o.x, o.y * 0.1 + 3.1, o.z * 0.1));
  float f = fract(t);
  float edgeW = max(0.015, tw * 1.5);
  float late = smoothstep(S.lateA, S.lateB, f);
  float edgeLine = smoothstep(0.86, 0.975, f) * (1.0 - smoothstep(1.0 - edgeW, 1.0, f));
  late *= 1.0 - smoothstep(1.0 - edgeW, 1.0, f);
  // anillos más finos que un píxel: promedio
  float ringFade = smoothstep(0.3, 0.9, tw);
  late = mix(late, (1.0 - 0.5 * (S.lateA + S.lateB)) * 0.9, ringFade);
  edgeLine = mix(edgeLine, 0.08, ringFade);

  float s1 = nfbm2(vec3((p.x + o.x) * 0.06, (fy + o.y) * 2.4, (fz + o.z) * 2.4)) * detail1;
  float s2 = 0.0, s3 = 0.0;
  if (detail > 0.0) {
    s2 = nfbm2(vec3((p.x + o.x) * 0.25, (fy + o.y) * 14.0, (fz + o.z) * 14.0)) * detail;
    s3 = nnoise(vec3((p.x + o.x) * 0.9, (fy + o.y) * 45.0, (fz + o.z) * 45.0)) * detail;
  }
  float cv = nnoise(vec3((p.x + o.x) * 0.011, (p.y + o.y) * 0.07, (p.z + o.z) * 0.07));

  float yr = nnoise(vec3(floor(t) * 0.61 + o.x, o.y * 0.3 + 1.7, o.z * 0.3));
  float yrk = 0.65 + 0.35 * smoothstep(-1.2, 1.2, yr);
  float lat = late * yrk;
  vec3 col = mix(S.early, S.late, lat);
  col = mix(col, S.lineCol, edgeLine * S.line * yrk);
  float shade = 1.0 + S.streak1 * s1 + S.streak2 * s2 + S.streak3 * s3 + S.colvar * cv;
  if (S.ribbon > 0.0) {
    float rib = sin((p.y + o.y) * 1.1 + 1.8 * nfbm2(vec3((p.x + o.x) * 0.015, (p.y + o.y) * 0.05, o.z)));
    shade += S.ribbon * rib;
  }
  col *= shade;
  if (S.mineral > 0.0) {
    float mn = nfbm2(vec3((p.x + o.x) * 0.03, (fy + o.y) * 0.9, (fz + o.z) * 0.9));
    col *= 1.0 - S.mineral * smoothstep(0.9, 2.2, mn);
  }
  if (S.sapR < 900.0) {
    float sapT = smoothstep(S.sapR - 0.3, S.sapR + 0.3, rw);
    vec3 sapc = S.sap * (1.0 + 0.6 * S.streak1 * s1 + 0.5 * S.streak2 * s2);
    sapc = mix(sapc, sapc * 0.88, lat * 0.7);
    col = mix(col, sapc, sapT);
  }

  float pores = 0.0;
  if (S.pore > 0.5 && detail > 0.0) {
    if (S.pore < 1.5) {
      float band = 1.0 - smoothstep(0.06, 0.28, f);
      float pn = gnoise(vec3((p.x + o.x) * 1.1, (fy + o.y) * 34.0, (fz + o.z) * 34.0));
      pores = smoothstep(0.16, 0.5, pn) * band;
      float pn2 = gnoise(vec3((p.x + o.x) * 0.8, (fy + o.y) * 21.0, (fz + o.z) * 21.0));
      pores = max(pores, smoothstep(0.5, 0.78, pn2) * 0.55);
      float ray = gnoise(vec3((p.x + o.x) * 0.45, (rw + o.y) * 9.0, (arc + o.z) * 55.0));
      col *= 1.0 + 0.07 * smoothstep(0.5, 0.85, ray);
    } else {
      float pn = gnoise(vec3((p.x + o.x) * 0.8, (fy + o.y) * 27.0, (fz + o.z) * 27.0));
      pores = smoothstep(0.4, 0.72, pn);
    }
  }
  // lejos: los poros se promedian en un leve oscurecimiento
  float poreMix = pores * detail + (S.pore > 0.5 ? 0.09 : 0.0) * (1.0 - detail);
  col = mix(col, S.poreCol * (0.85 + 0.3 * lat), poreMix * S.poreAmt);

  if (S.knotCount > 0.0) {
    float kr = knotD * 5.0 + 0.7 * gnoise(vec3(p.x * 0.8 + o.x, p.y * 0.8, p.z * 0.8));
    float kf = fract(kr);
    vec3 kcol = mix(S.knot1, S.knot2, smoothstep(0.45, 0.95, kf));
    kcol *= 0.9 + 0.2 * smoothstep(0.0, 0.6, knotD);
    float rim = smoothstep(0.8, 0.97, knotD) * 0.55;
    kcol = mix(kcol, S.knot2 * 0.75, rim);
    kcol *= 1.0 + 0.06 * s1;
    col *= 1.0 - 0.12 * halo * (1.0 - knotMask);
    col = mix(col, kcol, knotMask);
  }

  // acabado
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum), col, uFinSat) * uFinBright;
  if (uFinLate > 0.0) col *= 1.0 - uFinLate * clamp(lat + edgeLine * 0.5, 0.0, 1.0);
  if (uFinTintAmt > 0.0) col = mix(col, uFinTint * (0.7 + 0.6 * lum), uFinTintAmt);

  float rough = S.rough + uFinRough - 0.05 * late + 0.1 * pores + 0.02 * s2;
  col *= mix(1.0, 0.8, eg);
  rough += 0.16 * eg;

  float h = 0.5 - 0.12 * (1.0 - late) - 0.55 * pores * S.poreAmt + 0.05 * s2 + 0.03 * s3 - 0.1 * knotMask;
  return WoodOut(clamp(col, 0.0, 1.0), clamp(rough, 0.05, 1.0), h, late);
}

vec3 woodSRGBToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}

// Mikkelsen (sin normalizar sigmas): relieve con escala física (metros)
vec3 woodPerturb(vec3 surfPos, vec3 surfNorm, vec2 dHdxy, float faceDir) {
  vec3 vSigmaX = dFdx(surfPos);
  vec3 vSigmaY = dFdy(surfPos);
  vec3 R1 = cross(vSigmaY, surfNorm);
  vec3 R2 = cross(surfNorm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surfNorm - vGrad);
}
`;

/** Bloque que sustituye a <map_fragment>: calcula la madera del píxel. */
export const woodMainGLSL = /* glsl */ `
  {
    vec3 p = vWoodP;
    vec3 fwp = fwidth(p);
    float pix = max(max(fwp.x, fwp.y), fwp.z);           // cm por píxel
    float detail = 1.0 - smoothstep(0.02, 0.09, pix);
    float detail1 = 1.0 - smoothstep(0.07, 0.24, pix);
    float eg = smoothstep(0.55, 0.9, abs(normalize(vWoodN).x));

    // anillos por píxel (aprox.) para antialias
    float twA = pix / uWoodA.ring * 1.2;

    WoodOut w;
    if (uWoodMix <= 0.0) {
      w = woodEval(uWoodA, 0, p, eg, detail, detail1, twA);
    } else if (uWoodMix >= 1.0) {
      w = woodEval(uWoodB, 1, p, eg, detail, detail1, pix / uWoodB.ring * 1.2);
    } else {
      WoodOut a = woodEval(uWoodA, 0, p, eg, detail, detail1, twA);
      WoodOut b = woodEval(uWoodB, 1, p, eg, detail, detail1, pix / uWoodB.ring * 1.2);
      float m = 1.0 - smoothstep(uWipeFront - 1.2, uWipeFront + 1.2, p.x);
      w.col = mix(a.col, b.col, m);
      w.rough = mix(a.rough, b.rough, m);
      w.h = mix(a.h, b.h, m);
      w.late = mix(a.late, b.late, m);
    }

    vec3 col = w.col;
    float rough = w.rough;
    float h = w.h;
    float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));

    // --- tabla en bruto: gris oxidado, fibras levantadas y marcas de sierra
    float rawAmt = uRaw * smoothstep(uRawFront - 1.5, uRawFront + 1.5, p.x);
    if (rawAmt > 0.0) {
      float saw = 0.5 + 0.5 * sin(p.x * 17.95 + 3.0 * gnoise(vec3(p.x * 0.2, p.y * 0.5, p.z * 0.5)));
      float fuzz = gnoise(vec3(p.x * 2.0, p.y * 9.0, p.z * 9.0));
      vec3 rawc = mix(vec3(lum) * vec3(1.02, 1.0, 0.96), col, 0.55) * (1.1 + 0.08 * fuzz) * (0.95 + 0.06 * saw);
      col = mix(col, rawc, rawAmt);
      rough = mix(rough, 0.95, rawAmt);
      h += rawAmt * (0.6 * saw + 0.5 * fuzz);
    }
    // frente del cepillo: línea clara de corte fresco
    float cut = exp(-pow((p.x - uRawFront) / 0.9, 2.0)) * uRaw * step(-900.0, uRawFront);

    // --- aceite: a la izquierda del frente la madera está aceitada
    float oilAmt = uOil * (1.0 - smoothstep(uOilFront - 2.5, uOilFront + 2.5, p.x));
    vec3 bare = mix(vec3(lum), col, 0.82) * 1.07;
    col = mix(bare, col, oilAmt);
    rough = mix(rough + 0.14, rough, oilAmt);
    float wet = exp(-pow((p.x - uOilFront) / 3.0, 2.0)) * uOil * step(uOilFront, 900.0);
    col *= 1.0 - 0.12 * wet;
    rough -= 0.25 * wet;

    diffuseColor.rgb = woodSRGBToLinear(col);
    woodRough = clamp(rough, 0.06, 1.0);
    woodH = h;
    woodCoat = oilAmt + wet * 0.6;
    float glowW = exp(-pow((p.x - uWipeFront) / 0.7, 2.0)) * step(0.001, uWoodMix) * step(uWoodMix, 0.999);
    woodGlow = vec3(1.0, 0.62, 0.32) * (glowW * uWipeGlow) + vec3(1.0, 0.95, 0.85) * cut * 0.35;
  }
`;
