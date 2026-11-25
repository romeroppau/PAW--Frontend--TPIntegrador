/**
 * compras.js — Pantalla "Mis compras" (tienda/compras.html).
 *
 * API: GET /api/tienda/compras?desde=2026-10-22&hasta=2026-11-20&pagina=1
 * (repo Inventario, docs/api/contrato-tienda.md). Sin fechas, el servidor devuelve los últimos 30
 * días y dice qué fechas usó (así se completan Desde y Hasta). Vienen de a 20: "Ver más" pide la
 * página siguiente y la agrega abajo.
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { limitarAHoy } from './rango-fechas.js';
import { TEXTO_ESTADO, textoDelReintegro, diaConNombre, fecha, fechaHora, leerFechas, precio, textoDeError } from './tienda.js';

const $filtro = document.getElementById('filtro');
const $desde = document.getElementById('desde');
const $hasta = document.getElementById('hasta');
limitarAHoy($desde, $hasta);   // historial: nada posterior a hoy
const $estado = document.getElementById('estado');
const $vacio = document.getElementById('vacio');
const $textoVacio = document.getElementById('texto-vacio');
const $tabla = document.getElementById('tabla');
const $filas = document.getElementById('filas');
const $verMas = document.getElementById('ver-mas');

let filtro = {};      // las fechas que se pidieron ({} = últimos 30 días)
let pagina = 1;
let pedidoActual = 0; // si llegan dos respuestas, solo se dibuja la del último pedido

await exigirRol(['CLIENTE', 'RESCATISTA']);
cargar();

async function cargar(siguiente = false) {
  const id = ++pedidoActual;
  const paginaPedida = siguiente ? pagina + 1 : 1;
  const q = new URLSearchParams({ pagina: String(paginaPedida) });
  if (filtro.desde) q.set('desde', filtro.desde);
  if (filtro.hasta) q.set('hasta', filtro.hasta);
  $verMas.disabled = true;
  if (!siguiente) $estado.textContent = 'Cargando tus compras…';

  try {
    const respuesta = await api('/api/tienda/compras?' + q.toString());
    if (id !== pedidoActual) return;
    pagina = paginaPedida;
    dibujar(respuesta, siguiente);
  } catch (error) {
    if (id !== pedidoActual) return;
    $estado.textContent = textoDeError(error);
  } finally {
    $verMas.disabled = false;
  }
}

function dibujar({ datos: compras = [], hay_mas: hayMas, desde, hasta }, agregar) {
  // Las fechas que usó el servidor quedan en el filtro (la primera vez, los últimos 30 días).
  $desde.value = desde ?? '';
  $hasta.value = hasta ?? '';

  const filas = compras.map(crearFila);
  if (agregar) $filas.append(...filas); else $filas.replaceChildren(...filas);

  const hayAlguna = $filas.children.length > 0;
  $estado.textContent = '';
  $tabla.hidden = !hayAlguna;
  $vacio.hidden = hayAlguna;
  $textoVacio.textContent = filtro.desde || filtro.hasta
    ? `No hay compras entre el ${fecha(desde)} y el ${fecha(hasta)}.`
    : 'No hiciste compras en los últimos 30 días.';
  $verMas.hidden = !hayMas;
}

function crearFila(compra) {
  const fila = el('tr');
  const numero = el('td', '', { class: 'numero-pedido' });
  numero.append(el('a', compra.numero, { href: '/tienda/compra.html?numero=' + encodeURIComponent(compra.numero) }));
  const estado = el('td');
  estado.append(el('span', TEXTO_ESTADO[compra.estado] ?? compra.estado, { class: 'estado-compra estado-' + compra.estado.toLowerCase() }));
  fila.append(
    numero,
    el('td', fechaHora(compra.fecha)),
    el('td', precio(compra.total)),
    estado,
    el('td', plazo(compra)),
  );
  return fila;
}

// Lo que tiene que hacer el comprador y hasta cuándo.
function plazo(compra) {
  if (compra.estado === 'PENDIENTE_PAGO' && compra.pagar_antes_de) {
    return `Pagá antes de las ${compra.pagar_antes_de.slice(11, 16)}`;
  }
  if (compra.estado === 'PAGADA' && compra.retirar_hasta) {
    return `Retirala hasta el ${diaConNombre(compra.retirar_hasta)}`;
  }
  if (compra.estado === 'CANCELADA') {
    const reintegro = textoDelReintegro(compra.reintegro);
    if (compra.motivo_cancelacion === 'COMPRADOR' && reintegro) return `La cancelaste · reintegro de ${reintegro}`;
    return { COMPRADOR: 'La cancelaste', SIN_PAGO: 'No se pagó a tiempo', VENCIDA: 'Venció el plazo de retiro' }[compra.motivo_cancelacion] ?? '';
  }
  return '';
}

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
