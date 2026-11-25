/**
 * productos-movimientos.js — Productos → Movimientos (panel/productos-movimientos.html), Entrega 5.
 *
 * Las entradas y salidas de stock de los productos, con filtro por producto (?producto=) y por fechas.
 * "Usado en una consulta" lleva a la consulta; "Venta", a la factura de la compra web.
 * API: GET /api/inventario/productos (el selector) y GET /api/inventario/productos/movimientos
 * (repo Inventario, docs/api/contrato.md). Lo común está en js/movimientos-inventario.js.
 */
import { exigirRol } from './auth.js';
import { pantallaMovimientos } from './movimientos-inventario.js';

await exigirRol('VETERINARIO');

const base = '/api/inventario/productos';
await pantallaMovimientos({
  urlItems: base,
  urlMovimientos: (producto, desde, hasta) => `${base}/movimientos?` + new URLSearchParams(
    Object.entries({ producto, desde, hasta }).filter(([, v]) => v)).toString(),
  campoItem: 'producto',
  parametroItem: 'producto',
  textoVacio: 'No hay movimientos de productos con ese filtro.',
});
