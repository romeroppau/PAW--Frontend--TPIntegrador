/**
 * agenda.js — Agenda del veterinario (panel/agenda.html), rol 3, Entrega 4
 *
 * Muestra los turnos de un día y permite cambiar su estado sin recargar la página (fetch):
 *   - cambiar de día (anterior, siguiente, hoy o eligiendo la fecha);
 *   - cancelar un turno programado (libera el horario);
 *   - marcar ausente un turno programado de hoy o de un día anterior;
 *   - atender un turno de hoy (abre la consulta del rol 4) o ver la consulta de un turno atendido.
 *
 * Contrato de la API: docs/api/contrato-mascotas-turnos.md (repo Pacientes).
 * Seguridad: la guardia de acceso es solo comodidad de interfaz; la autorización real la hace
 * el backend. Todo texto que viene de la API se inserta con el() (textContent), nunca con innerHTML.
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { confirmar, el, limpiarErrores, mostrarErrores } from './ui.js';
import { textoEstadoTurno, textoMotivoTurno, textoEspecieMascota } from './etiquetas.js';

await exigirRol('VETERINARIO');

const API = '/api/pacientes/turnos';
const ZONA = 'America/Argentina/Buenos_Aires';

const inputFecha = document.getElementById('fecha');
const estado = document.getElementById('estado');
const filas = document.getElementById('filas');
const tabla = document.getElementById('tabla');

// Turnos del día que se está mostrando, tal como los devolvió el servidor.
let turnos = [];
// Cada carga tiene un número: si el veterinario cambia de día rápido, se ignoran las respuestas viejas.
let pedidoActual = 0;

// Color de la insignia de cada estado (las clases están en base.css).
const CLASE_ESTADO = {
  PROGRAMADO: 'insignia',
  EN_ATENCION: 'insignia insignia-bajo',
  ATENDIDO: 'insignia insignia-atendido',
  CANCELADO: 'insignia insignia-anulado',
  AUSENTE: 'insignia insignia-falta'
};

/* ------------------------------------------------------------------ */
/* Fechas (siempre AAAA-MM-DD, el día de Argentina)                    */
/* ------------------------------------------------------------------ */

// en-CA formatea como AAAA-MM-DD.
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());

