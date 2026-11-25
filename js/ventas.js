/**
 * ventas.js — "Ventas de la tienda" de la veterinaria (panel/ventas.html).
 *
 * API (repo Inventario, docs/api/contrato-tienda.md):
 *   GET  /api/inventario/compras?estado=PAGADA&buscar=101&vence=hoy&desde=&hasta=&pagina=1
 *   GET  /api/inventario/compras/resumen                    { para_retirar, vencen_hoy }
 *   POST /api/tienda/compras/{numero}/entregada             el comprador retiró el pedido
 *
 * Pestañas:
 *   - Para retirar (PAGADA): arranca con el buscador listo para escribir y sin la lista (cuando
 *     alguien viene a retirar, se lo busca). Muestra cuántos vencen hoy ("Ver cuáles") y "Ver todos".
 *   - Entregados y Cancelados (historial): los últimos 30 días, con filtro Desde / Hasta.
 * El buscador busca dentro de la pestaña elegida. Las listas vienen de a 20 ("Ver más").
 */
import { api, debounce } from './api.js';
import { exigirRol } from './auth.js';
import { confirmar, el } from './ui.js';
import { limitarAHoy } from './rango-fechas.js';
import { TEXTO_MOTIVO, textoDelReintegro, diaConNombre, fecha, fechaHora, hoyArgentina, leerFechas, precio, textoDeError } from './tienda.js';

const PESTANIAS = {
  PAGADA: {
    titulo: 'Pedidos para retirar',
    columnas: ['Pedido', 'Fecha', 'Comprador', 'Productos', 'Total', 'Fecha límite de retiro', 'Acción'],
  },
  ENTREGADA: {
    titulo: 'Pedidos entregados',
    columnas: ['Pedido', 'Fecha', 'Comprador', 'Productos', 'Total', 'Entregado'],
    ninguno: 'entregados',
  },
  CANCELADA: {
    titulo: 'Pedidos cancelados',
    columnas: ['Pedido', 'Fecha', 'Comprador', 'Productos', 'Total', 'Motivo'],
    ninguno: 'cancelados',
  },
};

const $buscar = document.getElementById('buscar');
const $pestanias = [...document.querySelectorAll('[role="tab"]')];
const $panel = document.getElementById('panel-ventas');
const $resumen = document.getElementById('resumen-retirar');
const $vencenHoy = document.getElementById('vencen-hoy');
const $textoVencenHoy = document.getElementById('texto-vencen-hoy');
const $ningunoHoy = document.getElementById('ninguno-hoy');
const $verHoy = document.getElementById('ver-hoy');
const $verTodos = document.getElementById('ver-todos');
const $filtro = document.getElementById('filtro');
const $desde = document.getElementById('desde');
const $hasta = document.getElementById('hasta');
limitarAHoy($desde, $hasta);   // historial: nada posterior a hoy
const $estado = document.getElementById('estado');
const $aviso = document.getElementById('aviso');
const $tabla = document.getElementById('tabla');
const $tituloTabla = document.getElementById('titulo-tabla');
const $encabezados = document.getElementById('encabezados');
const $filas = document.getElementById('filas');
const $verMas = document.getElementById('ver-mas');

let estadoActual = 'PAGADA';
let modoRetirar = 'inicio';   // Para retirar sin buscar: 'inicio' (sin lista), 'hoy' o 'todos'
let filtro = {};              // fechas del historial ({} = últimos 30 días)
let pagina = 1;
let pedidoActual = 0;         // si llegan dos respuestas, solo se dibuja la del último pedido

await exigirRol('VETERINARIO');
$buscar.focus();
cargar();

// ---------- Cargar y dibujar ----------

async function cargar(siguiente = false) {
  const id = ++pedidoActual;
  const buscar = $buscar.value.trim();
  const historial = estadoActual !== 'PAGADA';

  $resumen.hidden = historial || buscar !== '';
  $filtro.hidden = !historial;
  if (!historial && !buscar) cargarResumen();

  // Para retirar, al entrar: solo el buscador y el resumen, sin la lista.
  if (!historial && !buscar && modoRetirar === 'inicio') {
    $tabla.hidden = true;
    $verMas.hidden = true;
    $estado.textContent = '';
    return;
  }

  const paginaPedida = siguiente ? pagina + 1 : 1;
  const q = new URLSearchParams({ estado: estadoActual, pagina: String(paginaPedida) });
  if (buscar) q.set('buscar', buscar);
  if (!historial && !buscar && modoRetirar === 'hoy') q.set('vence', 'hoy');
  if (historial && filtro.desde) q.set('desde', filtro.desde);
  if (historial && filtro.hasta) q.set('hasta', filtro.hasta);
  $verMas.disabled = true;
  if (!siguiente) $estado.textContent = 'Cargando pedidos…';

  try {
    const respuesta = await api('/api/inventario/compras?' + q.toString());
    if (id !== pedidoActual) return;
    pagina = paginaPedida;
    dibujar(respuesta, buscar, siguiente);
  } catch (error) {
    if (id !== pedidoActual) return;
    if (!siguiente) $tabla.hidden = true;
    $estado.textContent = textoDeError(error);
  } finally {
    $verMas.disabled = false;
  }
}

