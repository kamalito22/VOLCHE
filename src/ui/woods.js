/** Acordeón de maderas (hover/foco en escritorio, toque en móvil). */
export function initWoods() {
  const list = document.querySelector('[data-woods]');
  if (!list) return;
  const items = [...list.querySelectorAll('[data-wood]')];
  const open = (el) => {
    items.forEach((it) => {
      const on = it === el;
      it.classList.toggle('is-open', on);
      it.querySelector('.wood__toggle')?.setAttribute('aria-expanded', String(on));
    });
  };
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let t;
  items.forEach((it, i) => {
    const name = it.querySelector('.wood__name');
    const info = it.querySelector('.wood__info');
    info.id ||= `wood-info-${i}`;
    // botón para teclado y lectores de pantalla (el panel entero responde al puntero)
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wood__toggle sr-only';
    btn.textContent = `Ver madera: ${name.textContent}`;
    btn.setAttribute('aria-controls', info.id);
    btn.setAttribute('aria-expanded', String(it.classList.contains('is-open')));
    it.prepend(btn);
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
  });
}
