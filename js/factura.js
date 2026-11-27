/**
 * factura.js — Factura de una consulta finalizada (cliente/factura.html)
 *
 * Se abre con ?consulta=<id>. La veterinaria ve cualquier factura; el cliente, solo las de sus
 * mascotas (si no es suya el backend responde 404, igual que si no existiera). La guardia de rol
 * de la página la hace guardia-panel.js. Todo texto que viene de la API se inserta con textContent.
 * Contrato: GET /api/pacientes/consultas/{id}/factura (docs/api/contrato-consultas.md de Pacientes).
 */

import { api } from './api.js';
import { sesion } from './auth.js';
import { confirmar, el, limpiarErrores, mostrarErrores } from './ui.js';
import { textoEstadoFactura, textoMotivos } from './etiquetas.js';

const estado = document.getElementById('estado');
const consulta = new URLSearchParams(location.search).get('consulta');

// Los medios de pago de la factura de una consulta (migración 030).
const MEDIOS = { EFECTIVO: 'efectivo', TRANSFERENCIA: 'transferencia', TARJETA: 'tarjeta' };

const $form = document.getElementById('form-pago');
const $estadoPago = document.getElementById('estado-pago');
let actual = null;

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
    await mostrar(f);
    estado.textContent = '';
  } catch (e) {
    estado.textContent = e.estado === 404 ? 'No se encontró la factura.' : 'No se pudo cargar la factura.';
  }
}

async function mostrar(f) {
  actual = f;
  const c = f.consulta ?? {};
  document.title = `Factura ${f.numero} | HuellaVet`;
  poner('titulo', `Factura ${f.numero}`);
  poner('estado-factura', textoEstadoFactura(f.estado));
  document.getElementById('estado-factura').classList.toggle('insignia-bajo', f.estado === 'PENDIENTE_PAGO');
  document.getElementById('nota-pago').hidden = f.estado !== 'PENDIENTE_PAGO';

  // El pago: "Efectivo, el 27/11/2026" (las pagadas de antes no tienen medio: solo "Pagada").
  const pago = f.estado === 'PAGADA' && (f.medio_pago || f.pagada_en)
    ? [f.medio_pago ? MEDIOS[f.medio_pago][0].toUpperCase() + MEDIOS[f.medio_pago].slice(1) : null,
       f.pagada_en ? 'el ' + fecha(f.pagada_en) : null].filter(Boolean).join(', ')
    : '';
  document.getElementById('dato-pago').hidden = !pago;
  poner('pago', pago);

  // "Registrar el pago": solo la veterinaria y solo si está pendiente.
  const usuario = await sesion;
  $form.hidden = !(usuario?.rol === 'VETERINARIO' && f.estado === 'PENDIENTE_PAGO');

  poner('fecha', fecha(f.fecha));
  poner('cliente', f.cliente?.nombre ?? '—');
  poner('mascota', f.mascota?.nombre ?? '—');
  poner('atencion', `${textoMotivos(c)} del ${fecha(c.fecha)}${c.hora ? ' a las ' + c.hora : ''}`);
  poner('diagnostico', c.diagnostico || '—');

  // Una fila por concepto: la consulta (valor base) y cada insumo y producto con su precio copiado.
  // Si el turno se sacó en una franja promocionada, la consulta dice el descuento y el precio sin él.
  const concepto = c.descuento
    ? `Consulta veterinaria (${c.descuento} % de descuento; sin descuento: ${dinero(c.precio_lista)})`
    : 'Consulta veterinaria';
  const filas = [fila(concepto, 1, c.valor_base ?? f.subtotal_base)];
  for (const i of c.insumos ?? []) filas.push(fila(i.nombre, i.cantidad, i.costo_unitario));
  for (const p of c.productos ?? []) filas.push(fila(p.nombre, p.cantidad, p.precio_unitario));
  document.getElementById('filas').replaceChildren(...filas);

  poner('t-base', dinero(f.subtotal_base));
  poner('t-insumos', dinero(f.subtotal_insumos));
  poner('t-productos', dinero(f.subtotal_productos));
  poner('t-total', dinero(f.total));

  // "Volver" lleva a la pantalla de donde se vino (la agenda, Mis turnos o Reportes) o, si se llegó
  // de otro lado, al historial de la mascota (lo ven los dos roles).
  const volver = document.getElementById('volver');
  const anterior = paginaAnterior();
  if (anterior) {
    volver.href = anterior.href;
    volver.textContent = '← Volver a ' + anterior.nombre;
  } else if (f.mascota?.id) {
    volver.href = '/cliente/historial.html?mascota=' + f.mascota.id;
  }

  document.getElementById('factura').hidden = false;
}

// Las pantallas que enlazan a la factura (además del historial). Se usa el referrer, que en el
// mismo sitio trae la dirección completa (Referrer-Policy: strict-origin-when-cross-origin).
const ORIGENES = [
  ['/panel/agenda.html', 'la agenda'],
  ['/cliente/turnos.html', 'mis turnos'],
  ['/panel/reportes.html', 'reportes'],
];

function paginaAnterior() {
  try {
    const url = new URL(document.referrer);
    if (url.origin !== location.origin) return null;
    const origen = ORIGENES.find(([ruta]) => url.pathname === ruta);
    return origen ? { href: url.pathname + url.search + url.hash, nombre: origen[1] } : null;
  } catch {
    return null;
  }
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

// La veterinaria marca la factura como pagada, con el medio de pago (POST .../factura/pago).
$form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarErrores($form);
  $estadoPago.textContent = '';
  $estadoPago.classList.remove('mensaje-ok');

  const medio = $form.elements.medio_pago.value;
  if (!MEDIOS[medio]) {
    mostrarErrores($form, { medio_pago: 'Elegí el medio de pago: efectivo, transferencia o tarjeta' });
    $form.elements.medio_pago.focus();
    return;
  }

  const pregunta = `¿Marcar la factura ${actual.numero} (${dinero(actual.total)}) como pagada en ${MEDIOS[medio]}?`;
  if (!await confirmar(pregunta, { aceptar: 'Marcar como pagada' })) return;

  const boton = $form.querySelector('button[type="submit"]');
  boton.disabled = true;
  try {
    const f = await api(`/api/pacientes/consultas/${encodeURIComponent(consulta)}/factura/pago`, {
      metodo: 'POST', cuerpo: { medio_pago: medio },
    });
    await mostrar(f);
    $estadoPago.textContent = `Listo: la factura ${f.numero} quedó pagada en ${MEDIOS[medio]}.`;
    $estadoPago.classList.add('mensaje-ok');
  } catch (e) {
    if (e.estado === 400) {
      mostrarErrores($form, e.datos?.campos ?? {}, e.datos?.error ?? 'Revisá el medio de pago.');
    } else if (e.estado === 409) {
      // Otra pestaña (u otro clic) ya la marcó: se muestra como quedó.
      $estadoPago.textContent = 'La factura ya estaba pagada.';
      try { await mostrar(await api(`/api/pacientes/consultas/${encodeURIComponent(consulta)}/factura`)); } catch { /* queda como estaba */ }
    } else {
      mostrarErrores($form, {}, 'No se pudo registrar el pago. Probá de nuevo.');
    }
  } finally {
    boton.disabled = false;
  }
});

cargar();
