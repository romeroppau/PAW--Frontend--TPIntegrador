/**
 * estrellas.js — Las estrellas de las reseñas (la página "Reseñas", escribir una y la portada).
 */
import { el } from './ui.js';

/** "★★★★☆" con su texto para lectores de pantalla ("4 de 5 estrellas"). */
export function estrellas(cantidad, clase = 'estrellas') {
  const n = Math.max(0, Math.min(5, Math.round(Number(cantidad) || 0)));
  return el('span', '★'.repeat(n) + '☆'.repeat(5 - n), {
    class: clase,
    role: 'img',
    'aria-label': `${n} de 5 estrellas`,
  });
}

/** 4.4 -> "4,4" (con coma, como se escribe acá). */
export function promedioConComa(promedio) {
  return Number(promedio).toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
