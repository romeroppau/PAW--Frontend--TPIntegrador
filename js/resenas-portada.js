/**
 * resenas-portada.js — "¿Qué opinan nuestros clientes?" de la portada (index.html): las 3 reseñas
 * más nuevas de 4 o 5 estrellas (GET /api/resenas?minimo=4, público), en las burbujas.
 * Todas, en "Ver todas las reseñas" (resenas/resenas.html).
 */
import { api } from './api.js';
import { el } from './ui.js';
import { estrellas } from './estrellas.js';

const $burbujas = document.getElementById('burbujas');
const $estado = document.getElementById('estado-opiniones');

try {
  const { datos = [] } = await api('/api/resenas?minimo=4');
  $burbujas.replaceChildren(...datos.map((resena) => {
    const burbuja = el('blockquote', '', { class: 'burbuja' });
    burbuja.append(estrellas(resena.estrellas), el('p', resena.texto), el('footer', resena.autor));
    return burbuja;
  }));
  $estado.textContent = datos.length === 0 ? 'Todavía no hay reseñas. ¡Contanos cómo te atendimos!' : '';
} catch {
  $estado.textContent = 'No se pudieron cargar las opiniones.';
}
