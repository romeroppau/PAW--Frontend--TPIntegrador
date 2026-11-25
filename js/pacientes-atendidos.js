/**
 * pacientes-atendidos.js — Historial clínico de la veterinaria (panel/historial-clinico.html).
 *
 * La lista de pacientes atendidos: la mascota (a su ficha), el dueño (a su ficha), cuántas consultas
 * tuvo y la fecha y el diagnóstico de la última. "Ver consultas" despliega debajo de la fila el
 * historial de esa mascota (cada consulta con su diagnóstico, lo que se usó y la factura); "Historial
 * completo" abre la página del historial.
 * API (repo Pacientes, docs/api/contrato-consultas.md):
 *   GET /api/pacientes/atendidos?buscar=&pagina=   → { datos, pagina, por_pagina, hay_mas } (de a 20)
 *   GET /api/pacientes/mascotas/{id}/historial     → { consultas }
 * Todo texto de la API va con el() (textContent).
 */
import { api, debounce } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { textoEspecieMascota, textoEstadoFactura, textoMotivos } from './etiquetas.js';
import { enlaceMascota } from './mascota-datos.js';
import { enlaceDuenio } from './personas.js';

const $buscar = document.getElementById('buscar');
const $estado = document.getElementById('estado');
const $tabla = document.getElementById('tabla');
const $filas = document.getElementById('filas');
const $verMas = document.getElementById('ver-mas');
const COLUMNAS = 5;

