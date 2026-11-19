/**
 * reportes.js — Panel de reportes (panel/reportes.html)
 *
 * Tres pestañas (sugerencias, turnos atendidos, stock y movimientos) y, dentro de stock, tres
 * sub-pestañas. Cada una pide sus datos la primera vez que se abre. La pestaña activa viaja en el
 * hash de la URL (#turnos-atendidos, #stock-insumos), así los enlaces de los paneles caen en la correcta.
 * Contrato: docs/api/contrato-reportes.md del repo Reportes.
 * La guardia de rol es solo comodidad de interfaz; la autorización real la hace el backend.
 * Todo texto que viene de la API se inserta con textContent (el() lo hace).
 */

import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { textoEstadoInsumo } from './etiquetas.js';

await exigirRol('VETERINARIO');

const PAGINA = 25;       // filas que se muestran de a una vez
const STOCK_BAJO = 10;   // misma regla que el motor: 10 unidades o menos

const $ = (id) => document.getElementById(id);
const estado = $('estado');

const dinero = (v) => '$' + Number(v || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// "2026-11-28" -> "28/11/2026", sin pasar por Date para evitar corrimientos de zona horaria.
const fecha = (v) => String(v ?? '').split('-').reverse().join('/');
const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const haceDias = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return aISO(d); };

/* ------------------------------------------------------------------ */
/* Pestañas (patrón ARIA: flechas, Inicio y Fin mueven entre pestañas)  */
/* ------------------------------------------------------------------ */

// Devuelve una función que selecciona una pestaña por su data-vista.
function activarPestanas(lista, alCambiar) {
  const tabs = [...lista.querySelectorAll('[role="tab"]')];

  function seleccionar(tab, { foco = false } = {}) {
    for (const t of tabs) {
      const activa = t === tab;
      t.setAttribute('aria-selected', String(activa));
      t.tabIndex = activa ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !activa;
    }
    if (foco) tab.focus();
    alCambiar(tab.dataset.vista);
  }

  lista.addEventListener('click', (ev) => {
    const t = ev.target.closest('[role="tab"]');
    if (t) seleccionar(t);
  });

  lista.addEventListener('keydown', (ev) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let nueva = null;
    if (ev.key === 'ArrowRight') nueva = tabs[(i + 1) % tabs.length];
    else if (ev.key === 'ArrowLeft') nueva = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (ev.key === 'Home') nueva = tabs[0];
    else if (ev.key === 'End') nueva = tabs[tabs.length - 1];
    if (nueva) {
      ev.preventDefault();
      seleccionar(nueva, { foco: true });
    }
  });

  return (vista) => {
    const t = tabs.find((x) => x.dataset.vista === vista);
    if (t) seleccionar(t);
  };
}

/* ------------------------------------------------------------------ */
/* Tablas largas: de a 25 filas con "Mostrar más"                       */
/* ------------------------------------------------------------------ */

// Devuelve una función que recibe la lista completa y la dibuja desde el principio.
function listaPaginada(tbody, botonMas, contador, crearFila) {
  let items = [];
  let visibles = PAGINA;

  function pintar() {
    tbody.replaceChildren(...items.slice(0, visibles).map(crearFila));
    const resto = items.length - visibles;
    botonMas.hidden = resto <= 0;
    botonMas.textContent = `Mostrar ${Math.min(PAGINA, Math.max(resto, 0))} más`;
    contador.textContent = items.length
      ? `Mostrando ${Math.min(visibles, items.length)} de ${items.length}`
      : 'No hay resultados.';
  }

  botonMas.addEventListener('click', () => {
    visibles += PAGINA;
    pintar();
  });

  return (nuevos) => {
    items = nuevos;
    visibles = PAGINA;
    pintar();
  };
}

// Búsqueda por nombre y "solo stock bajo" sobre una lista que se vuelve a dibujar con cada cambio.
function conFiltros(buscar, soloBajo, obtenerTodos, pintar) {
  const aplicar = () => {
    const q = buscar.value.trim().toLowerCase();
    pintar(obtenerTodos().filter((x) =>
      (!q || String(x.nombre).toLowerCase().includes(q)) &&
      (!soloBajo.checked || Number(x.stock) <= STOCK_BAJO)
    ));
  };
  buscar.addEventListener('input', aplicar);
  soloBajo.addEventListener('change', aplicar);
  return aplicar;
}

/* ------------------------------------------------------------------ */
/* Filtro por fechas                                                    */
/* ------------------------------------------------------------------ */

