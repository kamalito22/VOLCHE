import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { boardGeometry } from './board.js';
import { createRenderer, Stage, studioEnvironment } from './core.js';
import { anchorGeometry, hiddenBracket, MAT, screwGeometry } from './hardware.js';
import { WoodMaterial } from './wood/WoodMaterial.js';

const L = 90;
const D = 22;
const T = 4;
const CUT = 5; // sobrante en cada extremo (cm)

// --------------------------------------------------------------- helpers --
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const seg = (p, a, b) => clamp01((p - a) / (b - a));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const out = (x) => 1 - Math.pow(1 - x, 3);
const back = (x) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
const lerp = THREE.MathUtils.lerp;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

function plasterTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  // ruido de valor suavizado en 3 escalas (estuco/cal)
  const rnd = (i) => {
    const x = Math.sin(i * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };
  const noise = (x, y, s) => {
    const xi = Math.floor(x / s);
    const yi = Math.floor(y / s);
    const xf = x / s - xi;
    const yf = y / s - yi;
    const n = size / s;
    const h = (a, b) => rnd(((a % n) + n) % n + (((b % n) + n) % n) * 157);
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = noise(x, y, 128) * 0.5 + noise(x, y, 32) * 0.3 + noise(x, y, 8) * 0.2;
      const v = 200 + (n - 0.5) * 70;
      const i = (y * size + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

function vase(color = '#e6ddcf') {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const body = 0.055 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.8);
    const r = t < 0.82 ? Math.max(0.018, body) : 0.018 + 0.008 * Math.pow((t - 0.82) / 0.18, 2);
    pts.push(new THREE.Vector2(Math.max(0.012, r), 0.24 * t));
  }
  pts.unshift(new THREE.Vector2(0.0001, 0));
  const geo = new THREE.LatheGeometry(pts, 48);
  return new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.4 }));
}

function book(w, h, d, color) {
  const g = new RoundedBoxGeometry(h / 100, w / 100, d / 100, 2, 0.002);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
  return m;
}

/**
 * Escena del proceso. `timeline` expone el progreso del scroll (0..1).
 */
