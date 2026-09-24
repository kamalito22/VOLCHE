/** Navegación: se oculta al bajar, cambia de tema según la sección, menú móvil. */
export function initNav({ gsap, ScrollTrigger, smooth }) {
  const nav = document.querySelector('[data-nav]');
  const burger = document.querySelector('[data-burger]');
  const menu = document.querySelector('[data-menu]');
  if (!nav) return;

  let lastY = window.scrollY;
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate: (self) => {
      const y = self.scroll();
      nav.classList.toggle('is-scrolled', y > 24);
      const goingDown = y > lastY + 2;
      const goingUp = y < lastY - 2;
      if (goingDown && y > 280 && !menu.classList.contains('is-open')) nav.classList.add('is-hidden');
      else if (goingUp) nav.classList.remove('is-hidden');
      lastY = y;
    },
  });

  // tema claro/oscuro y enlace activo: se lee qué hay realmente bajo la barra
  // (robusto frente a secciones fijadas con pin)
  const links = [...nav.querySelectorAll('.nav__links a')];
  const byId = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  const sectionAt = (x, y) => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (nav.contains(el) || el.closest('.menu, .cursor, .grain, .wa-float')) continue;
      return el.closest('[data-theme]');
    }
    return null;
  };
  let raf = 0;
  const sync = () => {
    raf = 0;
    const x = window.innerWidth / 2;
    const sec = sectionAt(x, nav.offsetHeight / 2);
    if (sec) nav.classList.toggle('is-light', sec.dataset.theme === 'light');
    const mid = sectionAt(x, window.innerHeight / 2);
    const id = mid?.closest('section[id]')?.id;
    links.forEach((a) => a.classList.toggle('is-current', byId.get(id) === a));
  };
  const queue = () => {
    if (!raf) raf = requestAnimationFrame(sync);
  };
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('resize', queue);
  ScrollTrigger.addEventListener('refresh', queue);
  queue();

  const setMenu = (open) => {
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
    nav.classList.remove('is-hidden');
    if (open) {
      smooth.lenis?.stop();
      gsap.fromTo(
        menu.querySelectorAll('.menu__links a'),
        { yPercent: 60, autoAlpha: 0 },
        { yPercent: 0, autoAlpha: 1, stagger: 0.06, duration: 0.9, ease: 'expo.out', delay: 0.25 },
      );
    } else smooth.lenis?.start();
  };
  burger?.addEventListener('click', () => setMenu(!menu.classList.contains('is-open')));
  menu?.addEventListener('click', (e) => {
    if (e.target.closest('a')) setMenu(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) setMenu(false);
  });
}
