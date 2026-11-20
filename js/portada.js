/**
 * portada.js — Productos destacados de la portada (index.html)
 *
 * Muestra primero los productos en promoción (GET /api/tienda/promociones) y completa con los
 * primeros disponibles del catálogo. Si la API no responde o no hay productos, la sección se
 * oculta: la portada no tiene que mostrar tarjetas vacías.
 * Todo texto que viene de la API se inserta con el() (textContent).
 */
import { api } from './api.js';
import { el } from './ui.js';
import { textoCategoria } from './etiquetas.js';
import { bloquePrecio } from './tienda.js';

const CANTIDAD = 3;
const seccion = document.getElementById('seccion-destacados');

function tarjeta(producto) {
  const articulo = el('article', '', { class: 'tarjeta producto-destacado' });
  articulo.append(
    el('p', textoCategoria(producto.categoria), { class: 'etiqueta' }),
    el('h3', producto.nombre),
    bloquePrecio(producto),
    el('a', 'Ver detalle', {
      class: 'boton boton-borde',
      href: '/catalogo/producto.html?id=' + encodeURIComponent(producto.id),
      'aria-label': 'Ver detalle de ' + producto.nombre
    })
  );
  return articulo;
}

try {
  const [promociones, catalogo] = await Promise.all([
    api('/api/tienda/promociones').then((r) => r.datos ?? []).catch(() => []),
    api('/api/tienda/productos').then((r) => r.datos ?? []),
  ]);
  const enPromo = new Set(promociones.map((p) => p.id));
  const disponibles = [...promociones, ...catalogo.filter((p) => p.disponible && !enPromo.has(p.id))].slice(0, CANTIDAD);
  document.getElementById('destacados').replaceChildren(...disponibles.map(tarjeta));
  seccion.hidden = disponibles.length === 0;
} catch {
  seccion.hidden = true;
}
