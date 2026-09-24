import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Tabla en metros: largo en X, grosor en Y, fondo en Z (centrada).
 * Las medidas se dan en centímetros.
 */
export function boardGeometry(L, D, T, radius = 0.3, segments = 4) {
  const r = Math.max(0.02, Math.min(radius, T / 2 - 0.05, D / 2 - 0.05)) / 100;
  return new RoundedBoxGeometry(L / 100, T / 100, D / 100, segments, r);
}
