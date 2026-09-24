import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BRAND, designLink, formatMXN, MODELS, priceFor, whatsappLink } from '../config.js';
import { toast } from '../ui/contact.js';
import { boardGeometry } from './board.js';
import { createRenderer, Stage, studioEnvironment } from './core.js';
import { hiddenBracket, lBracket, MAT, towelBar } from './hardware.js';
import { SPECIES, WoodMaterial } from './wood/WoodMaterial.js';

const FIN_LABEL = { natural: 'Natural', tostado: 'Tostado', ceniza: 'Ceniza' };

function wallTexture(size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  // manchas suaves de cal
  for (let i = 0; i < 380; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 10 + Math.random() * 70;
    const a = 0.03 + Math.random() * 0.05;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const v = Math.random() > 0.5 ? 255 : 0;
    grd.addColorStop(0, `rgba(${v},${v},${v},${a})`);
    grd.addColorStop(1, `rgba(${v},${v},${v},0)`);
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function initConfigurator({ canvas, container, form, dimsEl, badgeEl, priceEl, noteEl, waBtn, copyBtn, resetBtn, dimToggle, explodeBtn, hintEl, gsap, reduced }) {
  const renderer = createRenderer(canvas, { shadows: true, exposure: 1.0, tone: THREE.NeutralToneMapping });
  renderer.setClearColor('#e7dfd2', 1);
  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.42;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.02, 30);
  camera.position.set(0.75, 0.32, 1.9);

  // luces: ventana a la izquierda con sombra suave + relleno cálido
  const key = new THREE.DirectionalLight('#fff1de', 1.8);
  key.position.set(-1.3, 1.9, 1.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -1.2, right: 1.2, top: 1, bottom: -1, near: 0.3, far: 6 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 8;
  scene.add(key, new THREE.HemisphereLight('#fff6ea', '#b8a891', 0.55));

  const wt = wallTexture();
  wt.repeat.set(2, 1.4);
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 3.4),
    new THREE.MeshStandardMaterial({ color: '#e9e1d4', roughness: 0.95, bumpMap: wt, bumpScale: 0.6 }),
  );
  wall.receiveShadow = true;
  wall.position.set(0, 0.3, 0);
  scene.add(wall);

  // ---------------------------------------------------------------- modelo --
  const val = (name) => form.querySelector(`input[name="${name}"]:checked`)?.value;
  const st = {
    model: val('model') || 'flotante',
    species: val('species') || 'parota',
    finish: val('finish') || 'natural',
    length: +form.querySelector('input[name="length"]').value || 90,
    depth: +val('depth') || 20,
    thickness: +val('thickness') || 3.8,
    qty: +form.querySelector('input[name="qty"]').value || 1,
    // valores mostrados (animados)
    L: 0,
    D: 0,
    T: 0,
    ex: 0,
    built: { L: 0, D: 0, T: 0, model: '' },
  };
  st.L = st.length;
  st.D = st.depth;
  st.T = st.thickness;

  const wood = new WoodMaterial({ species: st.species, finish: st.finish, seed: 21, length: 150, clearcoat: 0.3, clearcoatRoughness: 0.35 });
  const lipWood = new WoodMaterial({ species: st.species, finish: st.finish, seed: 22, length: 150, clearcoat: 0.3, clearcoatRoughness: 0.35 });
  const shelf = new THREE.Group();
  scene.add(shelf);
  // "movable": lo que se separa del muro en la vista explotada
  const movable = new THREE.Group();
  shelf.add(movable);
  const board = new THREE.Mesh(boardGeometry(90, 20, 3.8), wood);
  board.castShadow = true;
  board.receiveShadow = true;
  movable.add(board);
  const lip = new THREE.Mesh(boardGeometry(90, 2, 6), lipWood);
  lip.castShadow = true;
  movable.add(lip);
  const steel = MAT.steel();
  const brass = MAT.brass();
  const hw = new THREE.Group(); // herraje fijo al muro
  shelf.add(hw);
  const hwMove = new THREE.Group(); // herraje que viaja con la tabla
  movable.add(hwMove);
  let brackets = [];
  let bar = null;

  // cotas
  const dimMat = new THREE.LineBasicMaterial({ color: '#1b1612', transparent: true, opacity: 0.75 });
  const dimGeo = new THREE.BufferGeometry();
  const dimLines = new THREE.LineSegments(dimGeo, dimMat);
  scene.add(dimLines);
  const labels = {
    length: dimsEl.querySelector('[data-dim="length"]'),
    depth: dimsEl.querySelector('[data-dim="depth"]'),
    thickness: dimsEl.querySelector('[data-dim="thickness"]'),
  };
  const anchors = { length: new THREE.Vector3(), depth: new THREE.Vector3(), thickness: new THREE.Vector3() };

  function build() {
    const { L, D, T } = st;
    const b = st.built;
    const geomChanged = Math.abs(b.L - L) > 0.15 || Math.abs(b.D - D) > 0.1 || Math.abs(b.T - T) > 0.05;
    if (!geomChanged && b.model === st.model) return;
    const isTowel = st.model === 'toallero';
    // la tabla: su cara trasera toca el muro (z = 0); con toallero, el respaldo va detrás
    const back = isTowel ? 2 : 0;
    if (geomChanged) {
      board.geometry.dispose();
      board.geometry = boardGeometry(L, D, T, 0.35, 4);
    }
    board.position.set(0, 0, (back + D / 2) / 100);
    lip.visible = isTowel;
    if (isTowel) {
      lip.geometry.dispose();
      lip.geometry = boardGeometry(L, 2, 6, 0.3, 3);
      lip.position.set(0, (6 / 2 - T / 2) / 100, 1 / 100);
    }
    // herrajes
    for (const g of [hw, hwMove]) {
      g.traverse((o) => o.geometry?.dispose());
      g.clear();
    }
    brackets = [];
    bar = null;
    if (st.model === 'flotante') {
      const plate = Math.min(L * 0.72, L - 10);
      const br = hiddenBracket({ length: plate, rodLen: Math.max(8, D - 5), rodGap: Math.min(plate * 0.72, plate - 8), mat: steel });
      br.traverse((o) => (o.castShadow = true));
      hw.add(br);
    }
    if (st.model === 'mensula') {
      const off = Math.min(L * 0.3, L / 2 - 8);
      for (const s of [-1, 1]) {
        const br = lBracket({ arm: 15, depth: Math.max(10, D - 2), mat: steel });
        br.position.set((s * off) / 100, -T / 200, 0);
        br.traverse((o) => (o.castShadow = true));
        hw.add(br);
        brackets.push(br);
      }
    }
    if (isTowel) {
      bar = towelBar({ length: L - 3, drop: 4, mat: brass });
      bar.position.set(0, -T / 200, (back + D - 1.8) / 100);
      bar.castShadow = true;
      hwMove.add(bar);
      // pijas que atraviesan el respaldo
      const zinc = MAT.zinc();
      const sg = new THREE.CylinderGeometry(0.005, 0.005, 0.002, 16);
      sg.rotateX(Math.PI / 2);
      for (const f of [-0.35, 0.35]) {
        const sc = new THREE.Mesh(sg, zinc);
        sc.position.set((f * L) / 100, (6 - T) / 200 + 0.012, 0.021);
        hwMove.add(sc);
      }
    }
    wood.length = lipWood.length = L;
    st.built = { L, D, T, model: st.model };
    updateDims();
  }

  function updateDims() {
    const { L, D, T } = st;
    const back = st.model === 'toallero' ? 2 : 0;
    const x0 = -L / 200;
    const x1 = L / 200;
    const zf = (back + D) / 100;
    const yt = T / 200;
    const pad = 0.045;
    const tick = 0.012;
    const P = [];
    const seg = (a, b) => P.push(...a, ...b);
    // largo: sobre el frente
    const yl = yt + (st.model === 'toallero' ? 0.06 : 0) + pad;
    seg([x0, yl, zf], [x1, yl, zf]);
    seg([x0, yl - tick, zf], [x0, yl + tick, zf]);
    seg([x1, yl - tick, zf], [x1, yl + tick, zf]);
    anchors.length.set(0, yl, zf);
    // fondo: a la derecha, sobre la cara superior
    const xd = x1 + pad;
    seg([xd, yt, back / 100], [xd, yt, zf]);
    seg([xd - tick, yt, back / 100], [xd + tick, yt, back / 100]);
    seg([xd - tick, yt, zf], [xd + tick, yt, zf]);
    anchors.depth.set(xd + 0.03, yt, (back / 100 + zf) / 2);
    // grosor: a la izquierda, al frente
    const xt = x0 - pad * 0.7;
    seg([xt, -yt, zf], [xt, yt, zf]);
    seg([xt - tick, -yt, zf], [xt + tick, -yt, zf]);
    seg([xt - tick, yt, zf], [xt + tick, yt, zf]);
    anchors.thickness.set(xt - 0.05, 0, zf);
    dimGeo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    dimGeo.computeBoundingSphere();
    labels.length.textContent = `${Math.round(st.length)} cm`;
    labels.depth.textContent = `${st.depth} cm`;
    labels.thickness.textContent = `${st.thickness} cm`;
  }

  // --------------------------------------------------------------- cámara --
  let stage = null;
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enablePan = false;
  controls.minPolarAngle = 0.55;
  controls.maxPolarAngle = 1.72;
  controls.minAzimuthAngle = -1.05;
  controls.maxAzimuthAngle = 1.05;
  controls.rotateSpeed = 0.7;
  controls.zoomSpeed = 0.6;
  controls.target.set(0, -0.02, 0.1);
  let userMoved = false;
  controls.addEventListener('start', () => {
    userMoved = true;
    hintEl?.classList.add('is-hidden');
  });

  const fitDistance = () => {
    const aspect = camera.aspect || 1.3;
    const span = Math.max(st.length / 100 + 0.22, 0.8);
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const d = span / (2 * Math.tan(vFov / 2) * Math.min(aspect, 1.6)) + 0.25;
    return THREE.MathUtils.clamp(d, 1.1, 4.2);
  };
  const home = () => {
    const d = fitDistance();
    const dir = new THREE.Vector3(0.38, 0.2, 1).normalize();
    return controls.target.clone().add(dir.multiplyScalar(d));
  };
  let camTween = null;
  const frame = (animate = true) => {
    const to = home();
    controls.minDistance = fitDistance() * 0.45;
    controls.maxDistance = fitDistance() * 1.6;
    camTween?.kill();
    if (!animate || reduced) {
      camera.position.copy(to);
      stage?.invalidate();
      return;
    }
    camTween = gsap.to(camera.position, { x: to.x, y: to.y, z: to.z, duration: 1.2, ease: 'power3.inOut', onUpdate: () => stage?.invalidate() });
  };

  // ---------------------------------------------------------------- update --
  let animating = 0;
  const proj = { x: 0, y: 0 };
  const update = (dt) => {
    let keep = false;
    // animación suave de medidas
    for (const [k, v] of [
      ['L', 'length'],
      ['D', 'depth'],
      ['T', 'thickness'],
    ]) {
      const d = st[v] - st[k];
      if (Math.abs(d) > 0.01) {
        st[k] += d * Math.min(1, dt * (reduced ? 60 : 9));
        keep = true;
      } else st[k] = st[v];
    }
    build();
    const ex = st.ex;
    movable.position.set(0, ex * (st.model === 'mensula' ? 0.1 : 0.05), ex * (st.model === 'mensula' ? 0.04 : 0.17));
    movable.rotation.x = ex * (st.model === 'mensula' ? -0.08 : 0.06);
    if (controls.update()) keep = true;
    wood.applyFinish();
    lipWood.applyFinish();
    if (animating > 0) keep = true;
    // etiquetas de cotas
    if (!dimsEl.classList.contains('is-off')) {
      for (const k of ['length', 'depth', 'thickness']) {
        stage.project(anchors[k], proj);
        labels[k].style.transform = `translate(${proj.x.toFixed(1)}px, ${proj.y.toFixed(1)}px) translate(-50%, -50%)`;
      }
    }
    return keep;
  };

  stage = new Stage({ renderer, scene, camera, container, update, continuous: false, maxDpr: 2, onResize: () => frame(false) });

  // ------------------------------------------------------------ interacción --
  const runAnim = (tween) => {
    animating++;
    tween.eventCallback('onComplete', () => {
      animating--;
    });
    stage.invalidate();
    return tween;
  };

  let wipe = null;
  function setSpecies(key) {
    if (st.species === key && !wipe) return;
    st.species = key;
    wipe?.progress(1);
    const seed = 21 + Math.floor(Math.random() * 40);
    wood.prepareSpecies(key, seed);
    lipWood.prepareSpecies(key, seed + 1);
    const o = { t: 0 };
    wipe = runAnim(
      gsap.to(o, {
        t: 1,
        duration: reduced ? 0.01 : 1.3,
        ease: 'power2.inOut',
        onUpdate: () => {
          wood.setWipe(o.t);
          lipWood.setWipe(o.t);
          stage.invalidate();
        },
      }),
    );
    wipe.eventCallback('onComplete', () => {
      animating--;
      wood.commitSpecies();
      lipWood.commitSpecies();
      wipe = null;
      stage.invalidate();
    });
  }

  function setFinish(key) {
    st.finish = key;
    for (const m of [wood, lipWood]) {
      const to = m.finishTarget(key);
      runAnim(gsap.to(m.fin, { ...to, duration: reduced ? 0.01 : 0.9, ease: 'power2.inOut', onUpdate: () => stage.invalidate() }));
    }
  }

  function setModel(key) {
    const M = MODELS[key];
    st.model = key;
    // restringe fondos/grosores disponibles
    form.querySelectorAll('input[name="depth"]').forEach((i) => (i.disabled = !M.depths.includes(+i.value)));
    form.querySelectorAll('input[name="thickness"]').forEach((i) => (i.disabled = !M.thicknesses.includes(+i.value)));
    if (!M.depths.includes(st.depth)) setRadio('depth', nearest(M.depths, st.depth));
    if (!M.thicknesses.includes(st.thickness)) setRadio('thickness', nearest(M.thicknesses, st.thickness));
    form.querySelector('[data-model-hint]').textContent = M.hardware;
    st.built.model = '';
    if (!reduced) {
      runAnim(gsap.fromTo(shelf.position, { y: 0.03 }, { y: 0, duration: 0.9, ease: 'elastic.out(1, 0.5)', onUpdate: () => stage.invalidate() }));
      runAnim(gsap.fromTo(hw.scale, { x: 0.85, y: 0.85, z: 0.85 }, { x: 1, y: 1, z: 1, duration: 0.8, ease: 'back.out(2)' }));
    }
  }

  const nearest = (arr, v) => arr.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  function setRadio(name, value) {
    const inp = form.querySelector(`input[name="${name}"][value="${value}"]`);
    if (inp) inp.checked = true;
    st[name] = +value;
  }

  const lengthOut = form.querySelector('[data-length-out]');
  const range = form.querySelector('input[name="length"]');
  const qtyIn = form.querySelector('input[name="qty"]');
  const setRangeFill = () => {
    const p = ((range.value - range.min) / (range.max - range.min)) * 100;
    range.style.setProperty('--p', `${p}%`);
  };

  let shown = 0;
  function refresh() {
    const pr = priceFor(st);
    const o = { v: shown };
    gsap.to(o, {
      v: pr.total,
      duration: reduced ? 0.01 : 0.6,
      ease: 'power2.out',
      onUpdate: () => {
        priceEl.innerHTML = `${formatMXN(Math.round(o.v / 10) * 10)}<small>MXN</small>`;
      },
    });
    shown = pr.total;
    noteEl.textContent =
      st.qty > 1
        ? `${formatMXN(pr.unit)} c/u · Precio de referencia. Fabricación en 7–10 días hábiles.`
        : 'Precio de referencia. Fabricación en 7–10 días hábiles.';
    badgeEl.textContent = `${SPECIES[st.species].label} · ${FIN_LABEL[st.finish]}`;
    lengthOut.textContent = `${st.length} cm`;
    setRangeFill();
    waBtn.href = whatsappLink(message());
    waBtn.target = '_blank';
    waBtn.rel = 'noopener';
    stage.invalidate();
  }

  function message() {
    const M = MODELS[st.model];
    const pr = priceFor(st);
    return [
      `Hola ${BRAND.name} 👋 Quiero cotizar:`,
      `• Modelo: ${M.long} (${M.hardware.toLowerCase()})`,
      `• Madera: ${SPECIES[st.species].label} · Acabado ${FIN_LABEL[st.finish].toLowerCase()}`,
      `• Medidas: ${st.length} × ${st.depth} × ${st.thickness} cm`,
      `• Cantidad: ${st.qty}`,
      `• Precio estimado: ${formatMXN(pr.total)} MXN`,
      `Mi diseño: ${designLink(st)}`,
      '¿Me confirman precio final y envío a mi ciudad?',
    ].join('\n');
  }

  form.addEventListener('input', (e) => {
    const t = e.target;
    if (t.name === 'model') setModel(t.value);
    else if (t.name === 'species') setSpecies(t.value);
    else if (t.name === 'finish') setFinish(t.value);
    else if (t.name === 'length') {
      st.length = +t.value;
      if (!userMoved) frame();
      else {
        controls.minDistance = fitDistance() * 0.45;
        controls.maxDistance = fitDistance() * 1.6;
      }
    } else if (t.name === 'depth') st.depth = +t.value;
    else if (t.name === 'thickness') st.thickness = +t.value;
    else if (t.name === 'qty') st.qty = Math.max(1, Math.min(20, +t.value || 1));
    refresh();
  });
  form.querySelectorAll('[data-qty]').forEach((b) =>
    b.addEventListener('click', () => {
      st.qty = Math.max(1, Math.min(20, st.qty + +b.dataset.qty));
      qtyIn.value = st.qty;
      refresh();
    }),
  );
  resetBtn?.addEventListener('click', () => {
    userMoved = false;
    frame();
  });
  explodeBtn?.addEventListener('click', () => {
    const on = explodeBtn.getAttribute('aria-pressed') !== 'true';
    explodeBtn.setAttribute('aria-pressed', String(on));
    explodeBtn.querySelector('span').textContent = on ? 'Armar repisa' : 'Ver herraje';
    runAnim(gsap.to(st, { ex: on ? 1 : 0, duration: reduced ? 0.01 : 1.1, ease: 'expo.inOut', onUpdate: () => stage.invalidate() }));
    dimsEl.classList.toggle('is-off', on || !dimToggle.checked);
    dimLines.visible = !on && dimToggle.checked;
  });
  dimToggle?.addEventListener('change', () => {
    dimsEl.classList.toggle('is-off', !dimToggle.checked);
    dimLines.visible = dimToggle.checked;
    stage.invalidate();
  });
  copyBtn?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(message());
      toast('Especificaciones copiadas ✓');
    } catch {
      toast('No se pudo copiar; usa el botón de WhatsApp');
    }
  });

  setModel(st.model);
  refresh();
  frame(false);

  const ready = renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve();
  return { stage, ready, setSpecies, setModel };
}
