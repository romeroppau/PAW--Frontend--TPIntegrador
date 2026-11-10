/**
 * turnos-cliente.js — Mis turnos (cliente/turnos.html), rol 3, Entrega 5
 *
 * Muestra los turnos de las mascotas del cliente: los próximos y los de los últimos 30 días. Los turnos
 * se piden y se cambian por WhatsApp (los carga el veterinario), así que esta página solo los muestra.
 *
 * Contrato de la API: GET /api/pacientes/turnos en docs/api/contrato-mascotas-turnos.md (repo Pacientes).
 * Seguridad: el backend devuelve solo los turnos de las mascotas del cliente de la sesión.
 * Todo texto de la API se inserta con el() (textContent).
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { textoEstadoTurno, textoMotivoTurno } from './etiquetas.js';

await exigirRol('CLIENTE');

const estado = document.getElementById('estado');

// Color de la insignia de cada estado (las mismas clases que la agenda del veterinario).
const CLASE_ESTADO = {
  PROGRAMADO: 'insignia',
  EN_ATENCION: 'insignia insignia-bajo',
  ATENDIDO: 'insignia insignia-atendido',
  CANCELADO: 'insignia insignia-anulado',
  AUSENTE: 'insignia insignia-falta'
};

// "Hoy" de Argentina, AAAA-MM-DD.
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

// "jue, 12/11/2026": se calcula al mediodía UTC para que la zona horaria no corra el día.
const textoFecha = (fecha) => new Intl.DateTimeFormat('es-AR', {
  weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC'
}).format(new Date(fecha + 'T12:00:00Z'));

const esProximo = (t) => t.fecha >= hoy && (t.estado === 'PROGRAMADO' || t.estado === 'EN_ATENCION');

function fila(turno, conConsulta) {
  const tr = el('tr', '', { 'data-id': turno.id });
  const celdaEstado = el('td');
  celdaEstado.append(el('span', textoEstadoTurno(turno.estado), { class: CLASE_ESTADO[turno.estado] ?? 'insignia' }));
  tr.append(
    el('td', textoFecha(turno.fecha)),
    el('td', turno.hora),
    el('td', turno.mascota.nombre),
    el('td', textoMotivoTurno(turno.motivo)),
    celdaEstado
  );
  if (conConsulta) {
    const celda = el('td');
    // Un turno atendido tiene su consulta en el historial clínico de la mascota.
    if (turno.estado === 'ATENDIDO') {
      celda.append(el('a', 'Ver en el historial', {
        href: '/cliente/historial.html?mascota=' + turno.mascota.id,
        'aria-label': `Ver la consulta de ${turno.mascota.nombre} en su historial clínico`
      }));
    }
    tr.append(celda);
  }
  return tr;
}

function pintar(id, turnos, conConsulta, textoVacio) {
  document.getElementById('filas-' + id).replaceChildren(...turnos.map((t) => fila(t, conConsulta)));
  document.getElementById('tabla-' + id).hidden = turnos.length === 0;
  const vacio = document.getElementById('vacio-' + id);
  vacio.textContent = textoVacio;
  vacio.hidden = turnos.length > 0;
}

async function cargar() {
  estado.textContent = 'Cargando…';
  try {
    // La API los devuelve ordenados por fecha y hora, desde 30 días atrás.
    const { turnos } = await api('/api/pacientes/turnos');
    const proximos = turnos.filter(esProximo);
    const anteriores = turnos.filter((t) => !esProximo(t)).reverse();   // el más reciente primero
    pintar('proximos', proximos, false, 'No tenés turnos próximos.');
    pintar('anteriores', anteriores, true, 'No tuviste turnos en los últimos 30 días.');
    estado.textContent = '';
  } catch {
    estado.textContent = 'No se pudieron cargar tus turnos. Probá de nuevo en un momento.';
  }
}

cargar();
