import { BRAND, whatsappLink } from '../config.js';

/** Enlaces de contacto, botón flotante de WhatsApp, año del footer, toasts. */
export function initContact({ ScrollTrigger }) {
  document.querySelectorAll('[data-wa]').forEach((a) => {
    a.href = whatsappLink(a.dataset.wa);
    a.target = '_blank';
    a.rel = 'noopener';
  });
  const ig = document.querySelector('[data-instagram]');
  if (ig && BRAND.instagram) {
    ig.href = `https://instagram.com/${BRAND.instagram.replace('@', '')}`;
    ig.target = '_blank';
    ig.rel = 'noopener';
    ig.hidden = false;
  }
  const mail = document.querySelector('[data-email]');
  if (mail && BRAND.email) {
    mail.href = `mailto:${BRAND.email}`;
    mail.textContent = BRAND.email;
    mail.hidden = false;
  }
  const y = document.querySelector('[data-year]');
  if (y) y.textContent = new Date().getFullYear();

  const fab = document.querySelector('.wa-float');
  if (fab) {
    ScrollTrigger.create({
      trigger: '.hero',
      start: 'bottom 60%',
      onEnter: () => fab.classList.add('is-visible'),
      onLeaveBack: () => fab.classList.remove('is-visible'),
    });
    // donde ya hay un botón de WhatsApp propio, el flotante se esconde
    for (const sel of ['.panel__actions', '.cta']) {
      const el = document.querySelector(sel);
      if (!el) continue;
      ScrollTrigger.create({
        trigger: el,
        start: 'top bottom',
        end: 'bottom top',
        onToggle: (self) => fab.classList.toggle('is-muted', self.isActive),
      });
    }
  }
}

let toastEl;
let toastT;
export function toast(msg) {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.classList.add('is-on');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('is-on'), 2400);
}
