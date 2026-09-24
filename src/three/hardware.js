import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const MAT = {
  steel: () => new THREE.MeshStandardMaterial({ color: '#191715', roughness: 0.46, metalness: 0.55 }),
  zinc: () => new THREE.MeshStandardMaterial({ color: '#a3a7aa', roughness: 0.3, metalness: 1 }),
  brass: () => new THREE.MeshPhysicalMaterial({ color: '#d9b36a', roughness: 0.2, metalness: 1, clearcoat: 0.3 }),
  plastic: () => new THREE.MeshStandardMaterial({ color: '#dcd3c4', roughness: 0.55, metalness: 0 }),
};

/** Soporte oculto: placa de acero + dos varillas (medidas en cm). */
export function hiddenBracket({ length = 60, rodLen = 15, rodGap = 40, mat = MAT.steel() } = {}) {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(length / 100, 0.03, 0.005), mat);
  plate.position.z = 0.0025;
  g.add(plate);
  const rodGeo = new THREE.CylinderGeometry(0.006, 0.006, rodLen / 100, 24);
  rodGeo.rotateX(Math.PI / 2);
  const rods = [];
  for (const s of [-1, 1]) {
    const rod = new THREE.Mesh(rodGeo, mat);
    rod.position.set((s * rodGap) / 200, 0, 0.005 + rodLen / 200);
    g.add(rod);
    rods.push(rod);
  }
  // barrenos (puntos oscuros) para los taquetes
  const holeMat = new THREE.MeshBasicMaterial({ color: '#050505' });
  const holeGeo = new THREE.CircleGeometry(0.0035, 20);
  const holes = [];
  for (const f of [-0.45, -0.15, 0.15, 0.45]) {
    const h = new THREE.Mesh(holeGeo, holeMat);
    h.position.set((f * length) / 100, 0, 0.0052);
    g.add(h);
    holes.push(h);
  }
  g.userData = { plate, rods, holes };
  return g;
}

/** Ménsula en L de acero con esquina curva (perfil en Y/Z, ancho en X). */
export function lBracket({ arm = 15, depth = 18, width = 3, thick = 0.5, r = 2.5, mat = MAT.steel() } = {}) {
  const s = new THREE.Shape();
  const A = arm / 100;
  const Dp = depth / 100;
  const t = thick / 100;
  const R = r / 100;
  // perfil: pared en y=0 (x del Shape = z mundo), brazo horizontal en la parte superior
  s.moveTo(0, -A);
  s.lineTo(t, -A);
  s.lineTo(t, -t - R);
  s.quadraticCurveTo(t, -t, t + R, -t);
  s.lineTo(Dp, -t);
  s.lineTo(Dp, 0);
  s.lineTo(0, 0);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: width / 100,
    bevelEnabled: true,
    bevelThickness: 0.0008,
    bevelSize: 0.0008,
    bevelSegments: 2,
    curveSegments: 12,
  });
  geo.translate(0, 0, -width / 200);
  // Shape en XY -> queremos: x_shape -> z mundo, y_shape -> y mundo, extrusión -> x mundo
  geo.applyMatrix4(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0)));
  const mesh = new THREE.Mesh(geo, mat);
  const screwMat = MAT.zinc();
  const screwGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.002, 16);
  screwGeo.rotateX(Math.PI / 2);
  const g = new THREE.Group();
  g.add(mesh);
  for (const y of [-A * 0.3, -A * 0.78]) {
    const sc = new THREE.Mesh(screwGeo, screwMat);
    sc.position.set(0, y, t + 0.001);
    g.add(sc);
  }
  return g;
}

/** Barra en U de latón bajo el frente de la repisa (medidas en cm). */
export function towelBar({ length = 67, drop = 4, radius = 0.45, mat = MAT.brass() } = {}) {
  const L = length / 200;
  const d = drop / 100;
  const rr = 0.012;
  const pts = [new THREE.Vector3(-L, 0, 0)];
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI + (Math.PI / 2) * (k / 8);
    pts.push(new THREE.Vector3(-L + rr + rr * Math.cos(a), -d + rr + rr * Math.sin(a), 0));
  }
  for (let k = 0; k <= 8; k++) {
    const a = 1.5 * Math.PI + (Math.PI / 2) * (k / 8);
    pts.push(new THREE.Vector3(L - rr + rr * Math.cos(a), -d + rr + rr * Math.sin(a), 0));
  }
  pts.push(new THREE.Vector3(L, 0, 0));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, 160, radius / 100, 16, false);
  return new THREE.Mesh(geo, mat);
}

/** Pija (tornillo para madera) con cabeza avellanada, eje en +Z. */
export function screwGeometry(len = 5) {
  const shank = new THREE.CylinderGeometry(0.0021, 0.0012, len / 100, 12);
  shank.rotateX(Math.PI / 2);
  shank.translate(0, 0, len / 200 + 0.003);
  const head = new THREE.CylinderGeometry(0.0021, 0.0045, 0.003, 20);
  head.rotateX(-Math.PI / 2);
  head.translate(0, 0, 0.0015);
  // rosca: anillos finos
  const parts = [shank, head];
  const n = Math.floor(len * 2.2);
  for (let i = 0; i < n; i++) {
    const ring = new THREE.TorusGeometry(0.0021, 0.0005, 6, 16);
    ring.translate(0, 0, 0.008 + (i / n) * (len / 100 - 0.01));
    parts.push(ring);
  }
  return mergeGeometries(parts.map((p) => p.toNonIndexed()));
}

/** Taquete de plástico con costillas, eje en +Z. */
export function anchorGeometry(len = 4) {
  const pts = [new THREE.Vector2(0.0001, 0), new THREE.Vector2(0.0045, 0), new THREE.Vector2(0.0045, 0.002)];
  const ribs = 8;
  for (let i = 0; i < ribs; i++) {
    const z = 0.004 + (i * (len / 100 - 0.008)) / ribs;
    pts.push(new THREE.Vector2(0.0042, z), new THREE.Vector2(0.0033, z + 0.0022));
  }
  pts.push(new THREE.Vector2(0.0027, len / 100), new THREE.Vector2(0.0001, len / 100));
  const geo = new THREE.LatheGeometry(pts, 20);
  geo.rotateX(Math.PI / 2);
  return geo;
}
