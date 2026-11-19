/**
 * reportes.js — Panel de reportes y sugerencias (panel/reportes.html)
 * Contrato: docs/api/contrato-reportes.md del repo Reportes.
 * La guardia de rol es solo comodidad de interfaz; la autorización real la hace el backend.
 * Todo texto que viene de la API se inserta con textContent (el() lo hace).
 */

import { api } from './api.js';
import { exigirRol } from './auth.js';
import { textoEstadoInsumo } from './etiquetas.js';
import { el } from './ui.js';

await exigirRol('VETERINARIO');

const estado = document.getElementById('estado');

const dinero = (v) => '$' + Number(v || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// "2026-11-28" -> "28/11/2026", sin pasar por Date para evitar corrimientos de zona horaria.
const fecha = (v) => String(v ?? '').split('-').reverse().join('/');

async function cargar() {
  estado.textContent = 'Cargando…';
  try {
    const datos = await api('/api/reportes/sugerencias');
    const promo = datos.que_promocionar ?? {};
    const sugerida = promo.franja_sugerida;

    document.getElementById('texto-promocionar').textContent =
      sugerida?.sugerencia ?? 'Todavía no hay datos para sugerir.';
    document.getElementById('filas-franjas').replaceChildren(
      ...(promo.franjas ?? []).map((f) => filaFranja(f, sugerida))
    );

    const items = datos.que_liquidar ?? [];
    document.getElementById('filas-liquidar').replaceChildren(...items.map(filaLiquidar));
    document.getElementById('vacio-liquidar').hidden = items.length > 0;
    estado.textContent = '';
  } catch {
    estado.textContent = 'No se pudieron cargar los reportes.';
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
/* Turnos atendidos y stock, con filtro por fechas                      */
/* ------------------------------------------------------------------ */

// Fecha local en formato YYYY-MM-DD (toISOString usaría UTC y puede correrse un día).
const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const haceDias = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return aISO(d); };

// Arma "?desde=..&hasta=.." con las fechas que haya; devuelve null si el rango es inválido.
function consulta(form, errorId) {
  const error = document.getElementById(errorId);
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
  const error = document.getElementById(errorId);
  error.textContent = e.estado === 400 ? 'Revisá las fechas del filtro.' : 'No se pudo cargar el reporte.';
  error.hidden = false;
}

// --- Turnos atendidos ---
const formTurnos = document.getElementById('filtro-turnos');

async function cargarTurnos() {
  const q = consulta(formTurnos, 'error-turnos');
  if (q === null) return;
  try {
    const r = await api('/api/reportes/turnos-atendidos' + q);
    const turnos = r.turnos ?? [];
    document.getElementById('filas-turnos').replaceChildren(...turnos.map(filaTurno));
    document.getElementById('vacio-turnos').hidden = turnos.length > 0;
    document.getElementById('resumen-turnos').textContent =
      `${r.resumen?.cantidad_turnos ?? turnos.length} turnos · total facturado ${dinero(r.resumen?.total_facturado)}`;
  } catch (e) {
    mostrarError('error-turnos', e);
  }
}

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

formTurnos.addEventListener('submit', (ev) => { ev.preventDefault(); cargarTurnos(); });

// --- Stock y movimientos ---
const formMov = document.getElementById('filtro-movimientos');
const STOCK_BAJO = 10;   // misma regla que el motor: 10 unidades o menos

async function cargarStock() {
  const q = consulta(formMov, 'error-movimientos');
  if (q === null) return;
  try {
    const r = await api('/api/reportes/stock' + q);
    const productos = r.productos ?? [];
    const insumos = r.insumos ?? [];

    document.getElementById('filas-stock-productos').replaceChildren(...productos.map(filaProducto));
    document.getElementById('filas-stock-insumos').replaceChildren(...insumos.map(filaInsumo));
    document.getElementById('resumen-stock').textContent =
      `${r.resumen?.productos_stock_bajo ?? 0} productos y ${r.resumen?.insumos_stock_bajo ?? 0} insumos con stock bajo`;

    // Nombres para los movimientos, que solo traen el id del ítem.
    const nombreProducto = new Map(productos.map((p) => [Number(p.id), p.nombre]));
    const nombreInsumo = new Map(insumos.map((i) => [Number(i.id), i.nombre]));
    const movimientos = (r.movimientos ?? [])
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
      .slice(0, 100);

    document.getElementById('filas-movimientos').replaceChildren(
      ...movimientos.map((m) => filaMovimiento(m, nombreProducto, nombreInsumo))
    );
    document.getElementById('vacio-movimientos').hidden = movimientos.length > 0;
  } catch (e) {
    mostrarError('error-movimientos', e);
  }
}

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

function filaMovimiento(m, nombreProducto, nombreInsumo) {
  const item = m.producto_id
    ? nombreProducto.get(Number(m.producto_id)) ?? 'Producto ' + m.producto_id
    : nombreInsumo.get(Number(m.insumo_id)) ?? 'Insumo ' + m.insumo_id;
  const tr = el('tr');
  tr.append(
    el('td', fecha(String(m.fecha).slice(0, 10)) + ' ' + String(m.fecha).slice(11, 16)),
    el('td', m.tipo),
    el('td', m.motivo),
    el('td', item),
    el('td', m.cantidad)
  );
  return tr;
}

formMov.addEventListener('submit', (ev) => { ev.preventDefault(); cargarStock(); });

// Arranque: turnos de los últimos 30 días y movimientos de los últimos 30 días.
formTurnos.elements.desde.value = haceDias(30);
formTurnos.elements.hasta.value = aISO(new Date());
formMov.elements.desde.value = haceDias(30);
formMov.elements.hasta.value = aISO(new Date());
cargarTurnos();
cargarStock();

cargar();