// Arma "?desde=..&hasta=.."; devuelve null (y avisa) si el rango es inválido.
function consulta(form, errorId) {
  const error = $(errorId);
  const desde = form.elements.desde.value;
  const hasta = form.elements.hasta.value;
  error.hidden = true;
  if (desde && hasta && desde > hasta) {
    error.textContent = 'La fecha "Desde" no puede ser posterior a "Hasta".';
    error.hidden = false;
    return null;
  }
  const p = new URLSearchParams();
  if (desde) p.set('desde', desde);
  if (hasta) p.set('hasta', hasta);
  const texto = p.toString();
  return texto ? '?' + texto : '';
}

function mostrarError(errorId, e) {
  const error = $(errorId);
  error.textContent = e.estado === 400 ? 'Revisá las fechas del filtro.' : 'No se pudo cargar el reporte.';
  error.hidden = false;
}

/* ------------------------------------------------------------------ */
/* Sugerencias                                                          */
/* ------------------------------------------------------------------ */

async function cargarSugerencias() {
  estado.textContent = 'Cargando…';
  try {
    const datos = await api('/api/reportes/sugerencias');
    const promo = datos.que_promocionar ?? {};
    const sugerida = promo.franja_sugerida;

    $('texto-promocionar').textContent = sugerida?.sugerencia ?? 'Todavía no hay datos para sugerir.';
    $('filas-franjas').replaceChildren(...(promo.franjas ?? []).map((f) => filaFranja(f, sugerida)));

    const items = datos.que_liquidar ?? [];
    $('filas-liquidar').replaceChildren(...items.map(filaLiquidar));
    $('vacio-liquidar').hidden = items.length > 0;
    estado.textContent = '';
  } catch {
    estado.textContent = 'No se pudieron cargar las sugerencias.';
    cargadas.delete('sugerencias');   // al volver a la pestaña se reintenta
  }
}

function filaFranja(f, sugerida) {
  const esSugerida = sugerida && f.dia_semana === sugerida.dia_semana && f.franja === sugerida.franja;
  const tr = el('tr');
  tr.append(el('td', f.dia_semana), el('td', f.franja), el('td', f.cantidad_turnos), el('td', esSugerida ? 'Sugerida' : ''));
  return tr;
}

function filaLiquidar(p) {
  const tr = el('tr');
  tr.append(
    el('td', p.nombre),
    el('td', fecha(p.fecha_vencimiento)),
    el('td', p.dias_restantes),
    el('td', p.stock),
    el('td', dinero(p.precio)),
    el('td', p.descuento_sugerido + ' %'),
    el('td', dinero(p.precio_sugerido))
  );
  return tr;
}

/* ------------------------------------------------------------------ */
/* Turnos atendidos                                                     */
/* ------------------------------------------------------------------ */

const formTurnos = $('filtro-turnos');

function filaTurno(t) {
  const tr = el('tr');
  tr.append(
    el('td', fecha(t.fecha)),
    el('td', t.mascota_nombre),
    el('td', t.motivo),
    el('td', t.diagnostico || '—'),
    el('td', t.cantidad_insumos),
    el('td', t.cantidad_productos),
    el('td', t.factura_numero),
    el('td', dinero(t.total))
  );
  return tr;
}

const pintarTurnos = listaPaginada($('filas-turnos'), $('mas-turnos'), $('cont-turnos'), filaTurno);

async function cargarTurnos() {
  const q = consulta(formTurnos, 'error-turnos');
  if (q === null) return;
  try {
    const r = await api('/api/reportes/turnos-atendidos' + q);
    const turnos = (r.turnos ?? []).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    pintarTurnos(turnos);
    $('resumen-turnos').textContent =
      `${r.resumen?.cantidad_turnos ?? turnos.length} turnos · total facturado ${dinero(r.resumen?.total_facturado)}`;
  } catch (e) {
    mostrarError('error-turnos', e);
  }
}

formTurnos.addEventListener('submit', (ev) => { ev.preventDefault(); cargarTurnos(); });

/* ------------------------------------------------------------------ */
/* Stock y movimientos                                                  */
/* ------------------------------------------------------------------ */

const formMov = $('filtro-movimientos');
let productos = [];
let insumos = [];

function avisoStock(stock) {
  if (Number(stock) === 0) return 'Sin stock';
  return Number(stock) <= STOCK_BAJO ? 'Stock bajo' : '';
}

function filaProducto(p) {
  const tr = el('tr');
  tr.append(el('td', p.nombre), el('td', p.stock), el('td', p.fecha_vencimiento ? fecha(p.fecha_vencimiento) : '—'), el('td', avisoStock(p.stock)));
  return tr;
}

