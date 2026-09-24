import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const isCoarse = () => matchMedia('(pointer: coarse)').matches;

export function createRenderer(canvas, { alpha = false, shadows = false, exposure = 1, tone = THREE.AgXToneMapping } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = tone;
  renderer.toneMappingExposure = exposure;
  if (alpha) renderer.setClearColor(0x000000, 0);
  if (shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
  }
  return renderer;
}

/** Mapa de entorno de estudio (sin descargas). */
export function studioEnvironment(renderer, blur = 0.04) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), blur).texture;
  pmrem.dispose();
  return env;
}

/**
 * Bucle de render por escena: sólo corre si el lienzo está en pantalla y la
 * pestaña visible; ajusta el pixel ratio si los cuadros se vuelven lentos.
 */
export class Stage {
  constructor({ renderer, scene, camera, container, onResize, update, maxDpr = 2, minDpr = 0.75, continuous = true }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.container = container;
    this.onResize = onResize;
    this.update = update;
    this.continuous = continuous;
    this.maxDpr = Math.min(window.devicePixelRatio || 1, isCoarse() ? Math.min(maxDpr, 1.6) : maxDpr);
    this.minDpr = minDpr;
    this.dpr = this.maxDpr;
    this.visible = false;
    this.dirty = true;
    this.running = false;
    this.last = 0;
    this.slow = 0;
    this.frames = [];
    this.size = { w: 1, h: 1 };
    renderer.setPixelRatio(this.dpr);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.io = new IntersectionObserver(
      ([e]) => {
        this.visible = e.isIntersecting;
        if (this.visible) this.start();
      },
      { rootMargin: '120px' },
    );
    this.io.observe(container);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.visible) this.start();
    });
    this.resize();
    this.tick = this.tick.bind(this);
  }

  resize() {
    const r = this.container.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    this.size = { w, h };
    this.renderer.setSize(w, h, false);
    if (this.camera.isPerspectiveCamera) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.onResize?.(w, h);
    this.invalidate();
  }

  invalidate() {
    this.dirty = true;
    if (this.visible) this.start();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  tick(now) {
    if (!this.visible || document.hidden) {
      this.running = false;
      return;
    }
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const keep = this.update?.(dt, now / 1000);
    if (this.continuous || this.dirty || keep) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
      this.adapt(dt);
    }
    if (this.continuous || keep || this.dirty) requestAnimationFrame(this.tick);
    else this.running = false;
  }

  adapt(dt) {
    this.frames.push(dt);
    if (this.frames.length < 45) return;
    const sorted = [...this.frames].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    this.frames.length = 0;
    if (med > 0.028 && this.dpr > this.minDpr) {
      this.dpr = Math.max(this.minDpr, this.dpr - 0.25);
      this.renderer.setPixelRatio(this.dpr);
      this.resize();
    }
  }

  project(v3, out = { x: 0, y: 0, behind: false }) {
    const v = v3.clone().project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.size.w;
    out.y = (-v.y * 0.5 + 0.5) * this.size.h;
    out.behind = v.z > 1;
    return out;
  }
}
