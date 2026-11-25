/**
 * promociones-tienda.js — Tienda → Promociones (catalogo/promociones.html), 24/11.
 *
 * Solo los productos que la veterinaria publicitó desde sus reportes, con el precio de siempre
 * tachado, el porcentaje, el rebajado y hasta cuándo. API: GET /api/tienda/promociones (Inventario).
 * Las tarjetas son las mismas del catálogo (js/tarjeta-producto.js).
 */
import { api } from './api.js';
import { crearTarjeta } from './tarjeta-producto.js';

const $estado = document.getElementById('estado');
const $lista = document.getElementById('lista');

try {
  const { datos = [] } = await api('/api/tienda/promociones');
  $lista.replaceChildren(...datos.map(crearTarjeta));
  $estado.textContent = datos.length ? '' : 'No hay promociones por el momento.';
  document.getElementById('ir-catalogo').hidden = datos.length > 0;
} catch {
  $estado.textContent = 'No pudimos cargar las promociones. Probá de nuevo en un momento.';
}