function filaInsumo(i) {
  const tr = el('tr');
  tr.append(el('td', i.nombre), el('td', textoEstadoInsumo(i.estado)), el('td', i.stock), el('td', avisoStock(i.stock)));
  return tr;
}

// El movimiento solo trae el id del ítem: el nombre se busca en las listas de stock.
function filaMovimiento(m) {
  const nombre = m.producto_id
    ? productos.find((p) => Number(p.id) === Number(m.producto_id))?.nombre ?? 'Producto ' + m.producto_id
    : insumos.find((i) => Number(i.id) === Number(m.insumo_id))?.nombre ?? 'Insumo ' + m.insumo_id;
  const f = String(m.fecha ?? '');
  const tr = el('tr');
  tr.append(
    el('td', fecha(f.slice(0, 10)) + ' ' + f.slice(11, 16)),
    el('td', m.tipo),
    el('td', m.motivo),
    el('td', nombre),
    el('td', m.cantidad)
  );
  return tr;
}

const pintarProductos = listaPaginada($('filas-stock-productos'), $('mas-productos'), $('cont-productos'), filaProducto);
const pintarInsumos = listaPaginada($('filas-stock-insumos'), $('mas-insumos'), $('cont-insumos'), filaInsumo);
const pintarMovimientos = listaPaginada($('filas-movimientos'), $('mas-movimientos'), $('cont-movimientos'), filaMovimiento);

const aplicarProductos = conFiltros($('buscar-productos'), $('bajo-productos'), () => productos, pintarProductos);
const aplicarInsumos = conFiltros($('buscar-insumos'), $('bajo-insumos'), () => insumos, pintarInsumos);

// Menor stock primero: lo que hay que reponer queda arriba.
const porStock = (a, b) => Number(a.stock) - Number(b.stock) || String(a.nombre).localeCompare(String(b.nombre));

async function cargarStock() {
  const q = consulta(formMov, 'error-movimientos');
  if (q === null) return;
  try {
    const r = await api('/api/reportes/stock' + q);
    productos = (r.productos ?? []).sort(porStock);
    insumos = (r.insumos ?? []).sort(porStock);

    $('resumen-stock').textContent =
      `${r.resumen?.productos_stock_bajo ?? 0} productos y ${r.resumen?.insumos_stock_bajo ?? 0} insumos con stock bajo`;

    aplicarProductos();
    aplicarInsumos();
    pintarMovimientos((r.movimientos ?? []).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))));
  } catch (e) {
    mostrarError('error-movimientos', e);
  }
}

formMov.addEventListener('submit', (ev) => { ev.preventDefault(); cargarStock(); });

/* ------------------------------------------------------------------ */
/* Pestañas activas, carga diferida y hash de la URL                    */
/* ------------------------------------------------------------------ */

const cargadas = new Set();
let vistaActual = 'sugerencias';
let subActual = 'productos';
let iniciando = true;

function cargarVista(vista) {
  if (cargadas.has(vista)) return;
  cargadas.add(vista);
  ({ 'sugerencias': cargarSugerencias, 'turnos-atendidos': cargarTurnos, 'stock': cargarStock })[vista]();
}

// Deja la pestaña activa en la URL sin sumar entradas al historial ni mover la página.
function actualizarHash() {
  if (iniciando) return;
  history.replaceState(null, '', '#' + (vistaActual === 'stock' ? 'stock-' + subActual : vistaActual));
}

function desdeHash() {
  const nombre = location.hash.slice(1);
  if (nombre.startsWith('stock')) return { vista: 'stock', sub: nombre.split('-')[1] || 'productos' };
  if (nombre === 'turnos-atendidos') return { vista: 'turnos-atendidos', sub: null };
  return { vista: 'sugerencias', sub: null };
}

const elegirPrincipal = activarPestanas($('pestanas'), (vista) => {
  vistaActual = vista;
  actualizarHash();
  cargarVista(vista);
});

const elegirSub = activarPestanas($('pestanas-stock'), (sub) => {
  subActual = sub;
  actualizarHash();
});

function mostrar({ vista, sub }) {
  if (sub) elegirSub(sub);
  elegirPrincipal(vista);
}

window.addEventListener('hashchange', () => mostrar(desdeHash()));

// Los dos filtros de fechas arrancan en los últimos 30 días.
for (const form of [formTurnos, formMov]) {
  form.elements.desde.value = haceDias(30);
  form.elements.hasta.value = aISO(new Date());
}

mostrar(desdeHash());
iniciando = false;
