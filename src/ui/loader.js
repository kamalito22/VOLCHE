/**
 * Preloader: contador 000→100 que sigue el progreso real (fuentes, 3D del
 * hero) con un mínimo de tiempo para que la entrada respire.
 */
export function createLoader(gsap) {
  const root = document.querySelector('[data-loader]');
  const count = root?.querySelector('[data-loader-count]');
  const bar = root?.querySelector('[data-loader-bar]');
  const tasks = [];
  const state = { shown: 0, target: 0 };
  let done = 0;

  const render = () => {
    if (!root) return;
    const v = Math.round(state.shown);
    count.textContent = String(v).padStart(3, '0');
    bar.style.transform = `scaleX(${state.shown / 100})`;
  };

  const bump = () => {
    state.target = tasks.length ? (done / tasks.length) * 100 : 100;
    gsap.to(state, { shown: state.target, duration: 0.9, ease: 'power2.out', onUpdate: render, overwrite: true });
  };

  return {
    track(promise) {
      tasks.push(promise);
      Promise.resolve(promise)
        .catch(() => {})
        .finally(() => {
          done++;
          bump();
        });
      return promise;
    },
    async finish(minMs = 1500) {
      const t0 = performance.now();
      await Promise.allSettled(tasks);
      const wait = Math.max(0, minMs - (performance.now() - t0));
      await new Promise((r) => setTimeout(r, wait));
      await new Promise((r) => gsap.to(state, { shown: 100, duration: 0.5, ease: 'power2.inOut', onUpdate: render, onComplete: r, overwrite: true }));
      if (!root) return;
      const tl = gsap.timeline();
      tl.to(root.querySelectorAll('.loader__brand span'), { yPercent: -110, duration: 0.7, stagger: 0.04, ease: 'power3.in' })
        .to(root.querySelector('.loader__meta'), { autoAlpha: 0, duration: 0.3 }, '<')
        .to(root, { clipPath: 'inset(0 0 100% 0)', duration: 1.05, ease: 'expo.inOut' }, '-=0.25')
        .set(root, { display: 'none' });
      document.body.classList.remove('is-loading');
      return tl;
    },
  };
}
