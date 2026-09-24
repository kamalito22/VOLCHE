/** Colección: scroll horizontal fijado en escritorio, carrusel nativo en móvil. */
export function initCollection({ gsap, ScrollTrigger, reduced }) {
  const section = document.querySelector('.collection');
  const viewport = section?.querySelector('[data-hscroll]');
  const track = section?.querySelector('[data-hscroll-track]');
  const progress = section?.querySelector('[data-hscroll-progress]');
  if (!track) return;

  const mm = gsap.matchMedia();
  mm.add({ desk: '(min-width: 901px)', motionOK: '(prefers-reduced-motion: no-preference)' }, (ctx) => {
    const { desk, motionOK } = ctx.conditions;
    if (desk && motionOK && !reduced) {
      const dist = () => Math.max(0, track.scrollWidth - viewport.clientWidth);
      gsap.to(track, {
        x: () => -dist(),
        ease: 'none',
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => `+=${dist()}`,
          pin: true,
          scrub: 0.8,
          invalidateOnRefresh: true,
          anticipatePin: 1,
          refreshPriority: 2,
          onUpdate: (self) => progress?.style.setProperty('--p', self.progress.toFixed(4)),
        },
      });
      // leve inclinación de las tarjetas según velocidad
      const cards = track.querySelectorAll('[data-card]');
      const skew = gsap.quickTo(cards, 'skewX', { duration: 0.6, ease: 'power3' });
      ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        end: () => `+=${dist()}`,
        onUpdate: (self) => skew(gsap.utils.clamp(-4, 4, self.getVelocity() / -600)),
        onLeave: () => skew(0),
        onLeaveBack: () => skew(0),
      });
    } else {
      const onScroll = () => {
        const max = viewport.scrollWidth - viewport.clientWidth;
        progress?.style.setProperty('--p', max > 0 ? (viewport.scrollLeft / max).toFixed(4) : 0);
      };
      viewport.addEventListener('scroll', onScroll, { passive: true });
      return () => viewport.removeEventListener('scroll', onScroll);
    }
  });
}
