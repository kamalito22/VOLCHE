import Lenis from 'lenis';

/** Scroll suave (Lenis) sincronizado con GSAP ScrollTrigger. */
export function initSmooth(gsap, ScrollTrigger, reduced) {
  let lenis = null;
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.095, smoothWheel: true, wheelMultiplier: 0.95, touchMultiplier: 1.4 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  const scrollTo = (target, opts = {}) => {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { duration: 1.6, ...opts });
    else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
  };

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.hasAttribute('data-wa')) return;
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const el = document.querySelector(id);
    if (!el) return;
    e.preventDefault();
    scrollTo(el);
    try {
      history.replaceState(null, '', id);
    } catch {
      /* marcos restringidos no permiten cambiar la URL */
    }
  });

  return { lenis, scrollTo };
}
