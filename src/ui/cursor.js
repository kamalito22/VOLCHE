/** Cursor personalizado: punto + anillo con etiqueta contextual. */
export function initCursor(gsap) {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const root = document.querySelector('.cursor');
  if (!root) return;
  const dot = root.querySelector('.cursor__dot');
  const ring = root.querySelector('.cursor__ring');
  const label = root.querySelector('[data-cursor-label]');
  gsap.set([dot, ring], { x: -100, y: -100 });
  const dx = gsap.quickTo(dot, 'x', { duration: 0.08, ease: 'power3' });
  const dy = gsap.quickTo(dot, 'y', { duration: 0.08, ease: 'power3' });
  const rx = gsap.quickTo(ring, 'x', { duration: 0.45, ease: 'power3' });
  const ry = gsap.quickTo(ring, 'y', { duration: 0.45, ease: 'power3' });

  window.addEventListener(
    'pointermove',
    (e) => {
      dx(e.clientX);
      dy(e.clientY);
      rx(e.clientX);
      ry(e.clientY);
      root.classList.remove('is-hidden');
    },
    { passive: true },
  );
  document.addEventListener('pointerleave', () => root.classList.add('is-hidden'));

  const interactive = 'a, button, summary, label, input, [data-magnetic], .wood';
  document.addEventListener('pointerover', (e) => {
    const withLabel = e.target.closest('[data-cursor]');
    if (withLabel) {
      label.textContent = withLabel.dataset.cursor;
      root.classList.add('has-label');
      root.classList.remove('is-link');
      return;
    }
    root.classList.remove('has-label');
    root.classList.toggle('is-link', !!e.target.closest(interactive));
  });
}
