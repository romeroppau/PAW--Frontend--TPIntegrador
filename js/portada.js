/**
 * portada.js — "¡No te lo pierdas!" de la portada (index.html) y del panel del cliente
 * (paneles/panel-cliente.html, la portada de quien entró).
 *
 * Dos bloques, cada uno con su subtítulo:
 *   - Productos en descuento: los productos en promoción de la tienda (GET /api/tienda/promociones),
 *     hasta 3, con un enlace a todas las promociones si hay más.
 *   - Turnos en descuento: las franjas que la veterinaria promocionó desde Reportes
 *     (GET /api/pacientes/promociones-turnos, js/precio-turno.js).
 * Un bloque sin datos no se muestra; si no hay ninguno (o la API no responde), tampoco la sección:
 * la portada no tiene que mostrar tarjetas vacías. Todo texto que viene de la API se inserta con el().
 */
import { api } from './api.js';
import { el } from './ui.js';
import { textoCategoria } from './etiquetas.js';
import { bloquePrecio } from './tienda.js';
import { pintarTurnosConDescuento } from './precio-turno.js';

const CANTIDAD = 3;
const seccion = document.getElementById('seccion-destacados');
const bloqueProductos = document.getElementById('productos-descuento');
const bloqueTurnos = document.getElementById('promo-turnos');

function tarjeta(producto) {
  const articulo = el('article', '', { class: 'tarjeta producto-destacado' });
  articulo.append(
    el('p', textoCategoria(producto.categoria), { class: 'etiqueta' }),
    el('h4', producto.nombre),
    bloquePrecio(producto),
    el('a', 'Ver detalle', {
      class: 'boton boton-borde',
      href: '/catalogo/producto.html?id=' + encodeURIComponent(producto.id),
      'aria-label': 'Ver detalle de ' + producto.nombre
    })
  );
  return articulo;
}

async function productosEnDescuento() {
  try {
    const { datos = [] } = await api('/api/tienda/promociones');
    document.getElementById('destacados').replaceChildren(...datos.slice(0, CANTIDAD).map(tarjeta));
    document.getElementById('ver-promociones').hidden = datos.length <= CANTIDAD;
    bloqueProductos.hidden = datos.length === 0;
  } catch {
    bloqueProductos.hidden = true;
  }
}

await Promise.all([
  productosEnDescuento(),
  pintarTurnosConDescuento(bloqueTurnos, document.getElementById('lista-promo-turnos')),
]);
seccion.hidden = bloqueProductos.hidden && bloqueTurnos.hidden;