function dibujar({ datos: pedidos = [], hay_mas: hayMas, desde, hasta }, buscar, agregar) {
  const pestania = PESTANIAS[estadoActual];
  if (estadoActual !== 'PAGADA') {
    $desde.value = desde ?? '';
    $hasta.value = hasta ?? '';
  }

  $tituloTabla.textContent = pestania.titulo;
  $encabezados.replaceChildren(...pestania.columnas.map((texto) => el('th', texto, { scope: 'col' })));
  const filas = pedidos.map(crearFila);
  if (agregar) $filas.append(...filas); else $filas.replaceChildren(...filas);

  const hayAlguno = $filas.children.length > 0;
  $tabla.hidden = !hayAlguno;
  $verMas.hidden = !hayMas;
  $estado.textContent = hayAlguno ? '' : textoVacio(buscar, desde, hasta);
}

function textoVacio(buscar, desde, hasta) {
  if (buscar) return `No encontramos pedidos con "${buscar}" en esta pestaña.`;
  if (estadoActual === 'PAGADA') return modoRetirar === 'hoy' ? 'Hoy no vence ningún pedido.' : 'No hay pedidos para retirar.';
  const ninguno = PESTANIAS[estadoActual].ninguno;
  return filtro.desde || filtro.hasta
    ? `No hay pedidos ${ninguno} entre el ${fecha(desde)} y el ${fecha(hasta)}.`
    : `No hubo pedidos ${ninguno} en los últimos 30 días.`;
}

// Cuántos pedidos hay para retirar y cuántos vencen hoy (sin traer la lista).
async function cargarResumen() {
  try {
    const { para_retirar: total = 0, vencen_hoy: hoy = 0 } = await api('/api/inventario/compras/resumen');
    $vencenHoy.hidden = hoy === 0;
    $textoVencenHoy.textContent = hoy === 1
      ? 'Hoy es el último día para retirar 1 pedido.'
      : `Hoy es el último día para retirar ${hoy} pedidos.`;
    $ningunoHoy.hidden = hoy > 0;
    $ningunoHoy.textContent = total === 0 ? 'No hay pedidos para retirar.' : 'Hoy no vence ningún pedido.';
    $verTodos.hidden = total === 0;
    $verTodos.textContent = `Ver todos los pedidos para retirar (${total})`;
  } catch {
    // Sin el resumen, igual se puede buscar o ver todos.
    $vencenHoy.hidden = true;
    $ningunoHoy.hidden = true;
  }
}

function crearFila(pedido) {
  const fila = el('tr');
  const productos = el('td');
  const lista = el('ul', '', { class: 'lista-items' });
  for (const item of pedido.items ?? []) lista.append(el('li', `${item.nombre} × ${item.cantidad}`));
  productos.append(lista);

  // El número de pedido y, si se pagó, el enlace a la factura.
  const numero = el('th', pedido.numero, { scope: 'row' });
  if (pedido.tiene_factura) {
    numero.append(el('a', 'Ver factura', {
      class: 'enlace-factura',
      href: '/tienda/factura.html?numero=' + encodeURIComponent(pedido.numero),
      'aria-label': `Ver la factura del pedido ${pedido.numero}`,
    }));
  }

  fila.append(
    numero,
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
  } else {
    const reintegro = textoDelReintegro(pedido.reintegro);
    const pendiente = pedido.reintegro?.estado === 'PENDIENTE' ? ', en proceso' : '';
    fila.append(el('td', (TEXTO_MOTIVO[pedido.motivo_cancelacion] ?? '—') + (reintegro ? ` · reintegro de ${reintegro}${pendiente}` : '')));
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
    if (!$resumen.hidden) cargarResumen();
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

// ---------- Para retirar: vencen hoy / todos ----------

function verPedidos(modo) {
  modoRetirar = modo;
  $verHoy.setAttribute('aria-pressed', String(modo === 'hoy'));
  $verTodos.setAttribute('aria-pressed', String(modo === 'todos'));
  $aviso.hidden = true;
  cargar();
}

$verHoy.addEventListener('click', () => verPedidos('hoy'));
$verTodos.addEventListener('click', () => verPedidos('todos'));

// ---------- Historial: filtro por fechas ----------

$filtro.addEventListener('submit', (evento) => {
  evento.preventDefault();
  const fechas = leerFechas($desde, $hasta);
  if (typeof fechas === 'string') {
    $estado.textContent = fechas;
    return;
  }
  filtro = fechas;
  cargar();
});

document.getElementById('ultimos-30').addEventListener('click', () => {
  filtro = {};
  cargar();
});

$verMas.addEventListener('click', () => cargar(true));

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
  // Cada pestaña arranca como la primera vez: Para retirar sin la lista; el historial, últimos 30 días.
  filtro = {};
  verPedidos('inicio');
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

$buscar.addEventListener('input', debounce(() => cargar(), 300));
