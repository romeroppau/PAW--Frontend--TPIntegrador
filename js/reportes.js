/**
 * reportes.js — Panel de reportes y sugerencias (panel/reportes.html)
 * Contrato: docs/api/contrato-reportes.md del repo Reportes.
 * La guardia de rol es solo comodidad de interfaz; la autorización real la hace el backend.
 * Todo texto que viene de la API se inserta con textContent (el() lo hace).
 */

import { api } from './api.js';
import { exigirRol } from './auth.js';
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

cargar();