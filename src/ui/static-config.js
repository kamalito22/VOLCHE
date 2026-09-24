import { BRAND, designLink, formatMXN, MODELS, priceFor, whatsappLink } from '../config.js';
import { toast } from './contact.js';

/** Configurador sin 3D (navegadores sin WebGL2): precio y mensaje. */
export function initStaticConfig() {
  const form = document.querySelector('[data-config-form]');
  if (!form) return;
  const price = document.querySelector('[data-price]');
  const wa = document.querySelector('[data-config-wa]');
  const out = form.querySelector('[data-length-out]');
  const viewer = document.querySelector('.config__viewer');
  viewer.style.background = 'url(/img/flotante-1000.webp) center/cover';
  const read = () => {
    const v = (n) => form.querySelector(`input[name="${n}"]:checked`)?.value;
    return {
      model: v('model'),
      species: v('species'),
      finish: v('finish'),
      length: +form.querySelector('input[name="length"]').value,
      depth: +v('depth'),
      thickness: +v('thickness'),
      qty: +form.querySelector('input[name="qty"]').value || 1,
    };
  };
  const msg = (s) =>
    `Hola ${BRAND.name} 👋 Quiero cotizar: ${MODELS[s.model].long}, ${s.species}, acabado ${s.finish}, ${s.length} × ${s.depth} × ${s.thickness} cm, cantidad ${s.qty}. Mi diseño: ${designLink(s)}`;
  const refresh = () => {
    const s = read();
    price.textContent = formatMXN(priceFor(s).total);
    out.textContent = `${s.length} cm`;
    wa.href = whatsappLink(msg(s));
    wa.target = '_blank';
  };
  form.addEventListener('input', refresh);
  form.querySelectorAll('[data-qty]').forEach((b) =>
    b.addEventListener('click', () => {
      const q = form.querySelector('input[name="qty"]');
      q.value = Math.max(1, Math.min(20, +q.value + +b.dataset.qty));
      refresh();
    }),
  );
  document.querySelector('[data-config-copy]')?.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(msg(read()));
    toast('Especificaciones copiadas ✓');
  });
  refresh();
}
