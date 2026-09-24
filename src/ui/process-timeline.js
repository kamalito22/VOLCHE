/**
 * Parte "ligera" (sin 3D): fija la sección, mueve la barra de progreso y
 * cambia los textos por etapa. Se crea de inmediato para que las posiciones
 * de scroll del resto de la página sean correctas.
 */
export function initProcessTimeline({ gsap, ScrollTrigger }) {
  const section = document.querySelector('#ensamble');
  const pin = section?.querySelector('[data-process]');
  if (!pin) return null;
  const steps = [...section.querySelectorAll('[data-step]')];
  const bar = section.querySelector('[data-process-bar]');
  const count = section.querySelector('[data-step-count]');
  const state = { progress: 0, step: 0 };
  const total = String(steps.length).padStart(2, '0');
  const setStep = (i) => {
    state.step = i;
    steps.forEach((s, k) => s.classList.toggle('is-active', k === i));
    count.textContent = `${String(i + 1).padStart(2, '0')} / ${total}`;
  };
  const bounds = [0.16, 0.33, 0.5, 0.66, 0.84];
  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: () => `+=${Math.round(window.innerHeight * 5.2)}`,
    pin,
    pinSpacing: true,
    anticipatePin: 1,
    refreshPriority: 1,
    onUpdate: (self) => {
      state.progress = self.progress;
      bar.style.transform = `scaleX(${self.progress})`;
      let i = 0;
      while (i < bounds.length && self.progress >= bounds[i]) i++;
      if (i !== state.step) setStep(i);
    },
  });
  void gsap;
  return { state };
}
