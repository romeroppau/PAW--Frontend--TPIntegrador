/**
 * portada.js — Productos destacados de la portada (index.html)
 *
 * Muestra los primeros productos disponibles del catálogo público. Si la API no responde o no hay
 * productos, la sección se oculta: la portada no tiene que mostrar tarjetas vacías.
 * Todo texto que viene de la API se inserta con el() (textContent).
 */
import { api } from './api.js';
import { el } from './ui.js';
import { textoCategoria } from './etiquetas.js';

const CANTIDAD = 3;
const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const seccion = document.getElementById('seccion-destacados');

function tarjeta(producto) {
  const articulo = el('article', '', { class: 'tarjeta producto-destacado' });
  articulo.append(
    el('p', textoCategoria(producto.categoria), { class: 'etiqueta' }),
    el('h3', producto.nombre),
    el('p', pesos.format(producto.precio), { class: 'precio' }),
    el('a', 'Ver detalle', {
      class: 'boton boton-borde',
      href: '/catalogo/producto.html?id=' + encodeURIComponent(producto.id),
      'aria-label': 'Ver detalle de ' + producto.nombre
    })
  );
  return articulo;
}

try {
  const { datos } = await api('/api/tienda/productos');
  const disponibles = datos.filter((p) => p.disponible).slice(0, CANTIDAD);
  document.getElementById('destacados').replaceChildren(...disponibles.map(tarjeta));
  seccion.hidden = disponibles.length === 0;
} catch {
  seccion.hidden = true;
}
