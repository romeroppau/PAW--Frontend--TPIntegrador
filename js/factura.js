/**
 * factura.js — Factura de una consulta finalizada (cliente/factura.html)
 *
 * Se abre con ?consulta=<id>. La veterinaria ve cualquier factura; el cliente, solo las de sus
 * mascotas (si no es suya el backend responde 404, igual que si no existiera). La guardia de rol
 * de la página la hace guardia-panel.js. Todo texto que viene de la API se inserta con textContent.
 * Contrato: GET /api/pacientes/consultas/{id}/factura (docs/api/contrato-consultas.md de Pacientes).
 */

import { api } from './api.js';
import { el } from './ui.js';
import { textoEstadoFactura, textoMotivoTurno } from './etiquetas.js';

const estado = document.getElementById('estado');
const consulta = new URLSearchParams(location.search).get('consulta');

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
const dinero = (v) => pesos.format(Number(v || 0));

// "2026-11-10" o "2026-11-10 10:42:00" -> 10/11/2026. Se arma a mano para no depender de la zona horaria.
function fecha(valor) {
  const [a, m, d] = String(valor ?? '').slice(0, 10).split('-');
  return d ? `${d}/${m}/${a}` : String(valor ?? '');
}

const poner = (id, texto) => { document.getElementById(id).textContent = texto; };

async function cargar() {
  if (!consulta) {
    estado.textContent = 'Falta indicar la consulta.';
    return;
  }
  estado.textContent = 'Cargando…';
  try {
    const f = await api(`/api/pacientes/consultas/${encodeURIComponent(consulta)}/factura`);
    mostrar(f);
    estado.textContent = '';
  } catch (e) {
    estado.textContent = e.estado === 404 ? 'No se encontró la factura.' : 'No se pudo cargar la factura.';
  }
}

function mostrar(f) {
  const c = f.consulta ?? {};
  document.title = `Factura ${f.numero} | HuellaVet`;
  poner('titulo', `Factura ${f.numero}`);
  poner('estado-factura', textoEstadoFactura(f.estado));
  document.getElementById('estado-factura').classList.toggle('insignia-bajo', f.estado === 'PENDIENTE_PAGO');
  document.getElementById('nota-pago').hidden = f.estado !== 'PENDIENTE_PAGO';

  poner('fecha', fecha(f.fecha));
  poner('cliente', f.cliente?.nombre ?? '—');
  poner('mascota', f.mascota?.nombre ?? '—');
  poner('atencion', `${textoMotivoTurno(c.motivo)} del ${fecha(c.fecha)}${c.hora ? ' a las ' + c.hora : ''}`);
  poner('diagnostico', c.diagnostico || '—');

  // Una fila por concepto: la consulta (valor base) y cada insumo y producto con su precio copiado.
  const filas = [fila('Consulta veterinaria', 1, c.valor_base ?? f.subtotal_base)];
  for (const i of c.insumos ?? []) filas.push(fila(i.nombre, i.cantidad, i.costo_unitario));
  for (const p of c.productos ?? []) filas.push(fila(p.nombre, p.cantidad, p.precio_unitario));
  document.getElementById('filas').replaceChildren(...filas);

  poner('t-base', dinero(f.subtotal_base));
  poner('t-insumos', dinero(f.subtotal_insumos));
  poner('t-productos', dinero(f.subtotal_productos));
  poner('t-total', dinero(f.total));

  // "Volver" lleva al historial de la mascota (lo ven los dos roles).
  if (f.mascota?.id) document.getElementById('volver').href = '/cliente/historial.html?mascota=' + f.mascota.id;

  document.getElementById('factura').hidden = false;
}

function fila(concepto, cantidad, unitario) {
  const tr = el('tr');
  tr.append(
    el('td', concepto),
    el('td', cantidad, { class: 'numero' }),
    el('td', dinero(unitario), { class: 'numero' }),
    el('td', dinero(Number(unitario) * Number(cantidad)), { class: 'numero' })
  );
  return tr;
}

document.getElementById('imprimir').addEventListener('click', () => window.print());

cargar();
