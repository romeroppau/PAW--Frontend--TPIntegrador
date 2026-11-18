/**
 * ventas.js — "Ventas de la tienda" de la veterinaria (panel/ventas.html).
 *
 * API (repo Inventario, docs/api/contrato-tienda.md):
 *   GET  /api/inventario/compras?estado=PAGADA&buscar=101   pedidos de una pestaña
 *   POST /api/tienda/compras/{numero}/entregada             el comprador retiró el pedido
 *
 * Pestañas: Para retirar (PAGADA, del que vence antes al que vence después), Entregados y
 * Cancelados (los más recientes primero). El buscador busca dentro de la pestaña elegida.
 */
import { api, debounce } from './api.js';
import { exigirRol } from './auth.js';
import { confirmar, el } from './ui.js';
import { diaConNombre, fechaHora, hoyArgentina, precio, textoDeError } from './tienda.js';

const PESTANIAS = {
  PAGADA: {
    titulo: 'Pedidos para retirar',
    columnas: ['Pedido', 'Fecha', 'Comprador', 'Productos', 'Total', 'Fecha límite de retiro', 'Acción'],
    vacio: 'No hay pedidos para retirar.',
  },
  ENTREGADA: {
    titulo: 'Pedidos entregados',
    columnas: ['Pedido', 'Fecha', 'Comprador', 'Productos', 'Total', 'Entregado'],
    vacio: 'Todavía no hay pedidos entregados.',
  },
  CANCELADA: {
    titulo: 'Pedidos cancelados',
    columnas: ['Pedido', 'Fecha', 'Comprador', 'Productos', 'Total'],
    vacio: 'No hay pedidos cancelados.',
  },
};

const $buscar = document.getElementById('buscar');
const $pestanias = [...document.querySelectorAll('[role="tab"]')];
const $panel = document.getElementById('panel-ventas');
const $estado = document.getElementById('estado');
const $aviso = document.getElementById('aviso');
const $tabla = document.getElementById('tabla');
const $tituloTabla = document.getElementById('titulo-tabla');
const $encabezados = document.getElementById('encabezados');
const $filas = document.getElementById('filas');

let estadoActual = 'PAGADA';
let pedidoActual = 0;   // si llegan dos respuestas, solo se dibuja la del último pedido

await exigirRol('VETERINARIO');
cargar();

async function cargar() {
  const id = ++pedidoActual;
  const buscar = $buscar.value.trim();
  const q = new URLSearchParams({ estado: estadoActual });
  if (buscar) q.set('buscar', buscar);
  $estado.textContent = 'Cargando pedidos…';

  try {
    const { datos: pedidos = [] } = await api('/api/inventario/compras?' + q.toString());
    if (id !== pedidoActual) return;
    dibujar(pedidos, buscar);
  } catch (error) {
    if (id !== pedidoActual) return;
    $tabla.hidden = true;
    $estado.textContent = textoDeError(error);
  }
}

function dibujar(pedidos, buscar) {
  const pestania = PESTANIAS[estadoActual];
  $tituloTabla.textContent = pestania.titulo;
  $encabezados.replaceChildren(...pestania.columnas.map((texto) => el('th', texto, { scope: 'col' })));
  $filas.replaceChildren(...pedidos.map(crearFila));
  $tabla.hidden = pedidos.length === 0;
  $estado.textContent = pedidos.length > 0 ? ''
    : buscar ? `No encontramos pedidos con "${buscar}" en esta pestaña.` : pestania.vacio;
}

function crearFila(pedido) {
  const fila = el('tr');
  const productos = el('td');
  const lista = el('ul', '', { class: 'lista-items' });
  for (const item of pedido.items ?? []) lista.append(el('li', `${item.nombre} × ${item.cantidad}`));
  productos.append(lista);

  fila.append(
    el('th', pedido.numero, { scope: 'row' }),
    el('td', fechaHora(pedido.fecha)),
    el('td', pedido.comprador),
    productos,
    el('td', precio(pedido.total)),
  );

  if (estadoActual === 'PAGADA') {
    const hoy = pedido.retirar_hasta === hoyArgentina();
    fila.append(el('td', diaConNombre(pedido.retirar_hasta) + (hoy ? ' (hoy es el último día)' : ''), hoy ? { class: 'ultimo-dia' } : {}));
    const accion = el('td');
    const boton = el('button', 'Marcar como entregado', { type: 'button', class: 'boton boton-chico', 'aria-label': `Marcar el pedido ${pedido.numero} como entregado` });
    boton.addEventListener('click', () => marcarEntregado(pedido, boton));
    accion.append(boton);
    fila.append(accion);
  } else if (estadoActual === 'ENTREGADA') {
    fila.append(el('td', `${fechaHora(pedido.entregada_en)}, por ${pedido.entregada_por ?? '—'}`));
  }
  return fila;
}

async function marcarEntregado(pedido, boton) {
  const seguro = await confirmar(`¿Confirmás que ${pedido.comprador} retiró el pedido ${pedido.numero}?`, { aceptar: 'Sí, lo retiró' });
  if (!seguro) return;

  boton.disabled = true;
  try {
    await api(`/api/tienda/compras/${encodeURIComponent(pedido.numero)}/entregada`, { metodo: 'POST' });
    // La fila se queda donde está, con "Entregado" en lugar del botón: así se ve qué pedido se acaba
    // de marcar. Al cambiar de pestaña, buscar o recargar, ya aparece en "Entregados".
    boton.replaceWith(el('span', 'Entregado', { class: 'estado-compra estado-entregada' }));
    mostrarAviso(`El pedido ${pedido.numero} quedó como entregado.`, true);
  } catch (error) {
    mostrarAviso(error?.estado === 409
      ? `El pedido ${pedido.numero} ya no está para retirar: se entregó o venció el plazo de retiro.`
      : textoDeError(error), false);
    cargar();
  }
}

function mostrarAviso(texto, ok) {
  $aviso.textContent = texto;
  $aviso.className = 'mensaje ' + (ok ? 'mensaje-ok' : 'mensaje-error');
  $aviso.hidden = false;
}

// ---------- Pestañas (con flechas izquierda y derecha, como pide el patrón de pestañas accesibles) ----------

function elegir(pestania) {
  estadoActual = pestania.dataset.estado;
  for (const p of $pestanias) {
    const elegida = p === pestania;
    p.setAttribute('aria-selected', String(elegida));
    p.tabIndex = elegida ? 0 : -1;
  }
  $panel.setAttribute('aria-labelledby', pestania.id);
  $aviso.hidden = true;
  cargar();
}

for (const [i, pestania] of $pestanias.entries()) {
  pestania.addEventListener('click', () => elegir(pestania));
  pestania.addEventListener('keydown', (evento) => {
    const paso = { ArrowRight: 1, ArrowLeft: -1 }[evento.key];
    if (!paso) return;
    const siguiente = $pestanias[(i + paso + $pestanias.length) % $pestanias.length];
    siguiente.focus();
    elegir(siguiente);
  });
}

$buscar.addEventListener('input', debounce(cargar, 300));