// Se calcula al mediodía UTC para que ningún cambio de hora mueva el día.
function sumarDias(fecha, dias) {
  const d = new Date(fecha + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// "jueves 5 de noviembre de 2026"
const textoDia = (fecha) => new Intl.DateTimeFormat('es-AR', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC'
}).format(new Date(fecha + 'T12:00:00Z'));

const esFechaValida = (texto) => /^\d{4}-\d{2}-\d{2}$/.test(texto ?? '') && !Number.isNaN(Date.parse(texto));

/* ------------------------------------------------------------------ */
/* Carga de un día                                                     */
/* ------------------------------------------------------------------ */

async function cargar(fecha) {
  const pedido = ++pedidoActual;
  inputFecha.value = fecha;
  // La URL queda con el día, así recargar o compartir el enlace abre el mismo día.
  history.replaceState(null, '', '?fecha=' + fecha);
  document.getElementById('titulo-dia').textContent = textoDia(fecha) + (fecha === hoy() ? ' (hoy)' : '');
  estado.textContent = 'Cargando…';

  try {
    const r = await api(`${API}?fecha=${encodeURIComponent(fecha)}`);
    if (pedido !== pedidoActual) return;                    // llegó tarde: ya se pidió otro día
    turnos = r.turnos;
    pintar();
  } catch (e) {
    if (pedido !== pedidoActual) return;
    turnos = [];
    tabla.hidden = true;
    document.getElementById('resumen').textContent = '';
    estado.textContent = e.datos?.error ?? 'No se pudo cargar la agenda.';
  }
}

function pintar() {
  filas.replaceChildren(...turnos.map(fila));
  tabla.hidden = turnos.length === 0;
  estado.textContent = turnos.length ? '' : 'No hay turnos para este día.';
  pintarResumen();
}

// "4 turnos · Programado: 2 · Atendido: 1 · Cancelado: 1"
function pintarResumen() {
  const resumen = document.getElementById('resumen');
  if (turnos.length === 0) {
    resumen.textContent = '';
    return;
  }
  const porEstado = {};
  for (const t of turnos) porEstado[t.estado] = (porEstado[t.estado] ?? 0) + 1;
  const partes = Object.keys(CLASE_ESTADO)
    .filter((codigo) => porEstado[codigo])
    .map((codigo) => `${textoEstadoTurno(codigo)}: ${porEstado[codigo]}`);
  resumen.textContent = `${turnos.length} ${turnos.length === 1 ? 'turno' : 'turnos'} · ${partes.join(' · ')}`;
}

/* ------------------------------------------------------------------ */
/* Una fila de la agenda                                               */
/* ------------------------------------------------------------------ */

function fila(turno) {
  const tr = el('tr', '', { 'data-id': turno.id });

  const mascota = el('td');
  mascota.append(el('strong', turno.mascota.nombre), el('span', textoEspecieMascota(turno.mascota.especie), { class: 'ayuda' }));

  const duenio = el('td');
  duenio.append(el('span', turno.duenio.nombre));
  if (turno.duenio.telefono) {
    duenio.append(el('a', turno.duenio.telefono, { class: 'ayuda', href: 'tel:' + turno.duenio.telefono }));
  }

  const celdaEstado = el('td');
  celdaEstado.append(el('span', textoEstadoTurno(turno.estado), { class: CLASE_ESTADO[turno.estado] ?? 'insignia' }));

  tr.append(el('td', turno.hora), mascota, duenio, el('td', textoMotivoTurno(turno.motivo)), celdaEstado, acciones(turno, tr));
  return tr;
}

// Las acciones dependen del estado y del día del turno. Van en un <div>: si la clase "acciones"
// (display: flex) estuviera en el <td>, la celda dejaría de alinearse con el resto de la fila.
function acciones(turno, tr) {
  const celda = el('td');
  const td = el('div', '', { class: 'acciones' });
  celda.append(td);
  const nombre = turno.mascota.nombre;

  if (turno.estado === 'PROGRAMADO') {
    if (turno.fecha === hoy()) {
      td.append(el('a', 'Atender', {
        class: 'boton boton-chico', href: '/panel/consulta.html?turno=' + turno.id,
        'aria-label': `Atender a ${nombre} (${turno.hora})`
      }));
    }
    // No se puede faltar a un turno que todavía no llegó (el backend responde 409).
    if (turno.fecha <= hoy()) {
      td.append(botonEstado(turno, tr, 'ausente', 'Ausente', 'boton boton-borde boton-chico',
        `¿Marcar que ${nombre} no vino al turno de las ${turno.hora}?`));
    }
    td.append(botonEstado(turno, tr, 'cancelar', 'Cancelar', 'boton boton-peligro boton-chico',
      `¿Cancelar el turno de ${nombre} de las ${turno.hora}? El horario queda libre para otro turno.`));
  } else if (turno.consulta_id) {
    const texto = turno.estado === 'EN_ATENCION' ? 'Continuar consulta' : 'Ver consulta';
    td.append(el('a', texto, {
      href: '/panel/consulta.html?id=' + turno.consulta_id, 'aria-label': `${texto} de ${nombre}`
    }));
  }

  // Lugar para el error de esta fila (role="alert": el lector de pantalla lo anuncia).
  celda.append(el('span', '', { class: 'campo-error', role: 'alert' }));
  return celda;
}

// Botón que cambia el estado del turno con fetch y reemplaza solo su fila, sin recargar la página.
function botonEstado(turno, tr, accion, texto, clase, pregunta) {
  const boton = el('button', texto, {
    type: 'button', class: clase, 'aria-label': `${texto}: turno de ${turno.mascota.nombre} (${turno.hora})`
  });

  boton.addEventListener('click', async () => {
    const aceptar = accion === 'cancelar' ? 'Cancelar turno' : 'Marcar ausente';
    if (!await confirmar(pregunta, { aceptar, peligro: true })) return;
    const botones = tr.querySelectorAll('button');
    botones.forEach((b) => { b.disabled = true; });         // un doble clic no manda dos pedidos
    const error = tr.querySelector('.campo-error');
    error.textContent = '';

    try {
      // POST /api/pacientes/turnos/{id}/cancelar o /ausente. Responde { turno }.
      const { turno: nuevo } = await api(`${API}/${turno.id}/${accion}`, { metodo: 'POST' });
      turnos = turnos.map((t) => (t.id === nuevo.id ? nuevo : t));
      tr.replaceWith(fila(nuevo));
      pintarResumen();
      estado.textContent = `Turno de ${nuevo.mascota.nombre} (${nuevo.hora}): ${textoEstadoTurno(nuevo.estado).toLowerCase()}.`;
    } catch (e) {
      // 409: el turno ya no está programado (por ejemplo, otro lo cambió) o todavía no llegó su día.
      error.textContent = e.datos?.error ?? 'No se pudo cambiar el estado del turno.';
      botones.forEach((b) => { b.disabled = false; });
    }
  });
  return boton;
}

/* ------------------------------------------------------------------ */
/* Nuevo turno                                                         */
/* ------------------------------------------------------------------ */

const seccionTurno = document.getElementById('seccion-turno');
const formTurno = document.getElementById('form-turno');
const selectMascota = formTurno.elements.mascota_id;
let mascotasCargadas = false;

// Abre el formulario con el día que se está mirando (o hoy, si ese día ya pasó).
document.getElementById('nuevo-turno').addEventListener('click', async () => {
  formTurno.reset();
  limpiarErrores(formTurno);
  formTurno.elements.fecha.min = hoy();
  formTurno.elements.fecha.value = inputFecha.value >= hoy() ? inputFecha.value : hoy();
  seccionTurno.hidden = false;

  // La lista de mascotas se pide una sola vez, la primera vez que se abre el formulario.
  if (!mascotasCargadas) {
    try {
      const { mascotas } = await api('/api/pacientes/mascotas');
      selectMascota.append(...mascotas.map((m) => el('option',
        `${m.nombre} (${textoEspecieMascota(m.especie)}) · ${m.duenio.nombre}`, { value: m.id })));
      mascotasCargadas = true;
    } catch {
      mostrarErrores(formTurno, {}, 'No se pudo cargar la lista de mascotas.');
    }
  }
  selectMascota.focus();
});

document.getElementById('cancelar-turno').addEventListener('click', () => { seccionTurno.hidden = true; });

formTurno.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  limpiarErrores(formTurno);
  const boton = document.getElementById('guardar-turno');
  boton.disabled = true;                                    // un doble clic no carga dos turnos
  try {
    // POST /api/pacientes/turnos. Responde { turno }. El veterinario es el de la sesión.
    const { turno } = await api(API, {
      metodo: 'POST',
      cuerpo: {
        mascota_id: Number(selectMascota.value),
        fecha: formTurno.elements.fecha.value,
        hora: formTurno.elements.hora.value,
        motivo: formTurno.elements.motivo.value
      }
    });
    seccionTurno.hidden = true;
    // Se muestra el día del turno nuevo, que aparece en la agenda sin recargar la página.
    await cargar(turno.fecha);
    estado.textContent = `Turno cargado: ${turno.mascota.nombre}, ${textoDia(turno.fecha)} a las ${turno.hora}.`;
  } catch (e) {
    // 400: un error por campo. 409: ya hay un turno a esa hora (viene en campos.hora). 404: mascota de baja.
    mostrarErrores(formTurno, e.datos?.campos, e.datos?.error ?? 'No se pudo cargar el turno.');
  } finally {
    boton.disabled = false;
  }
});

/* ------------------------------------------------------------------ */
/* Cambiar de día                                                      */
/* ------------------------------------------------------------------ */

inputFecha.addEventListener('change', () => {
  if (esFechaValida(inputFecha.value)) cargar(inputFecha.value);
});
document.getElementById('dia-anterior').addEventListener('click', () => cargar(sumarDias(inputFecha.value, -1)));
document.getElementById('dia-siguiente').addEventListener('click', () => cargar(sumarDias(inputFecha.value, 1)));
document.getElementById('hoy').addEventListener('click', () => cargar(hoy()));
document.getElementById('form-dia').addEventListener('submit', (ev) => ev.preventDefault());

const pedida = new URLSearchParams(location.search).get('fecha');
cargar(esFechaValida(pedida) ? pedida : hoy());
