/**
 * historial.js — Historial clínico de una mascota (cliente/historial.html)
 *
 * Se abre con ?mascota=<id>. Sin ese parámetro muestra la lista de mascotas para elegir una
 * (desde el panel del cliente se llega así). El cliente solo ve sus mascotas y el veterinario cualquiera:
 * lo decide el backend (404 si la mascota es de otro cliente). La guardia de rol de la página
 * la hace guardia-panel.js. Todo texto que viene de la API se inserta con textContent (el() lo hace).
 * Contrato: docs/api/contrato-consultas.md del repo Pacientes.
 */

import { api } from './api.js';
import { el } from './ui.js';
import { textoEstadoFactura, textoEspecieMascota } from './etiquetas.js';

const estado = document.getElementById('estado');
const contenedor = document.getElementById('consultas');
const mascota = new URLSearchParams(location.search).get('mascota');

const dinero = (v) => '$' + Number(v || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// MySQL devuelve "2026-11-09 10:30:00": el espacio se cambia por "T" para que todos los navegadores lo lean.
function fecha(valor) {
  const d = new Date(String(valor).replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? String(valor ?? '') : d.toLocaleDateString('es-AR');
}

async function cargar() {
  if (!mascota) {
    elegirMascota();
    return;
  }
  estado.textContent = 'Cargando…';
  try {
    const r = await api(`/api/pacientes/mascotas/${encodeURIComponent(mascota)}/historial`);
    const consultas = r.consultas ?? r.datos ?? [];
    contenedor.replaceChildren(...consultas.map(tarjeta));
    estado.textContent = consultas.length ? '' : 'Esta mascota todavía no tiene consultas finalizadas.';
  } catch (e) {
    estado.textContent = e.estado === 404 ? 'No se encontró la mascota.' : 'No se pudo cargar el historial.';
  }
}

// Sin ?mascota=: un enlace al historial de cada mascota (el cliente ve las suyas; el veterinario, todas).
async function elegirMascota() {
  estado.textContent = 'Cargando…';
  try {
    const { mascotas } = await api('/api/pacientes/mascotas');
    if (!mascotas.length) {
      estado.textContent = 'Todavía no hay mascotas cargadas.';
      return;
    }
    const lista = el('ul', '', { class: 'lista-mascotas' });
    for (const m of mascotas) {
      const li = el('li');
      li.append(el('a', `${m.nombre} (${textoEspecieMascota(m.especie)})`, { href: '/cliente/historial.html?mascota=' + m.id }));
      lista.append(li);
    }
    contenedor.replaceChildren(el('p', 'Elegí la mascota para ver sus consultas y facturas:'), lista);
    estado.textContent = '';
  } catch {
    estado.textContent = 'No se pudo cargar la lista de mascotas.';
  }
}

// Una consulta finalizada: fecha, diagnóstico, ítems y factura.
function tarjeta(c) {
  const art = el('article', '', { class: 'tarjeta historial-consulta' });
  art.append(
    el('h2', 'Consulta del ' + fecha(c.fecha ?? c.finalizada_en)),
    el('p', 'Diagnóstico: ' + (c.diagnostico || '—'))
  );
  if (c.observaciones) art.append(el('p', 'Observaciones: ' + c.observaciones));

  art.append(detalle('Insumos utilizados', c.insumos, 'costo_unitario'));
  art.append(detalle('Productos', c.productos, 'precio_unitario'));

  if (c.factura) {
    const p = el('p', `Factura ${c.factura.numero}: ${dinero(c.factura.total)} (${textoEstadoFactura(c.factura.estado)}) `, {
      class: 'historial-factura'
    });
    p.append(el('a', 'Ver factura', {
      href: '/cliente/factura.html?consulta=' + c.id, 'aria-label': 'Ver factura ' + c.factura.numero
    }));
    art.append(p);
  }
  return art;
}

// Lista de ítems con su importe; sin ítems no se dibuja nada.
function detalle(titulo, items, campoPrecio) {
  const parte = document.createDocumentFragment();
  if (!items?.length) return parte;

  const lista = el('ul', '');
  for (const it of items) {
    lista.append(el('li', `${it.nombre} × ${it.cantidad} — ${dinero(Number(it[campoPrecio]) * it.cantidad)}`));
  }
  parte.append(el('h3', titulo), lista);
  return parte;
}

cargar();