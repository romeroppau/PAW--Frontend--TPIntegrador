/**
 * carrito.js — Pantalla "Mi carrito" (tienda/carrito.html).
 *
 * API (repo Inventario, docs/api/contrato-tienda.md):
 *   GET    /api/tienda/carrito                     el carrito con sus ítems y el total
 *   PUT    /api/tienda/carrito/items/{producto}    cambiar la cantidad
 *   DELETE /api/tienda/carrito/items/{producto}    quitar
 *   POST   /api/tienda/carrito/confirmar           "Ir a pagar": crea la compra y aparta el stock
 *   GET    /api/tienda/productos/{id}/imagen       la foto de cada producto (si tiene)
 * Los cambios devuelven el carrito actualizado: la lista se vuelve a dibujar con esa respuesta.
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { avisarCarrito, diaConNombre, irAPagar, precio, textoDeError, unidades, politica } from './tienda.js';

const $estado = document.getElementById('estado');
const $error = document.getElementById('error');
const $vacio = document.getElementById('vacio');
const $contenido = document.getElementById('contenido-carrito');
const $filas = document.getElementById('filas');
const $total = document.getElementById('total');
const $unidades = document.getElementById('unidades');
const $minutos = document.getElementById('minutos');
const $retirarHasta = document.getElementById('retirar-hasta');
const $acepto = document.getElementById('acepto');
const $motivo = document.getElementById('motivo-bloqueo');
const $irAPagar = document.getElementById('ir-a-pagar');

const $politica = document.getElementById('politica');
$politica.textContent = politica();

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
  const cuantos = unidades(carrito);
  $unidades.textContent = cuantos === 1 ? '1 producto' : `${cuantos} productos`;
  // Los plazos los manda el servidor: los minutos para pagar y, si compra hoy, el último día para retirar.
  if (Number.isInteger(carrito.minutos_para_pagar)) $minutos.textContent = `${carrito.minutos_para_pagar} minutos`;
  if (carrito.retirar_hasta_si_compra_hoy) $retirarHasta.textContent = diaConNombre(carrito.retirar_hasta_si_compra_hoy);
  if (Number.isInteger(carrito.dias_habiles_para_retirar)) $politica.textContent = politica(carrito.dias_habiles_para_retirar);

  const noALaVenta = items.filter((item) => !item.a_la_venta);
  const sinStock = items.filter((item) => item.a_la_venta && item.cantidad > item.stock);
  bloqueo = noALaVenta.length > 0
    ? 'Quitá los productos que ya no están a la venta para poder pagar.'
    : sinStock.length > 0 ? 'Bajá la cantidad de los productos sin stock suficiente para poder pagar.' : '';
  actualizarBoton();
}

// Tachito de "Quitar" (SVG decorativo: el nombre del botón lo da aria-label).
const TACHITO = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const HUELLA = '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g fill="currentColor"><ellipse cx="14" cy="27" rx="7" ry="9"/><ellipse cx="29" cy="15" rx="7" ry="10"/><ellipse cx="45" cy="15" rx="7" ry="10"/><ellipse cx="57" cy="29" rx="6" ry="9"/><path d="M32 31c-9 0-18 9-18 17 0 6 5 9 11 8 3-.6 5-1.5 7-1.5s4 .9 7 1.5c6 1 11-2 11-8 0-8-9-17-18-17z"/></g></svg>';

// Un producto del carrito: foto | nombre y precio por unidad | − cantidad + | subtotal | tachito.
function crearFila(item) {
  const fila = el('li', '', { class: 'item-carrito' });
  const enlace = '/catalogo/producto.html?id=' + encodeURIComponent(item.producto_id);

  // Foto: la <img> se crea solo si el producto tiene foto (un <img> sin src no es HTML válido).
  const foto = el('a', '', { href: enlace, class: 'item-foto', tabindex: '-1', 'aria-hidden': 'true' });
  if (item.tiene_imagen) {
    const imagen = el('img', '', { src: `/api/tienda/productos/${encodeURIComponent(item.producto_id)}/imagen`, alt: '', loading: 'lazy', width: '72', height: '72' });
    imagen.addEventListener('error', () => { foto.innerHTML = HUELLA; }, { once: true });
    foto.append(imagen);
  } else {
    foto.innerHTML = HUELLA;
  }

  const datos = el('div', '', { class: 'item-datos' });
  datos.append(el('a', item.nombre, { href: enlace, class: 'item-nombre' }), el('span', `${precio(item.precio_unitario)} c/u`, { class: 'item-unitario' }));
  if (!item.a_la_venta) {
    datos.append(el('span', 'Ya no está a la venta: quitalo para seguir.', { class: 'nota-item nota-error' }));
  } else if (item.cantidad > item.stock) {
    datos.append(el('span', item.stock === 0 ? 'Sin stock.' : `Solo quedan ${item.stock}.`, { class: 'nota-item nota-error' }));
  }

  // Cantidad: − y + cambian de a uno; el número también se puede escribir (se guarda al salir del campo).
  const selector = el('div', '', { class: 'selector-cantidad' });
  const menos = el('button', '−', { type: 'button', 'aria-label': `Restar uno de ${item.nombre}` });
  const mas = el('button', '+', { type: 'button', 'aria-label': `Sumar uno de ${item.nombre}` });
  const cantidad = el('input', '', {
    type: 'number', min: '1', max: '99', value: String(item.cantidad), inputmode: 'numeric',
    class: 'input-cantidad', 'aria-label': `Cantidad de ${item.nombre}`,
  });
  const bloqueado = !item.a_la_venta;
  cantidad.disabled = bloqueado;
  menos.disabled = bloqueado || item.cantidad <= 1;
  mas.disabled = bloqueado || item.cantidad >= Math.min(99, item.stock);
  menos.addEventListener('click', () => { cantidad.value = String(item.cantidad - 1); cambiarCantidad(item, cantidad, selector); });
  mas.addEventListener('click', () => { cantidad.value = String(item.cantidad + 1); cambiarCantidad(item, cantidad, selector); });
  cantidad.addEventListener('change', () => cambiarCantidad(item, cantidad, selector));
  selector.append(menos, cantidad, mas);

  const quitar = el('button', '', { type: 'button', class: 'boton-quitar', 'aria-label': `Quitar ${item.nombre} del carrito`, title: 'Quitar' });
  quitar.innerHTML = TACHITO;
  quitar.addEventListener('click', () => quitarItem(item, quitar));

  fila.append(foto, datos, selector, el('strong', precio(item.subtotal), { class: 'item-subtotal' }), quitar);
  return fila;
}

async function cambiarCantidad(item, input, selector) {
  const nueva = Number(input.value);
  if (!Number.isInteger(nueva) || nueva < 1 || nueva > 99) {
    mostrarError(`La cantidad de ${item.nombre} tiene que ser un número entero entre 1 y 99.`);
    input.value = String(item.cantidad);
    return;
  }
  // Mientras se guarda, el selector queda quieto: así dos toques rápidos no se pisan.
  selector?.querySelectorAll('button, input').forEach((control) => { control.disabled = true; });
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
