/** Revelados de texto, imágenes, parallax y contadores. */
export function initReveals({ gsap, ScrollTrigger, SplitText, reduced }) {
  // --- títulos: líneas que suben desde una máscara
  document.querySelectorAll('[data-split]').forEach((el) => {
    if (reduced) return;
    const split = SplitText.create(el, { type: 'lines', mask: 'lines', linesClass: 'line' });
    gsap.from(split.lines, {
      yPercent: 110,
      duration: 1.2,
      ease: 'expo.out',
      stagger: 0.08,
      scrollTrigger: { trigger: el, start: 'top 86%' },
    });
  });

  // --- manifiesto: las palabras se encienden al avanzar
  document.querySelectorAll('[data-words]').forEach((el) => {
    const split = SplitText.create(el, { type: 'words', wordsClass: 'w' });
    if (reduced) return;
    gsap.to(split.words, {
      opacity: 1,
      stagger: 0.08,
      ease: 'none',
      scrollTrigger: { trigger: el, start: 'top 78%', end: 'bottom 42%', scrub: true },
    });
  });

  // --- imágenes: cortina + zoom
  document.querySelectorAll('[data-reveal-img]').forEach((fig) => {
    if (reduced) return;
    const media = fig.querySelector('.media');
    const img = fig.querySelector('img');
    gsap.fromTo(
      media,
      { clipPath: 'inset(18% 12% 18% 12% round 18px)' },
      {
        clipPath: 'inset(0% 0% 0% 0% round 18px)',
        ease: 'none',
        scrollTrigger: { trigger: fig, start: 'top 92%', end: 'top 30%', scrub: true },
      },
    );
    gsap.fromTo(img, { scale: 1.35 }, { scale: 1.14, ease: 'none', scrollTrigger: { trigger: fig, start: 'top 92%', end: 'top 30%', scrub: true } });
  });

  // --- parallax suave
  document.querySelectorAll('[data-parallax]').forEach((img) => {
    if (reduced) return;
    gsap.fromTo(
      img,
      { yPercent: -6 },
      { yPercent: 6, ease: 'none', scrollTrigger: { trigger: img.closest('section, figure') || img, start: 'top bottom', end: 'bottom top', scrub: true } },
    );
  });

  // --- entradas genéricas
  document.querySelectorAll('[data-reveal]').forEach((el, i) => {
    if (reduced) return;
    gsap.from(el, {
      y: 40,
      autoAlpha: 0,
      duration: 1.1,
      ease: 'expo.out',
      delay: (i % 4) * 0.08,
      scrollTrigger: { trigger: el, start: 'top 88%' },
    });
  });

  // --- contadores
  document.querySelectorAll('[data-count]').forEach((el) => {
    const to = +el.dataset.count;
    if (reduced) return;
    const o = { v: 0 };
    el.textContent = '0';
    gsap.to(o, {
      v: to,
      duration: 1.8,
      ease: 'power3.out',
      onUpdate: () => (el.textContent = Math.round(o.v)),
      scrollTrigger: { trigger: el, start: 'top 90%' },
    });
  });

  // --- sello giratorio: gira solo y acelera con el scroll
  const seal = document.querySelector('[data-seal] svg');
  if (seal && !reduced) {
    const spin = gsap.to(seal, { rotation: 360, duration: 26, ease: 'none', repeat: -1, transformOrigin: '50% 50%' });
    ScrollTrigger.create({
      trigger: seal,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        const v = self.getVelocity();
        spin.timeScale(1 + Math.min(8, Math.abs(v) / 250) * Math.sign(v || 1));
        gsap.to(spin, { timeScale: 1, duration: 1.2, overwrite: true, delay: 0.1 });
      },
    });
  }

  // --- CTA final: el título se abre
  const cta = document.querySelector('.cta');
  if (cta && !reduced) {
    gsap.from(cta.querySelectorAll('.cta__sub, .cta .btn'), {
      y: 30,
      autoAlpha: 0,
      stagger: 0.1,
      duration: 1,
      ease: 'expo.out',
      scrollTrigger: { trigger: cta, start: 'top 60%' },
    });
  }

  // --- palabra gigante del footer
  const word = document.querySelector('.footer__word');
  if (word && !reduced) {
    gsap.fromTo(
      word,
      { yPercent: 40, backgroundPosition: '50% 20%' },
      { yPercent: 0, backgroundPosition: '50% 80%', ease: 'none', scrollTrigger: { trigger: '.footer', start: 'top bottom', end: 'bottom bottom', scrub: true } },
    );
  }
}
