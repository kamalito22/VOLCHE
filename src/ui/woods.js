/** Acordeón de maderas (hover/foco en escritorio, toque en móvil). */
export function initWoods() {
  const list = document.querySelector('[data-woods]');
  if (!list) return;
  const items = [...list.querySelectorAll('[data-wood]')];
  const open = (el) => {
    items.forEach((it) => {
      const on = it === el;
      it.classList.toggle('is-open', on);
      it.setAttribute('aria-expanded', String(on));
    });
  };
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let t;
  items.forEach((it) => {
    it.setAttribute('role', 'button');
    it.setAttribute('aria-expanded', String(it.classList.contains('is-open')));
    it.setAttribute('aria-label', `Madera: ${it.querySelector('.wood__name').textContent}`);
    if (fine) {
      it.addEventListener('pointerenter', () => {
        clearTimeout(t);
        t = setTimeout(() => open(it), 90);
      });
    }
    it.addEventListener('click', (e) => {
      if (e.target.closest('a')) return;
      open(it);
    });
    it.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open(it);
      }
    });
  });
}
