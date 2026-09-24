/**
 * Configuración del negocio. Todo lo que cambia seguido vive aquí.
 *
 * ⚠️  Antes de publicar:
 *   - WHATSAPP: número con código de país, sin + ni espacios (ej. "5213312345678").
 *     Si se deja vacío, los botones abren WhatsApp para elegir contacto.
 *   - Precios: son de referencia; ajústalos a tus costos reales.
 */
export const BRAND = {
  name: 'VOLCHE',
  tagline: 'Taller de madera',
  whatsapp: '',
  instagram: '', // usuario sin @, ej. "volche.mx"
  email: '', // ej. "hola@volche.mx"
  city: 'Hecho a mano en México',
};

/** Precio = (base del modelo + volumen cm³ × tarifa de la madera) × acabado, redondeado. */
export const PRICING = {
  currency: 'MXN',
  base: { flotante: 330, mensula: 260, toallero: 480 },
  woodRate: { pino: 0.058, encino: 0.11, parota: 0.13, nogal: 0.19 },
  finish: { natural: 1, tostado: 1.08, ceniza: 1.08 },
  roundTo: 10,
};

export const MODELS = {
  flotante: {
    label: 'Flotante',
    long: 'Repisa flotante',
    hardware: 'Soporte oculto de acero',
    depths: [15, 20, 25, 30],
    thicknesses: [3.8, 5],
  },
  mensula: {
    label: 'Ménsula',
    long: 'Repisa con ménsulas',
    hardware: 'Ménsulas de acero negro mate',
    depths: [15, 20, 25, 30],
    thicknesses: [2.5, 3.8, 5],
  },
  toallero: {
    label: 'Toallero',
    long: 'Repisa toallero',
    hardware: 'Respaldo de 6 cm + barra de latón',
    depths: [15, 20],
    thicknesses: [2.5, 3.8],
  },
};

export const WOOD_INFO = {
  pino: {
    latin: 'Pinus spp.',
    tone: 'Miel claro',
    hardness: 2,
    character: 'Nudos y veta marcada',
    ideal: 'Repisas ligeras, estilo nórdico',
    blurb: 'Claro y cálido, con nudos que cuentan su historia. Ligero, noble y el más accesible.',
  },
  encino: {
    latin: 'Quercus spp.',
    tone: 'Dorado',
    hardness: 4,
    character: 'Poro abierto, muy resistente',
    ideal: 'Cocina, libreros, uso rudo',
    blurb: 'El roble mexicano: duro, estable y con un poro que se siente al tacto. Para toda la vida.',
  },
  parota: {
    latin: 'Enterolobium cyclocarpum',
    tone: 'Café miel',
    hardness: 3,
    character: 'Flamas amplias y reflejos dorados',
    ideal: 'Piezas protagonistas',
    blurb: 'La madera icónica de México. Vetas amplias, tonos miel y un brillo dorado bajo la luz.',
  },
  nogal: {
    latin: 'Juglans spp.',
    tone: 'Chocolate profundo',
    hardness: 3,
    character: 'Figura ondulada, fina',
    ideal: 'Salas y estudios elegantes',
    blurb: 'Oscuro, sobrio y elegante. Su figura ondulada gana profundidad con cada año.',
  },
};

export function priceFor({ model, species, finish, length, depth, thickness, qty = 1 }) {
  const P = PRICING;
  let vol = length * depth * thickness;
  if (model === 'toallero') vol += length * 2 * 6; // respaldo
  const unit = (P.base[model] + vol * P.woodRate[species]) * P.finish[finish];
  const rounded = Math.round(unit / P.roundTo) * P.roundTo;
  return { unit: rounded, total: rounded * qty };
}

export function formatMXN(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n);
}

export function whatsappLink(text) {
  const num = BRAND.whatsapp.replace(/\D/g, '');
  const base = num ? `https://wa.me/${num}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(text)}`;
}

/** Enlace que reabre el configurador con un diseño concreto. */
export function designLink(st) {
  const q = new URLSearchParams({
    m: st.model,
    s: st.species,
    f: st.finish,
    l: String(st.length),
    d: String(st.depth),
    t: String(st.thickness),
    q: String(st.qty),
  });
  return `${location.origin}${location.pathname}?${q}#disena`;
}

/** Aplica al formulario un diseño recibido por URL. Devuelve true si había uno. */
export function applyDesignFromURL(form) {
  const q = new URLSearchParams(location.search);
  if (!q.has('m')) return false;
  const pick = (name, v) => {
    const inp = v && form.querySelector(`input[name="${name}"][value="${CSS.escape(v)}"]`);
    if (inp) inp.checked = true;
  };
  pick('model', q.get('m'));
  pick('species', q.get('s'));
  pick('finish', q.get('f'));
  pick('depth', q.get('d'));
  pick('thickness', q.get('t'));
  const l = +q.get('l');
  if (l >= 40 && l <= 150) form.querySelector('input[name="length"]').value = String(Math.round(l / 5) * 5);
  const n = +q.get('q');
  if (n >= 1 && n <= 20) form.querySelector('input[name="qty"]').value = String(n);
  return true;
}