const dinero = (v) => '$' + Number(v || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// "2026-11-20" o "2026-11-20 10:42:00" → "20/11/2026"
const fecha = (v) => String(v ?? '').slice(0, 10).split('-').reverse().join('/');

let pagina = 1;
let pedidoActual = 0;   // si llegan dos respuestas, solo se dibuja la del último pedido

await exigirRol('VETERINARIO');
$buscar.focus();
cargar();

async function cargar(siguiente = false) {
  const id = ++pedidoActual;
  const buscar = $buscar.value.trim();
  const paginaPedida = siguiente ? pagina + 1 : 1;
  const q = new URLSearchParams({ pagina: String(paginaPedida) });
  if (buscar) q.set('buscar', buscar);
  $verMas.disabled = true;
  if (!siguiente) $estado.textContent = 'Cargando pacientes…';

  try {
    const { datos = [], hay_mas: hayMas } = await api('/api/pacientes/atendidos?' + q.toString());
    if (id !== pedidoActual) return;
    pagina = paginaPedida;
    const filas = datos.map(fila);
    if (siguiente) $filas.append(...filas); else $filas.replaceChildren(...filas);
    const hayAlguno = $filas.children.length > 0;
    $tabla.hidden = !hayAlguno;
    $verMas.hidden = !hayMas;
    $estado.textContent = hayAlguno ? ''
      : buscar ? `No encontramos pacientes atendidos con "${buscar}".` : 'Todavía no hay consultas finalizadas.';
  } catch {
    if (id !== pedidoActual) return;
    $estado.textContent = 'No se pudieron cargar los pacientes. Probá de nuevo en un momento.';
  } finally {
    $verMas.disabled = false;
  }
}

// La fila de un paciente y, debajo, la fila (oculta) donde se despliegan sus consultas.
function fila(p) {
  const { mascota } = p;
  const tr = el('tr', '', { 'data-id': mascota.id });

  const nombre = el('th', '', { scope: 'row' });
  nombre.append(enlaceMascota(mascota));
  nombre.append(el('span', [textoEspecieMascota(mascota.especie), mascota.raza].filter(Boolean).join(' · '), { class: 'ayuda' }));
  if (!mascota.activo) nombre.append(' ', el('span', '(dada de baja)', { class: 'ayuda' }));

  const duenio = el('td');
  duenio.append(enlaceDuenio(p.duenio));

  const ultima = el('td');
  ultima.append(el('span', fecha(p.ultima_consulta.fecha)));
  if (p.ultima_consulta.diagnostico) ultima.append(el('span', p.ultima_consulta.diagnostico, { class: 'ayuda' }));

  const idDetalle = 'consultas-' + mascota.id;
  const detalle = el('tr', '', { class: 'fila-detalle', id: idDetalle, hidden: '' });
  const celdaDetalle = el('td', '', { colspan: String(COLUMNAS) });
  detalle.append(celdaDetalle);

  // Las acciones van en un <div>: con "acciones" (display: flex) en el <td>, la celda no se alinearía.
  const acciones = el('td');
  const caja = el('div', '', { class: 'acciones' });
  const ver = el('button', 'Ver consultas', {
    type: 'button', class: 'boton boton-chico', 'aria-expanded': 'false', 'aria-controls': idDetalle,
    'aria-label': `Ver las consultas de ${mascota.nombre}`
  });
  ver.addEventListener('click', () => desplegar(mascota, ver, detalle, celdaDetalle));
  caja.append(ver, el('a', 'Historial completo', {
    href: '/cliente/historial.html?mascota=' + encodeURIComponent(mascota.id),
    'aria-label': `Historial completo de ${mascota.nombre}`
  }));
  acciones.append(caja);

  tr.append(nombre, duenio, el('td', p.consultas), ultima, acciones);
  const filas = document.createDocumentFragment();
  filas.append(tr, detalle);
  return filas;
}

// Muestra u oculta las consultas de la mascota. Se piden la primera vez que se abren.
async function desplegar(mascota, boton, detalle, celda) {
  const abrir = detalle.hidden;
  detalle.hidden = !abrir;
  boton.setAttribute('aria-expanded', String(abrir));
  boton.textContent = abrir ? 'Ocultar consultas' : 'Ver consultas';
  if (!abrir || celda.dataset.cargado) return;

  celda.replaceChildren(el('p', 'Cargando consultas…', { class: 'estado', role: 'status' }));
  try {
    const { consultas = [] } = await api(`/api/pacientes/mascotas/${encodeURIComponent(mascota.id)}/historial`);
    celda.dataset.cargado = '1';
    if (consultas.length === 0) {
      celda.replaceChildren(el('p', 'No tiene consultas finalizadas.', { class: 'estado' }));
      return;
    }
    const lista = el('ol', '', { class: 'consultas-paciente', 'aria-label': `Consultas de ${mascota.nombre}` });
    lista.append(...consultas.map(consulta));
    celda.replaceChildren(lista);
  } catch {
    celda.replaceChildren(el('p', 'No se pudieron cargar las consultas. Probá de nuevo.', { class: 'estado' }));
  }
}

// Una consulta: fecha, motivo (salvo una consulta común; 25/11), diagnóstico, observaciones, lo que se
// usó, la factura y los enlaces.
function consulta(c) {
  const li = el('li', '', { class: 'consulta-paciente' });
  li.append(el('strong', fecha(c.fecha ?? c.finalizada_en)), ' ');
  if (c.motivo && textoMotivos(c) !== 'Consulta') li.append(el('span', textoMotivos(c), { class: 'insignia' }), ' ');
  li.append(el('span', c.diagnostico || 'Sin diagnóstico'));
  if (c.observaciones) li.append(el('span', c.observaciones, { class: 'ayuda' }));

  const usado = [
    ...(c.insumos ?? []).map((i) => `${i.nombre} × ${i.cantidad}`),
    ...(c.productos ?? []).map((p) => `${p.nombre} × ${p.cantidad}`),
  ];
  if (usado.length) li.append(el('span', 'Se usó: ' + usado.join(', '), { class: 'ayuda' }));

  const enlaces = el('div', '', { class: 'acciones' });
  if (c.factura) {
    enlaces.append(el('span', `Factura ${c.factura.numero}: ${dinero(c.factura.total)} (${textoEstadoFactura(c.factura.estado)})`));
    enlaces.append(el('a', 'Ver factura', { href: '/cliente/factura.html?consulta=' + c.id, 'aria-label': 'Ver la factura ' + c.factura.numero }));
  }
  enlaces.append(el('a', 'Ver consulta', { href: '/panel/consulta.html?id=' + c.id, 'aria-label': `Ver la consulta del ${fecha(c.fecha ?? c.finalizada_en)}` }));
  li.append(enlaces);
  return li;
}

$buscar.addEventListener('input', debounce(() => cargar(), 300));
$verMas.addEventListener('click', () => cargar(true));
