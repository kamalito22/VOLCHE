/** Marquesina infinita que acelera y cambia de sentido con el scroll. */
export function initMarquee({ gsap, ScrollTrigger, reduced }) {
  const track = document.querySelector('[data-marquee]');
  if (!track) return;
  const row = track.querySelector('.marquee__row');
  // clones suficientes para cubrir 2× el ancho de pantalla
  const need = Math.ceil((window.innerWidth * 2) / Math.max(1, row.offsetWidth)) + 1;
  for (let i = 0; i < need; i++) track.appendChild(row.cloneNode(true));
  if (reduced) return;
  let x = 0;
  let dir = -1;
  let boost = 0;
  const w = () => row.offsetWidth;
  ScrollTrigger.create({
    trigger: track,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate: (self) => {
      const v = self.getVelocity();
      dir = v > 0 ? -1 : v < 0 ? 1 : dir;
      boost = Math.min(10, Math.abs(v) / 180);
    },
  });
  gsap.ticker.add((_, dt) => {
    boost *= 0.92;
    x += dir * (0.045 + boost * 0.06) * dt;
    const W = w();
    if (x <= -W) x += W;
    if (x > 0) x -= W;
    track.style.transform = `translate3d(${x}px,0,0)`;
  });
}
