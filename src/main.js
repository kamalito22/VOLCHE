import './styles/main.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { formatMXN, MODELS, priceFor, WOOD_INFO } from './config.js';
import { hasWebGL2 } from './ui/webgl.js';
import { initCollection } from './ui/collection.js';
import { initContact } from './ui/contact.js';
import { initCursor } from './ui/cursor.js';
import { createLoader } from './ui/loader.js';
import { initMagnetic } from './ui/magnetic.js';
import { initMarquee } from './ui/marquee.js';
import { initNav } from './ui/nav.js';
import { initReveals } from './ui/reveals.js';
import { initSmooth } from './ui/smooth.js';
import { initWoods } from './ui/woods.js';
import { initProcessTimeline } from './ui/process-timeline.js';

gsap.registerPlugin(ScrollTrigger, SplitText);
if (import.meta.env.DEV) window.__ST = ScrollTrigger;

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const webgl = hasWebGL2();
document.documentElement.classList.toggle('no-webgl', !webgl);

const loader = createLoader(gsap);
const smooth = initSmooth(gsap, ScrollTrigger, reduced);

initCursor(gsap);
initMagnetic(gsap);
initContact({ ScrollTrigger });
initNav({ gsap, ScrollTrigger, smooth });
initWoods();

// precios "desde" calculados con la misma fórmula del configurador
for (const el of document.querySelectorAll('[data-from-price]')) {
  const model = el.dataset.fromPrice;
  const M = MODELS[model];
  const { unit } = priceFor({ model, species: 'pino', finish: 'natural', length: 40, depth: M.depths[0], thickness: M.thicknesses[0] });
  el.textContent = formatMXN(unit);
}

// la sección del proceso se fija desde el inicio (las posiciones de scroll dependen de ella)
const timeline = initProcessTimeline({ gsap, ScrollTrigger });

// ------------------------------------------------------------------ hero --
let hero = null;
const heroCanvas = document.querySelector('[data-hero-canvas]');
const heroStage = document.querySelector('[data-hero-stage]');
const heroHint = document.querySelector('[data-hero-hint]');
const chips = [...document.querySelectorAll('[data-hero-species] .chip')];
const speciesName = document.querySelector('[data-hero-species-name]');

loader.track(document.fonts.ready);
if (webgl) {
  const heroReady = import('./three/hero.js')
    .then((m) => {
      hero = m.initHero({ canvas: heroCanvas, stageEl: heroStage, hintEl: heroHint, gsap, ScrollTrigger, reduced });
      return hero.ready;
    })
    .catch((err) => {
      console.error('[VOLCHE] hero 3D', err);
      document.documentElement.classList.add('no-webgl');
    });
  loader.track(heroReady);
}

chips.forEach((chip) =>
  chip.addEventListener('click', () => {
    const key = chip.dataset.species;
    chips.forEach((c) => {
      c.classList.toggle('is-active', c === chip);
      c.setAttribute('aria-checked', String(c === chip));
    });
    const info = WOOD_INFO[key];
    speciesName.innerHTML = `<em>${chip.textContent.trim()}</em> · <span class="mono">${info.latin}</span>`;
    gsap.fromTo(speciesName, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'power3.out' });
    hero?.setSpecies(key);
  }),
);

// --------------------------------------------------------- escenas diferidas --
function lazy(el, fn, margin = '800px') {
  if (!el) return;
  const io = new IntersectionObserver(
    ([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      fn();
    },
    { rootMargin: margin },
  );
  io.observe(el);
}

if (webgl) {
  lazy(document.querySelector('#ensamble'), () =>
    import('./three/process.js').then((m) =>
      m.initProcess({
        canvas: document.querySelector('[data-process-canvas]'),
        container: document.querySelector('.process__stage'),
        calloutsEl: document.querySelector('[data-callouts]'),
        timeline,
        gsap,
        reduced,
      }),
    ),
  );
  lazy(document.querySelector('#disena'), () =>
    import('./three/configurator.js').then((m) => {
      const q = (s) => document.querySelector(s);
      m.initConfigurator({
        canvas: q('[data-config-canvas]'),
        container: q('.config__viewer'),
        form: q('[data-config-form]'),
        dimsEl: q('[data-dims]'),
        badgeEl: q('[data-config-badge]'),
        priceEl: q('[data-price]'),
        noteEl: q('[data-price-note]'),
        waBtn: q('[data-config-wa]'),
        copyBtn: q('[data-config-copy]'),
        resetBtn: q('[data-config-reset]'),
        dimToggle: q('[data-config-dimtoggle]'),
        explodeBtn: q('[data-config-explode]'),
        gsap,
        reduced,
      });
    }),
  );
} else {
  initStaticConfigurator();
}

// enlaces que preconfiguran el configurador (tarjetas, maderas)
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-config-model], [data-config-species]');
  if (!a) return;
  const form = document.querySelector('[data-config-form]');
  const pick = (name, value) => {
    const inp = value && form.querySelector(`input[name="${name}"][value="${value}"]`);
    if (inp && !inp.checked) inp.click();
  };
  pick('model', a.dataset.configModel);
  pick('species', a.dataset.configSpecies);
});

/** Sin WebGL: el formulario sigue calculando precio y armando el mensaje. */
function initStaticConfigurator() {
  import('./ui/static-config.js').then((m) => m.initStaticConfig());
}

// --------------------------------------------------------------- arranque --
document.fonts.ready.then(() => {
  initReveals({ gsap, ScrollTrigger, SplitText, reduced });
  initMarquee({ gsap, ScrollTrigger, reduced });
  initCollection({ gsap, ScrollTrigger, reduced });
  // los triggers se crearon en distinto orden que en la página: ordenarlos antes de medir
  ScrollTrigger.sort();
  ScrollTrigger.refresh();
});

loader.finish(reduced ? 300 : 1700).then(() => {
  heroIntro();
  ScrollTrigger.sort();
  ScrollTrigger.refresh();
});

function heroIntro() {
  hero?.intro();
  if (reduced) return;
  const lines = document.querySelectorAll('[data-hero-line]');
  lines.forEach((line) => {
    const split = SplitText.create(line, { type: 'chars', mask: 'chars' });
    gsap.from(split.chars, { yPercent: 110, duration: 1.3, ease: 'expo.out', stagger: 0.035, delay: 0.1 });
  });
  gsap.from('[data-hero-fade]', { y: 24, autoAlpha: 0, duration: 1.1, ease: 'expo.out', stagger: 0.08, delay: 0.55 });
  gsap.from('.nav', { yPercent: -100, duration: 1.1, ease: 'expo.out', delay: 0.4 });
}

// refresco tras cargar imágenes (cambian alturas)
window.addEventListener('load', () => ScrollTrigger.refresh());
