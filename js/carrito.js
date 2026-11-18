/**
 * carrito.js — Pantalla "Mi carrito" (tienda/carrito.html).
 *
 * API (repo Inventario, docs/api/contrato-tienda.md):
 *   GET    /api/tienda/carrito                     el carrito con sus ítems y el total
 *   PUT    /api/tienda/carrito/items/{producto}    cambiar la cantidad
 *   DELETE /api/tienda/carrito/items/{producto}    quitar
 *   POST   /api/tienda/carrito/confirmar           "Ir a pagar": crea la compra y aparta el stock
 * Los cambios devuelven el carrito actualizado: la tabla se vuelve a dibujar con esa respuesta.
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { POLITICA, avisarCarrito, irAPagar, precio, textoDeError } from './tienda.js';

const $estado = document.getElementById('estado');
const $error = document.getElementById('error');
const $vacio = document.getElementById('vacio');
const $contenido = document.getElementById('contenido-carrito');
const $filas = document.getElementById('filas');
const $total = document.getElementById('total');
const $acepto = document.getElementById('acepto');
const $motivo = document.getElementById('motivo-bloqueo');
const $irAPagar = document.getElementById('ir-a-pagar');

document.getElementById('politica').textContent = POLITICA;

// Lo que impide pagar ahora (un producto que ya no está a la venta o sin stock suficiente), o ''.
let bloqueo = '';

// Sin sesión de comprador, a login (y el módulo se corta acá). Además trae el token CSRF que piden
// los cambios del carrito.
await exigirRol(['CLIENTE', 'RESCATISTA']);
cargar();

async function cargar() {
  try {
    dibujar(await api('/api/tienda/carrito'));
  } catch (error) {
    $estado.textContent = '';
    mostrarError(textoDeError(error));
  }
}

function dibujar(carrito) {
  const items = carrito.items ?? [];
  $estado.textContent = '';
  $vacio.hidden = items.length > 0;
  $contenido.hidden = items.length === 0;
  avisarCarrito(carrito);

  $filas.replaceChildren(...items.map(crearFila));
  $total.textContent = precio(carrito.total ?? 0);

  const noALaVenta = items.filter((item) => !item.a_la_venta);
  const sinStock = items.filter((item) => item.a_la_venta && item.cantidad > item.stock);
  bloqueo = noALaVenta.length > 0
    ? 'Quitá los productos que ya no están a la venta para poder pagar.'
    : sinStock.length > 0 ? 'Bajá la cantidad de los productos sin stock suficiente para poder pagar.' : '';
  actualizarBoton();
}

function crearFila(item) {
  const fila = el('tr');

  const producto = el('td');
  producto.append(el('a', item.nombre, { href: '/catalogo/producto.html?id=' + encodeURIComponent(item.producto_id) }));
  if (!item.a_la_venta) {
    producto.append(el('span', 'Ya no está a la venta: quitalo para seguir.', { class: 'nota-item nota-error' }));
  } else if (item.cantidad > item.stock) {
    producto.append(el('span', item.stock === 0 ? 'Sin stock.' : `Solo quedan ${item.stock}.`, { class: 'nota-item nota-error' }));
  }

  // Cantidad: se guarda al cambiarla (al salir del campo o con las flechas).
  const cantidad = el('input', '', {
    type: 'number', min: '1', max: '99', value: String(item.cantidad), inputmode: 'numeric',
    class: 'input-cantidad', 'aria-label': `Cantidad de ${item.nombre}`,
  });
  cantidad.disabled = !item.a_la_venta;
  cantidad.addEventListener('change', () => cambiarCantidad(item, cantidad));
  const celdaCantidad = el('td');
  celdaCantidad.append(cantidad);

  const quitar = el('button', 'Quitar', { type: 'button', class: 'boton boton-borde boton-chico', 'aria-label': `Quitar ${item.nombre} del carrito` });
  quitar.addEventListener('click', () => quitarItem(item, quitar));
  const celdaQuitar = el('td');
  celdaQuitar.append(quitar);

  fila.append(producto, el('td', precio(item.precio_unitario)), celdaCantidad, el('td', precio(item.subtotal)), celdaQuitar);
  return fila;
}

async function cambiarCantidad(item, input) {
  const nueva = Number(input.value);
  if (!Number.isInteger(nueva) || nueva < 1 || nueva > 99) {
    mostrarError(`La cantidad de ${item.nombre} tiene que ser un número entero entre 1 y 99.`);
    input.value = String(item.cantidad);
    return;
  }
  await cambiar(() => api('/api/tienda/carrito/items/' + item.producto_id, { metodo: 'PUT', cuerpo: { cantidad: nueva } }), item.nombre);
}

async function quitarItem(item, boton) {
  boton.disabled = true;
  await cambiar(() => api('/api/tienda/carrito/items/' + item.producto_id, { metodo: 'DELETE' }), item.nombre);
}

// Hace el cambio y vuelve a dibujar el carrito. Si falla, muestra el motivo y recarga el carrito
// (así la tabla siempre muestra lo que de verdad está guardado).
async function cambiar(pedido, nombre) {
  mostrarError('');
  try {
    dibujar(await pedido());
  } catch (error) {
    mostrarError(textoDeError(error, nombre));
    cargar();
  }
}

function actualizarBoton() {
  $motivo.textContent = bloqueo;
  $motivo.hidden = bloqueo === '';
  $irAPagar.disabled = !$acepto.checked || bloqueo !== '';
}

$acepto.addEventListener('change', actualizarBoton);

// "Ir a pagar": crea la compra (aparta el stock por 15 minutos) y lleva directo a Mercado Pago.
// Si no se puede ir a pagar, lleva a la compra: ahí corre el tiempo y está el botón para reintentar.
$irAPagar.addEventListener('click', async () => {
  mostrarError('');
  $irAPagar.disabled = true;
  try {
    const compra = await api('/api/tienda/carrito/confirmar', { metodo: 'POST' });
    try {
      await irAPagar(compra.numero);
    } catch {
      location.href = '/tienda/compra.html?numero=' + encodeURIComponent(compra.numero) + '&pago=no_disponible';
    }
  } catch (error) {
    const faltantes = error?.datos?.items;
    if (error?.estado === 409 && Array.isArray(faltantes)) {
      // Otro comprador se llevó el stock mientras tanto: se dice de qué productos.
      mostrarError('No alcanza el stock de: ' + faltantes
        .map((f) => `${f.nombre} (pediste ${f.pedido}, ${f.stock === 0 ? 'no queda ninguno' : `quedan ${f.stock}`})`)
        .join('; ') + '.');
    } else {
      mostrarError(textoDeError(error));
    }
    cargar();
  }
});

function mostrarError(texto) {
  $error.textContent = texto;
  $error.hidden = texto === '';
}
