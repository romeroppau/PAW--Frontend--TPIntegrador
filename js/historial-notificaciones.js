/**
 * historial-notificaciones.js — "Mis notificaciones" (cuenta/notificaciones.html).
 *
 * API (repo Backend, docs/api/contrato-notificaciones.md):
 *   GET  /api/notificaciones/historial?estado=SIN_LEER&desde=&hasta=&pagina=1
 *        → { datos, pagina, por_pagina, hay_mas, desde, hasta, no_leidas }
 *   POST /api/notificaciones/{id}/leida      marcar uno
 *   POST /api/notificaciones/leidas          marcar todos
 * Sin fechas, el servidor devuelve los últimos 30 días y dice qué fechas usó. Al marcar, se avisa a la
 * campana (evento "notificaciones-cambiaron") para que se actualice enseguida.
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { fecha, fechaHora, leerFechas, hoyArgentina } from './tienda.js';

const PANEL = {
  CLIENTE: '/paneles/panel-cliente.html',
  RESCATISTA: '/paneles/panel-rescatista.html',
  VETERINARIO: '/paneles/panel-administrador.html',
};
const NINGUNA = { TODAS: 'notificaciones', SIN_LEER: 'notificaciones sin leer', LEIDAS: 'notificaciones leídas' };

const $filtro = document.getElementById('filtro');
const $estadoFiltro = document.getElementById('estado-filtro');
const $desde = document.getElementById('desde');
const $hasta = document.getElementById('hasta');
const $estado = document.getElementById('estado');
const $lista = document.getElementById('lista');
const $verMas = document.getElementById('ver-mas');
const $resumen = document.getElementById('resumen-sin-leer');
const $textoSinLeer = document.getElementById('texto-sin-leer');
const $marcarTodas = document.getElementById('marcar-todas');

let fechas = {};        // las fechas pedidas ({} = últimos 30 días)
let pagina = 1;
let pedidoActual = 0;   // si llegan dos respuestas, solo se dibuja la del último pedido

const usuario = await exigirRol(['CLIENTE', 'RESCATISTA', 'VETERINARIO']);

// Las fechas llegan como mucho hasta hoy: no hay notificaciones del futuro (24/11).
const hoy = hoyArgentina();
$desde.max = hoy;
$hasta.max = hoy;
document.getElementById('volver').href = PANEL[usuario.rol] ?? '/index.html';
cargar();

async function cargar(siguiente = false) {
  const id = ++pedidoActual;
  const paginaPedida = siguiente ? pagina + 1 : 1;
  const q = new URLSearchParams({ estado: $estadoFiltro.value, pagina: String(paginaPedida) });
  if (fechas.desde) q.set('desde', fechas.desde);
  if (fechas.hasta) q.set('hasta', fechas.hasta);
  $verMas.disabled = true;
  if (!siguiente) $estado.textContent = 'Cargando tus notificaciones…';

  try {
    const respuesta = await api('/api/notificaciones/historial?' + q.toString());
    if (id !== pedidoActual) return;
    pagina = paginaPedida;
    dibujar(respuesta, siguiente);
  } catch {
    if (id !== pedidoActual) return;
    $estado.textContent = 'No se pudieron cargar tus notificaciones. Probá de nuevo en un momento.';
  } finally {
    $verMas.disabled = false;
  }
}

function dibujar({ datos: avisos = [], hay_mas: hayMas, desde, hasta, no_leidas: noLeidas = 0 }, agregar) {
  $desde.value = desde ?? '';
  $hasta.value = hasta ?? '';
  mostrarSinLeer(noLeidas);

  const items = avisos.map(item);
  if (agregar) $lista.append(...items); else $lista.replaceChildren(...items);
  $verMas.hidden = !hayMas;

  if ($lista.children.length > 0) {
    $estado.textContent = '';
  } else {
    const que = NINGUNA[$estadoFiltro.value];
    $estado.textContent = fechas.desde || fechas.hasta
      ? `No hay ${que} entre el ${fecha(desde)} y el ${fecha(hasta)}.`
      : `No tenés ${que} en los últimos 30 días.`;
  }
}

// Cuántas hay sin leer (en total, no solo en la página) y "Marcar todas como leídas".
function mostrarSinLeer(noLeidas) {
  $resumen.hidden = noLeidas === 0;
  $textoSinLeer.textContent = noLeidas === 1 ? 'Tenés 1 notificación sin leer.' : `Tenés ${noLeidas} notificaciones sin leer.`;
}

function item(aviso) {
  const li = el('li', '', { class: aviso.leida ? 'aviso' : 'aviso aviso-nuevo' });
  const texto = el('div');
  texto.append(el('p', aviso.mensaje), el('small', fechaHora(aviso.fecha) + (aviso.leida ? '' : ' · Sin leer')));
  li.append(texto);
  if (!aviso.leida) {
    const boton = el('button', 'Marcar como leída', { type: 'button', class: 'boton boton-borde boton-chico' });
    boton.addEventListener('click', () => marcarLeida(aviso, li, boton));
    li.append(boton);
  }
  return li;
}

async function marcarLeida(aviso, li, boton) {
  boton.disabled = true;
  try {
    await api(`/api/notificaciones/${aviso.id}/leida`, { metodo: 'POST' });
    // Se queda en la lista (como leída), salvo con el filtro "Sin leer", donde ya no corresponde.
    if ($estadoFiltro.value === 'SIN_LEER') {
      li.remove();
    } else {
      li.className = 'aviso';
      li.querySelector('small').textContent = fechaHora(aviso.fecha);
      boton.remove();
    }
    const quedan = Math.max(0, Number(($textoSinLeer.textContent.match(/\d+/) ?? ['0'])[0]) - 1);
    mostrarSinLeer(quedan);
    window.dispatchEvent(new Event('notificaciones-cambiaron'));
  } catch {
    boton.disabled = false;
  }
}

$marcarTodas.addEventListener('click', async () => {
  $marcarTodas.disabled = true;
  try {
    await api('/api/notificaciones/leidas', { metodo: 'POST' });
    window.dispatchEvent(new Event('notificaciones-cambiaron'));
    cargar();
  } finally {
    $marcarTodas.disabled = false;
  }
});

$filtro.addEventListener('submit', (evento) => {
  evento.preventDefault();
  const leidas = ($desde.value > hoy || $hasta.value > hoy)
    ? 'Las fechas pueden llegar como mucho hasta hoy.'
    : leerFechas($desde, $hasta);
  if (typeof leidas === 'string') {
    $estado.textContent = leidas;
    return;
  }
  fechas = leidas;
  cargar();
});

$estadoFiltro.addEventListener('change', () => cargar());

document.getElementById('ultimos-30').addEventListener('click', () => {
  fechas = {};
  cargar();
});

$verMas.addEventListener('click', () => cargar(true));
