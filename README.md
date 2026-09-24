# VOLCHE — Taller de madera

Sitio de una sola página para vender repisas y muebles de madera maciza. Está pensado
para verse como un sitio premiado, no como una plantilla:

- **Tablón 3D en el hero**: madera procedural en tiempo real. Se arrastra para girar
  (con inercia) y al cambiar de especie (pino, encino, parota, nogal) un barrido de
  luz transforma la veta.
- **El proceso en 3D con scroll**: tablón en bruto, corte a medida (el sobrante cae),
  cepillado, lijado con polvo, barrido de aceite, vista explotada del soporte oculto
  con etiquetas, y la repisa montada con decoración.
- **Configurador 3D**: modelo (flotante, ménsula, toallero), madera, acabado
  (natural, tostado, ceniza), largo, fondo, grosor y cantidad. Muestra cotas como
  una ficha técnica, tiene una vista explotada ("Ver herraje") y calcula el precio
  al instante. El pedido se arma solo y se envía por WhatsApp.
- **Fotos de producto fotorrealistas** hechas en Blender (Cycles) para este
  proyecto, así que no son fotos de stock ni ilustraciones. Hay cuatro fotos de
  ambiente, cuatro macros de madera, una de tablones y un _flat lay_ del kit de
  instalación.
- Scroll suave, textos que se revelan, marquesina que reacciona a la velocidad,
  colección con scroll horizontal, acordeón de maderas, cursor personalizado y
  botones magnéticos. También respeta `prefers-reduced-motion`.

## Empezar

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # genera dist/
npm run preview  # sirve dist/ para probar
```

## Publicar en Vercel

1. En Vercel, **Add New → Project**, importa este repositorio.
2. Vercel detecta **Vite**. El build es `npm run build` y la salida `dist`
   (ya está en `vercel.json`).
3. **Deploy**.

`vercel.json` también define la caché: `/assets/*` es inmutable (los nombres llevan
hash) y `/img/*` se guarda 7 días.

## Lo que tienes que editar

Todo está en **`src/config.js`**:

| Qué | Dónde |
| --- | --- |
| Número de WhatsApp (con código de país, sin `+`) | `BRAND.whatsapp` |
| Instagram y correo (el footer los muestra solo si existen) | `BRAND.instagram`, `BRAND.email` |
| Precios: base por modelo, tarifa por madera (MXN/cm³) y factor de acabado | `PRICING` |
| Fondos y grosores permitidos por modelo | `MODELS` |
| Textos de cada madera | `WOOD_INFO` |

> Si `BRAND.whatsapp` está vacío, los botones abren WhatsApp con el mensaje listo
> para que el cliente elija el contacto. **Pon tu número antes de publicar.**

Los precios "desde" de la colección se calculan con la misma fórmula del
configurador, así que basta con cambiar `PRICING`.

Los textos del sitio (hero, manifiesto, pasos, preguntas frecuentes) están en
`index.html`. Tiempos, envíos y carga máxima son supuestos razonables para el
prototipo: **revísalos** y ajústalos a tu operación real.

## Cómo está hecho

```
index.html                 contenido (HTML semántico, en español)
src/main.js                arranque: preloader, escenas 3D diferidas, eventos
src/config.js              negocio: contacto, precios, modelos
src/data/woods.json        parámetros de cada especie (compartido con Python)
src/styles/main.css        sistema visual (ébano, hueso, latón, musgo)
src/ui/*                   scroll suave, cursor, nav, revelados, colección…
src/three/wood/*           shader GLSL de madera + WoodMaterial (three.js)
src/three/hero.js          tablón del hero
src/three/process.js       historia del proceso (scroll)
src/three/configurator.js  configurador 3D
src/three/hardware.js      soporte oculto, ménsulas, barra de latón, pijas, taquetes
tools/wood/wood.py         la misma madera procedural en numpy (para hornear texturas)
tools/render/*             escenas de Blender y exportación a WebP
public/img/*               fotos (WebP en 3 tamaños para srcset)
```

**Madera procedural sólida.** La veta no es una foto pegada. Se simula un tronco
real: anillos de crecimiento alrededor de una médula un poco inclinada, fibras,
poros (el encino con anillo poroso y el nogal y la parota con poro difuso), albura
y nudos que deforman los anillos a su alrededor. Al cortar ese tronco con las caras
de la tabla aparece la veta catedral en la cara, rayas en el canto y anillos en la
testa. El algoritmo existe dos veces: en `tools/wood/wood.py` (numpy, para Blender)
y en `src/three/wood/woodGLSL.js` (GLSL, para el navegador), con el mismo hash y el
mismo ruido. Los colores de cada especie viven en `src/data/woods.json`.

**Rendimiento.** three.js se carga en paralelo al preloader. El proceso y el
configurador se cargan solo cuando te acercas a ellos. Cada escena deja de
renderizar fuera de pantalla o con la pestaña oculta, el configurador solo
renderiza cuando algo cambia, y si el dispositivo se atora baja el _pixel ratio_
automáticamente. Sin WebGL2, el configurador sigue calculando precio y mensaje.

## Regenerar las fotos (opcional)

Las fotos se generan con código, sin modelar nada a mano. Necesitas Python 3.11:

```bash
python3.11 -m venv .venv && . .venv/bin/activate
pip install bpy==5.0.1 numpy pillow

# vista previa rápida (baja resolución)
python tools/render/scenes.py hero --preview --out tools/render/out
# final
for s in hero flotante mensula toallero tablones macro_pino macro_encino macro_parota macro_nogal kit; do
  python tools/render/scenes.py $s --out tools/render/out
done
python tools/render/export_web.py tools/render/out
```

Cada escena está en `tools/render/scenes.py`: muros de cal, luz de ventana con
sombras de hojas, libros, cerámica, eucalipto, pilea, velas y toallas. Si cambias un
color en `woods.json`, cambia tanto en las fotos como en el 3D del sitio.

## Créditos

- 3D: [three.js](https://threejs.org). Animación: [GSAP](https://gsap.com) con
  ScrollTrigger y SplitText. Scroll suave: [Lenis](https://lenis.darkroom.engineering).
- Tipografías (licencia OFL, empaquetadas con Fontsource): Instrument Serif,
  Inter Tight y JetBrains Mono.
- Fotos: renders originales de este proyecto (Blender 5 / Cycles).
