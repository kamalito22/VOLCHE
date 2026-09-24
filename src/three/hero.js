import * as THREE from 'three';
import { boardGeometry } from './board.js';
import { createRenderer, isCoarse, Stage, studioEnvironment } from './core.js';
import { WoodMaterial } from './wood/WoodMaterial.js';

const L = 100;
const D = 26;
const T = 5;

/**
 * Hero: un tablón de madera maciza flotando. Se arrastra para girar (con
 * inercia), sigue sutilmente al puntero y se transforma de especie con un
 * barrido de luz cálida.
 */
export function initHero({ canvas, stageEl, hintEl, gsap, ScrollTrigger, reduced, species = 'parota' }) {
  const renderer = createRenderer(canvas, { alpha: true, exposure: 1.0, tone: THREE.NeutralToneMapping });
  const scene = new THREE.Scene();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.34;

  const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 30);
  camera.position.set(0, 0.02, 3);

  const key = new THREE.DirectionalLight('#ffdcb8', 2.1);
  key.position.set(-2.2, 2.6, 2.4);
  const rim = new THREE.DirectionalLight('#e3e6ff', 1.0);
  rim.position.set(2.6, 1.0, -2.2);
  const under = new THREE.DirectionalLight('#ff9d5c', 0.3);
  under.position.set(0.5, -2.5, 1.2);
  scene.add(key, rim, under, new THREE.HemisphereLight('#ffe8d0', '#20170f', 0.22));

  const material = new WoodMaterial({ species, seed: 3, length: L, clearcoat: 0.35, clearcoatRoughness: 0.28 });
  const board = new THREE.Mesh(boardGeometry(L, D, T, 0.45, 5), material);
  // orientación base: diagonal, mostrando cara, canto y testa
  board.rotation.set(0.52, 0, 0.3);

  const spin = new THREE.Group(); // giro del usuario (yaw/pitch)
  const float = new THREE.Group(); // flotación + parallax + scroll
  spin.add(board);
  float.add(spin);
  scene.add(float);

  // ------------------------------------------------------------ estado --
  const st = {
    yaw: -0.55,
    pitch: 0,
    vYaw: 0,
    vPitch: 0,
    auto: reduced ? 0 : 0.16,
    dragging: false,
    px: 0,
    py: 0,
    tx: 0,
    ty: 0,
    scroll: 0,
    intro: reduced ? 1 : 0,
    fit: 1,
  };

  // ------------------------------------------------------------ puntero --
  let lastX = 0;
  let lastY = 0;
  let moved = 0;
  stageEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    st.dragging = true;
    moved = 0;
    lastX = e.clientX;
    lastY = e.clientY;
    stageEl.setPointerCapture?.(e.pointerId);
  });
  stageEl.addEventListener('pointermove', (e) => {
    const r = stageEl.getBoundingClientRect();
    st.tx = ((e.clientX - r.left) / r.width) * 2 - 1;
    st.ty = ((e.clientY - r.top) / r.height) * 2 - 1;
    if (!st.dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    st.vYaw = dx * 0.0085;
    st.vPitch = dy * 0.006;
    st.yaw += st.vYaw;
    st.pitch = THREE.MathUtils.clamp(st.pitch + st.vPitch, -0.9, 0.9);
    if (moved > 12) hintEl?.classList.add('is-hidden');
  });
  const end = () => {
    st.dragging = false;
  };
  stageEl.addEventListener('pointerup', end);
  stageEl.addEventListener('pointercancel', end);
  stageEl.addEventListener('pointerleave', () => {
    st.tx = 0;
    st.ty = 0;
  });

  // ------------------------------------------------------------- encuadre --
  const onResize = (w, h) => {
    const aspect = w / h;
    // la tabla (1 m) debe caber en ~74% del ancho visible
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const need = 1.05 / 0.74;
    const distW = need / (2 * Math.tan(vFov / 2) * aspect);
    camera.position.z = THREE.MathUtils.clamp(distW, 2.6, 7.5);
    st.fit = aspect < 0.8 ? 1 : 0;
    board.rotation.z = aspect < 0.8 ? 0.95 : 0.3;
    camera.position.y = aspect < 0.8 ? 0.05 : 0.02;
  };

  // ---------------------------------------------------------- scroll-out --
  if (!reduced) {
    ScrollTrigger.create({
      trigger: stageEl.closest('section'),
      start: 'top top',
      end: 'bottom top',
      scrub: true,
      onUpdate: (self) => (st.scroll = self.progress),
    });
  }

  // --------------------------------------------------------------- loop ---
  const update = (dt, t) => {
    if (!st.dragging) {
      st.vYaw *= Math.pow(0.04, dt);
      st.vPitch *= Math.pow(0.04, dt);
      st.yaw += st.vYaw + st.auto * dt;
      st.pitch += st.vPitch;
      st.pitch += (0 - st.pitch) * Math.min(1, dt * 1.6);
    }
    st.px += (st.tx - st.px) * Math.min(1, dt * 3);
    st.py += (st.ty - st.py) * Math.min(1, dt * 3);
    spin.rotation.set(st.pitch + st.py * 0.12, st.yaw + st.px * 0.18, 0);
    const bob = reduced ? 0 : Math.sin(t * 0.9) * 0.018;
    const s = st.scroll;
    float.position.set(st.px * 0.035, bob - st.py * 0.025 + s * 0.55, 0);
    float.rotation.set(s * 0.6, 0, -s * 0.35);
    const k = 0.62 + 0.38 * st.intro;
    float.scale.setScalar(k * (1 - s * 0.18));
    canvas.style.opacity = String(1 - Math.max(0, s - 0.55) / 0.45);
    return true;
  };

  const stage = new Stage({ renderer, scene, camera, container: stageEl, onResize, update, maxDpr: 2 });

  // --------------------------------------------------------- API pública --
  let busy = null;
  function setSpecies(key) {
    if (key === material.species && !busy) return Promise.resolve();
    busy?.progress(1);
    material.prepareSpecies(key, 3 + Math.floor(Math.random() * 50));
    const o = { t: 0 };
    return new Promise((resolve) => {
      busy = gsap.to(o, {
        t: 1,
        duration: reduced ? 0.01 : 1.7,
        ease: 'power2.inOut',
        onUpdate: () => material.setWipe(o.t),
        onComplete: () => {
          material.commitSpecies();
          busy = null;
          resolve();
        },
      });
      if (!reduced) st.vYaw += 0.05;
    });
  }

  function intro() {
    if (reduced) return;
    gsap.fromTo(st, { intro: 0 }, { intro: 1, duration: 2.2, ease: 'expo.out' });
    st.vYaw = 0.22;
  }

  // compila los shaders antes de mostrar
  const ready = (renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve()).then(() => {
    renderer.render(scene, camera);
  });

  return { ready, setSpecies, intro, stage, material, coarse: isCoarse() };
}