export function initProcess({ canvas, container, calloutsEl, timeline, gsap, reduced }) {
  const renderer = createRenderer(canvas, { alpha: false, shadows: true, exposure: 1.0, tone: THREE.NeutralToneMapping });
  renderer.setClearColor('#15110e', 1);
  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.3;
  scene.fog = new THREE.Fog('#15110e', 2.4, 5.5);

  const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 20);

  // --- luces
  const key = new THREE.DirectionalLight('#ffdcb5', 1.75);
  key.position.set(-1.1, 1.5, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -0.9;
  key.shadow.camera.right = 0.9;
  key.shadow.camera.top = 0.9;
  key.shadow.camera.bottom = -0.9;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 5;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = 6;
  const rim = new THREE.DirectionalLight('#9db2ff', 0.9);
  rim.position.set(1.6, 0.6, -1.2);
  const spot = new THREE.SpotLight('#ffbf86', 5, 5, 0.42, 0.85, 1.2);
  spot.position.set(0.3, 1.4, 1.3);
  spot.target.position.set(0, 0, 0);
  scene.add(key, rim, spot, spot.target, new THREE.HemisphereLight('#ffe7cf', '#140f0b', 0.2));

  // --- muro
  const tex = plasterTexture();
  tex.repeat.set(3, 2);
  const wallMat = new THREE.MeshStandardMaterial({
    color: '#463b32',
    roughness: 0.96,
    bumpMap: tex,
    bumpScale: 1.2,
    roughnessMap: tex,
    transparent: true,
    opacity: 0,
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.6), wallMat);
  wall.receiveShadow = true;
  wall.position.set(0, 0.2, 0);
  scene.add(wall);

  // --- madera
  const wood = new WoodMaterial({ species: 'nogal', seed: 17, length: L + 2 * CUT, clearcoat: 0.45, clearcoatRoughness: 0.3 });
  wood.wood.uRaw.value = 1;
  wood.wood.uRawFront.value = -1e4;
  wood.wood.uOil.value = 1;
  wood.wood.uOilFront.value = -1e4;

  const root = new THREE.Group(); // pivote de la tabla
  scene.add(root);
  const raw = new THREE.Mesh(boardGeometry(L + 2 * CUT, D + 0.6, T + 0.4, 0.05, 1), wood);
  raw.castShadow = true;
  root.add(raw);

  let bevelNow = 0.08;
  const main = new THREE.Mesh(boardGeometry(L, D, T, bevelNow, 4), wood);
  main.castShadow = true;
  main.visible = false;
  root.add(main);

  const offcuts = [-1, 1].map((s) => {
    const g = boardGeometry(CUT, D + 0.6, T + 0.4, 0.05, 1);
    g.translate((s * (L + CUT)) / 200, 0, 0);
    const m = new THREE.Mesh(g, wood);
    m.castShadow = true;
    m.visible = false;
    m.userData.s = s;
    root.add(m);
    return m;
  });

  // hoja de sierra (línea de luz)
  const sawMat = new THREE.MeshBasicMaterial({ color: '#ffb36b', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const saws = [-1, 1].map((s) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry((D + 3) / 100, (T + 3) / 100), sawMat);
    m.rotation.y = Math.PI / 2;
    m.position.x = (s * L) / 200;
    root.add(m);
    return m;
  });

  // polvo de lijado
  const DUST = 260;
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new Float32Array(DUST * 3);
  const dustVel = new Float32Array(DUST * 3);
  const dustLife = new Float32Array(DUST);
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({ color: '#e7c08a', size: 0.004, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const dust = new THREE.Points(dustGeo, dustMat);
  root.add(dust);
  const spawnDust = (i) => {
    const edge = Math.random();
    dustPos[i * 3] = (Math.random() - 0.5) * (L / 100);
    dustPos[i * 3 + 1] = (edge > 0.5 ? 1 : -1) * (T / 200) * Math.random();
    dustPos[i * 3 + 2] = (edge > 0.5 ? 1 : -1) * (D / 200);
    dustVel[i * 3] = (Math.random() - 0.5) * 0.02;
    dustVel[i * 3 + 1] = Math.random() * 0.03;
    dustVel[i * 3 + 2] = (Math.random() - 0.2) * 0.04;
    dustLife[i] = Math.random();
  };
  for (let i = 0; i < DUST; i++) spawnDust(i);

  // --- herrajes (vista explotada)
  const steel = MAT.steel();
  const bracket = hiddenBracket({ length: 64, rodLen: D - 5, rodGap: 44, mat: steel });
  bracket.traverse((o) => (o.castShadow = true));
  scene.add(bracket);
  const zinc = MAT.zinc();
  const plastic = MAT.plastic();
  const sGeo = screwGeometry(5);
  const aGeo = anchorGeometry(4);
  const holesX = [-0.45, -0.15, 0.15, 0.45].map((f) => (f * 64) / 100);
  const hwMats = [steel, zinc, plastic];
  hwMats.forEach((m) => {
    m.transparent = true;
    m.opacity = 0;
  });
  const screws = holesX.map((x) => {
    const m = new THREE.Mesh(sGeo, zinc);
    m.rotation.y = Math.PI; // punta hacia el muro (-Z)
    m.position.set(x, 0, 0.3);
    m.castShadow = true;
    scene.add(m);
    return m;
  });
  const anchors = holesX.map((x) => {
    const m = new THREE.Mesh(aGeo, plastic);
    m.rotation.y = Math.PI;
    m.position.set(x, 0, 0.2);
    scene.add(m);
    return m;
  });

  // --- decoración final
  const decor = new THREE.Group();
  scene.add(decor);
  const books = [
    book(3.0, 22, 16, '#8f4a2f'),
    book(2.4, 20, 15, '#d7c8ad'),
    book(2.8, 21, 15.5, '#56604a'),
  ];
  let by = T / 200;
  books.forEach((b, i) => {
    by += (i === 0 ? 3.0 : i === 1 ? 2.4 : 2.8) / 200;
    b.userData.rest = v3(-0.24 + (i - 1) * 0.004, by, D / 200 + 0.0 + (i % 2) * 0.004);
    by += (i === 0 ? 3.0 : i === 1 ? 2.4 : 2.8) / 200;
    b.rotation.y = (i - 1) * 0.05;
    b.castShadow = true;
    decor.add(b);
  });
  const vs = vase();
  vs.castShadow = true;
  vs.userData.rest = v3(0.2, T / 200, D / 200);
  decor.add(vs);
  const bowl = new THREE.Mesh(
    new THREE.LatheGeometry(
      [new THREE.Vector2(0.0001, 0), new THREE.Vector2(0.035, 0), new THREE.Vector2(0.05, 0.012), new THREE.Vector2(0.062, 0.03), new THREE.Vector2(0.064, 0.04), new THREE.Vector2(0.06, 0.04), new THREE.Vector2(0.056, 0.03), new THREE.Vector2(0.03, 0.006)],
      40,
    ),
    new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.45 }),
  );
  bowl.castShadow = true;
  bowl.userData.rest = v3(-0.24, by, D / 200);
  decor.add(bowl);
  const decorItems = [...books, bowl, vs];

  // --- etiquetas (HTML proyectado)
  const callouts = [
    { text: 'Humedad 8–12 %', at: () => v3((L + 2 * CUT) / 200, 0.02, 0.0), obj: root, from: 0.03, to: 0.15 },
    { text: 'Corte a medida ±1 mm', at: () => v3(L / 200, 0.03, 0), obj: root, from: 0.19, to: 0.32 },
    { text: 'Lija grano 80 → 220', at: () => v3(L / 200 - 0.05, T / 200, D / 200), obj: root, from: 0.36, to: 0.49 },
    { text: 'Linaza + cera de abeja', at: () => v3(0.05, T / 200, 0), obj: root, from: 0.53, to: 0.65 },
    { text: 'Placa de acero 4 mm', at: () => v3(0.33, 0.015, 0.005), obj: bracket, from: 0.72, to: 0.81 },
    { text: 'Varillas Ø 12 mm', at: () => v3(0.22, 0, (D - 5) / 100), obj: bracket, from: 0.73, to: 0.81 },
    { text: 'Taquetes y pijas incluidos', at: () => v3(0, 0, 0.0), obj: screws[1], from: 0.68, to: 0.79 },
    { text: 'Barrenos ocultos', at: () => v3(0.22, 0, -D / 200), obj: root, from: 0.8, to: 0.845 },
    { text: 'Hasta 20 kg', at: () => v3(0, 0.2, 0), obj: vs, from: 0.92, to: 1.01 },
  ].map((c) => {
    const el = document.createElement('div');
    el.className = 'callout';
    el.innerHTML = `<span>${c.text}</span>`;
    calloutsEl.appendChild(el);
    return { ...c, el, pos: new THREE.Vector3() };
  });
  const proj = { x: 0, y: 0 };

  // --- cámara (keyframes por etapa)
  const K = [
    { p: 0.0, pos: v3(0.25, 0.26, 2.1), look: v3(0, 0.0, 0.32) },
    { p: 0.16, pos: v3(0.05, 0.3, 1.9), look: v3(0, 0.0, 0.32) },
    { p: 0.33, pos: v3(0.78, 0.24, 1.55), look: v3(0.24, 0.0, 0.32) },
    { p: 0.5, pos: v3(-0.1, 0.8, 1.5), look: v3(0, 0.0, 0.3) },
    { p: 0.64, pos: v3(0.95, 0.5, 2.0), look: v3(0, 0.07, 0.12) },
    { p: 0.84, pos: v3(0.68, 0.32, 1.75), look: v3(0, 0.03, 0.08) },
    { p: 1.0, pos: v3(0.56, 0.27, 1.6), look: v3(0, 0.04, 0.08) },
  ];
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  const sampleCam = (p) => {
    let i = 0;
    while (i < K.length - 2 && p > K[i + 1].p) i++;
    const a = K[i];
    const b = K[i + 1];
    const t = ease(seg(p, a.p, b.p));
    camPos.lerpVectors(a.pos, b.pos, t);
    camLook.lerpVectors(a.look, b.look, t);
  };

  let camK = 1;
  const onResize = (w, h) => {
    const aspect = w / h;
    camK = aspect < 0.8 ? 1.9 : aspect < 1.2 ? 1.3 : 1;
    camera.fov = aspect < 0.8 ? 40 : aspect < 1.2 ? 34 : 30;
    camera.updateProjectionMatrix();
    // en escritorio la tabla vive en la mitad derecha
    camera.setViewOffset(w, h, aspect > 1.1 ? -w * 0.17 : 0, aspect < 0.8 ? h * 0.16 : 0, w, h);
  };

  // --------------------------------------------------------------- update --
  let p = 0;
  let time = 0;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();

  const update = (dt) => {
    time += dt;
    const target = timeline.state.progress;
    p += (target - p) * Math.min(1, dt * 5.5);
    if (Math.abs(target - p) < 0.0002) p = target;

    sampleCam(p);
    camera.position.copy(camPos).sub(camLook).multiplyScalar(camK).add(camLook);
    camera.lookAt(camLook);

    // ---- tabla: orientación por etapa
    const idle = reduced ? 0 : Math.sin(time * 0.6) * 0.04;
    const s1 = seg(p, 0.0, 0.16);
    const s2 = seg(p, 0.16, 0.33);
    const s3 = seg(p, 0.33, 0.5);
    const s4 = seg(p, 0.5, 0.66);

    let rx = lerp(0.42, 0.22, ease(s1));
    let ry = lerp(-0.9, -0.2, ease(s1)) + idle;
    let rz = lerp(0.14, 0.0, ease(s1));
    rx = lerp(rx, 0.18, ease(s2));
    ry = lerp(ry, -0.1, ease(s2));
    rx = lerp(rx, 0.5, ease(s3));
    ry = lerp(ry, 0.55, ease(s3));
    rx = lerp(rx, 0.95, ease(s4));
    ry = lerp(ry, 0.0, ease(s4));
    const s5r = ease(seg(p, 0.64, 0.72));
    rx = lerp(rx, 0.0, s5r);
    ry = lerp(ry, 0.0, s5r);
    rz = lerp(rz, 0.0, s5r);
    e.set(rx, ry, rz);
    q.setFromEuler(e);
    root.quaternion.copy(q);

    // ensamble: la tabla se eleva mientras el soporte se instala, baja y se desliza
    const up = ease(seg(p, 0.64, 0.7));
    const down = ease(seg(p, 0.79, 0.815));
    const slide = ease(seg(p, 0.815, 0.845));
    const lift = up * (1 - down);
    root.position.set(0, lift * 0.27, lerp(lerp(0.32, 0.46, up), D / 200, slide));

    // ---- 01→02 corte
    const cutT = seg(p, 0.18, 0.24);
    const cutDone = p > 0.2;
    raw.visible = !cutDone;
    main.visible = cutDone;
    offcuts.forEach((m) => {
      m.visible = cutDone && p < 0.34;
      const f = seg(p, 0.2, 0.3);
      m.position.set(m.userData.s * out(f) * 0.12, -f * f * 0.5, 0);
      m.rotation.z = m.userData.s * -f * 0.9;
    });
    sawMat.opacity = cutT > 0 && cutT < 1 ? Math.sin(cutT * Math.PI) * 0.85 : 0;
    saws.forEach((m) => {
      m.visible = sawMat.opacity > 0.01;
      m.scale.set(1, 0.2 + 0.8 * Math.sin(cutT * Math.PI), 1);
    });

    // cepillado: el frente "en bruto" recorre la tabla
    wood.wood.uRawFront.value = p < 0.24 ? -1e4 : lerp(-52, 52, seg(p, 0.24, 0.32));

    // ---- 03 lijado: cantos redondeados + polvo
    const bev = lerp(0.08, 0.45, seg(p, 0.35, 0.47));
    if (Math.abs(bev - bevelNow) > 0.02) {
      bevelNow = bev;
      main.geometry.dispose();
      main.geometry = boardGeometry(L, D, T, bevelNow, 4);
    }
    const dustOn = p > 0.34 && p < 0.5 ? Math.sin(seg(p, 0.34, 0.5) * Math.PI) : 0;
    dustMat.opacity = dustOn * 0.9;
    if (dustOn > 0.01) {
      for (let i = 0; i < DUST; i++) {
        dustLife[i] += dt * 0.5;
        if (dustLife[i] > 1) spawnDust(i);
        dustPos[i * 3] += dustVel[i * 3] * dt;
        dustPos[i * 3 + 1] += dustVel[i * 3 + 1] * dt - dt * 0.004;
        dustPos[i * 3 + 2] += dustVel[i * 3 + 2] * dt;
      }
      dustGeo.attributes.position.needsUpdate = true;
    }

    // ---- 04 aceite
    wood.wood.uOilFront.value = p < 0.52 ? -1e4 : lerp(-50, 54, seg(p, 0.52, 0.64));

    // ---- 05 ensamble
    wallMat.opacity = ease(seg(p, 0.64, 0.72));
    wall.visible = wallMat.opacity > 0.001;
    const aIn = ease(seg(p, 0.68, 0.72));
    const pIn = ease(seg(p, 0.72, 0.75));
    const sIn = ease(seg(p, 0.75, 0.79));
    const showHw = p > 0.64;
    bracket.visible = showHw;
    bracket.position.set(0, 0, lerp(0.16, 0.0, pIn));
    anchors.forEach((m, i) => {
      m.visible = showHw;
      m.position.set(holesX[i], 0, lerp(0.26, 0.0, aIn) + (1 - aIn) * 0.02 * i);
    });
    screws.forEach((m, i) => {
      m.visible = showHw;
      m.position.set(holesX[i], 0, lerp(0.34 + i * 0.012, 0.008, sIn));
      m.rotation.z = sIn * Math.PI * 6;
    });
    const hwAlpha = clamp01(seg(p, 0.64, 0.68));
    for (const m of hwMats) m.opacity = hwAlpha;

    // ---- 06 decoración
    decorItems.forEach((o, i) => {
      const t0 = 0.85 + i * 0.018;
      const f = seg(p, t0, t0 + 0.045);
      o.visible = f > 0;
      const rest = o.userData.rest;
      o.position.set(rest.x, rest.y + (1 - back(f)) * 0.25 + (f < 1 ? 0 : 0), rest.z);
      o.scale.setScalar(0.001 + 0.999 * out(Math.min(1, f * 1.6)));
    });
    decor.position.copy(root.position).setZ(root.position.z - D / 200);

    // ---- etiquetas
    root.updateMatrixWorld();
    bracket.updateMatrixWorld();
    for (const c of callouts) {
      const on = p >= c.from && p <= c.to;
      c.el.classList.toggle('is-on', on);
      if (!on) continue;
      c.pos.copy(c.at());
      c.obj.localToWorld(c.pos);
      stage.project(c.pos, proj);
      const flip = proj.x > stage.size.w - 260;
      c.el.classList.toggle('is-flip', flip);
      c.el.style.transform = `translate(${proj.x.toFixed(1)}px, ${proj.y.toFixed(1)}px) translate(${flip ? 'calc(-100% + 4px)' : '-4px'}, -50%)`;
    }
    return true;
  };

  const stage = new Stage({ renderer, scene, camera, container, onResize, update, maxDpr: 1.75 });
  const ready = renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve();
  return { stage, ready };
}
