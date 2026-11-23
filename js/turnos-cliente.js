/**
 * turnos-cliente.js — Mis turnos (cliente/turnos.html), rol 3, Entrega 5
 *
 * Muestra los turnos de las mascotas del cliente: los próximos y los de los últimos 30 días, en dos
 * pestañas, con filtros por mascota, estado y motivo (valen para las dos) y la cantidad de cada una.
 * Los turnos se piden y se cambian por WhatsApp (los carga el veterinario): esta página solo los muestra.
 *
 * Suma el turno del chequeo de una adopción en curso: el animal todavía es de la rescatista, así que
 * ese turno no viene en GET /api/pacientes/turnos; sale de GET /api/adopciones/mis-postulaciones.
 *
 * Contrato de la API: GET /api/pacientes/turnos en docs/api/contrato-mascotas-turnos.md (repo Pacientes).
 * Seguridad: el backend devuelve solo los turnos de las mascotas del cliente de la sesión.
 * Todo texto de la API se inserta con el() (textContent).
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { textoEstadoTurno, textoMotivoTurno } from './etiquetas.js';
import { activarPestanas } from './pestanas.js';

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
    // El chequeo de una adopción en curso: la consulta queda en el historial del animal cuando pasa a ser tuyo.
    if (turno.adopcion) {
      tr.append(celda);
      return tr;
    }
    // Un turno atendido tiene su consulta en el historial clínico de la mascota y su factura
    // (se genera al finalizar la consulta: GET /api/pacientes/consultas/{id}/factura).
    if (turno.estado === 'ATENDIDO') {
      const enlaces = el('div', '', { class: 'acciones' });
      enlaces.append(el('a', 'Ver en el historial', {
        href: '/cliente/historial.html?mascota=' + turno.mascota.id,
        'aria-label': `Ver la consulta de ${turno.mascota.nombre} en su historial clínico`
      }));
      if (turno.consulta_id) {
        enlaces.append(el('a', 'Ver factura', {
          href: '/cliente/factura.html?consulta=' + turno.consulta_id,
          'aria-label': `Ver la factura del turno de ${turno.mascota.nombre} del ${textoFecha(turno.fecha)}`
        }));
      }
      celda.append(enlaces);
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

// Todos los turnos que devolvió la API (se filtran acá, sin volver a pedirlos).
let todos = [];
const filtros = document.getElementById('filtros');

// Las opciones de Mascota y Motivo salen de los turnos que tiene el cliente.
function llenarOpciones(select, valores) {
  const actual = select.value;
  select.replaceChildren(el('option', select.options[0]?.textContent ?? 'Todos', { value: '' }));
  for (const [valor, texto] of valores) select.append(el('option', texto, { value: valor }));
  select.value = [...select.options].some((o) => o.value === actual) ? actual : '';
}

function pasaFiltros(turno) {
  const { mascota, estado: estadoTurno, motivo } = Object.fromEntries(new FormData(filtros));
  return (!mascota || String(turno.mascota.id) === mascota)
    && (!estadoTurno || turno.estado === estadoTurno)
    && (!motivo || turno.motivo === motivo);
}

function mostrar() {
  const hayFiltros = [...new FormData(filtros).values()].some((v) => v !== '');
  const elegidos = todos.filter(pasaFiltros);
  const proximos = elegidos.filter(esProximo);
  const anteriores = elegidos.filter((t) => !esProximo(t)).reverse();   // el más reciente primero
  pintar('proximos', proximos, false, hayFiltros ? 'Ningún turno próximo coincide con los filtros.' : 'No tenés turnos próximos.');
  pintar('anteriores', anteriores, true, hayFiltros ? 'Ningún turno anterior coincide con los filtros.' : 'No tuviste turnos en los últimos 30 días.');
  document.getElementById('contador-proximos').textContent = `(${proximos.length})`;
  document.getElementById('contador-anteriores').textContent = `(${anteriores.length})`;
}

filtros.addEventListener('change', mostrar);
filtros.addEventListener('submit', (e) => e.preventDefault());
filtros.addEventListener('reset', () => setTimeout(mostrar));   // después de que el formulario se vacíe

activarPestanas(document.getElementById('pestanas-turnos'), () => {});

// El turno del chequeo de cada adopción en curso, con la forma de un turno de la agenda. Cuando la
// adopción se completa, el animal ya es del cliente y el turno viene con los demás: no se repite.
async function chequeosDeAdopcion() {
  try {
    const { postulaciones } = await api('/api/adopciones/mis-postulaciones');
    return postulaciones
      .filter((p) => p.estado === 'ELEGIDA' && p.adopcion.turno_chequeo && p.adopcion.estado !== 'FINALIZADA')
      .map((p) => ({
        id: 'adopcion-' + p.adopcion.id,
        fecha: p.adopcion.turno_chequeo.fecha,
        hora: p.adopcion.turno_chequeo.hora,
        motivo: 'CHEQUEO_ADOPCION',
        estado: p.adopcion.turno_chequeo.estado,
        mascota: { id: 'adopcion-' + p.publicacion.mascota.id, nombre: `${p.publicacion.mascota.nombre} (en adopción)` },
        adopcion: true,
      }));
  } catch {
    return [];   // si Adopciones no responde, se ven igual los demás turnos
  }
}

async function cargar() {
  estado.textContent = 'Cargando…';
  try {
    // Los turnos de sus mascotas (desde 30 días atrás) y los chequeos de sus adopciones en curso.
    const [{ turnos }, chequeos] = await Promise.all([api('/api/pacientes/turnos'), chequeosDeAdopcion()]);
    todos = [...turnos, ...chequeos].sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    const mascotas = new Map(todos.map((t) => [String(t.mascota.id), t.mascota.nombre]));
    llenarOpciones(document.getElementById('filtro-mascota'), [...mascotas].sort((a, b) => a[1].localeCompare(b[1])));
    const motivos = new Set(todos.map((t) => t.motivo));
    llenarOpciones(document.getElementById('filtro-motivo'), [...motivos].map((m) => [m, textoMotivoTurno(m)]));
    mostrar();
    estado.textContent = '';
  } catch {
    estado.textContent = 'No se pudieron cargar tus turnos. Probá de nuevo en un momento.';
  }
}

cargar();
