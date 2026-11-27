/**
 * agenda.js — Agenda del veterinario (panel/agenda.html), rol 3, Entrega 4
 *
 * Muestra los turnos de un día y permite cambiar su estado sin recargar la página (fetch):
 *   - cambiar de día (anterior, siguiente, hoy o eligiendo la fecha);
 *   - cancelar un turno programado (libera el horario);
 *   - marcar ausente un turno programado de hoy o de un día anterior;
 *   - atender un turno de hoy (abre la consulta del rol 4) o ver la consulta de un turno atendido;
 *   - cargar un turno nuevo o reprogramar uno programado (Entrega 5), en el mismo formulario.
 *   - 25/11: un turno puede tener varios motivos. Vacunación y desparasitación dicen cuáles, y solo se
 *     carga si el calendario de la mascota las tiene sin dar (con las dosis anteriores dadas y sin otro
 *     turno para lo mismo). Si no, avisa, con el enlace al calendario. Pacientes lo vuelve a revisar.
 *
 * Contrato de la API: docs/api/contrato-mascotas-turnos.md (repo Pacientes).
 * Seguridad: la guardia de acceso es solo comodidad de interfaz; la autorización real la hace
 * el backend. Todo texto que viene de la API se inserta con el() (textContent), nunca con innerHTML.
 */
import { api, debounce } from './api.js';
import { exigirRol } from './auth.js';
import { confirmar, el, limpiarErrores, mostrarErrores } from './ui.js';
import { textoEstadoTurno, textoMotivos, textoEspecieMascota } from './etiquetas.js';
import { aplicarHorario, horarioDeAtencion } from './horario.js';
import { enlaceDuenio } from './personas.js';
import { precioPara, promocionesDeTurnos, textoPrecio } from './precio-turno.js';
import { enlaceMascota } from './mascota-datos.js';

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

// La hora de Argentina, "HH:MM" (de 00 a 23).
const horaAhora = () => new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

// Se calcula al mediodía UTC para que ningún cambio de hora mueva el día.
function sumarDias(fecha, dias) {
  const d = new Date(fecha + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// "jueves 05/11/2026" (el día de la semana y la fecha en DD/MM/AAAA)
const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const textoDia = (fecha) => `${DIAS_SEMANA[new Date(fecha + 'T12:00:00Z').getUTCDay()]} ${fecha.split('-').reverse().join('/')}`;

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
  mascota.append(enlaceMascota(turno.mascota, el('strong', turno.mascota.nombre)), el('span', textoEspecieMascota(turno.mascota.especie), { class: 'ayuda' }));

  const duenio = el('td');
  // El nombre del dueño lleva a su ficha (datos de contacto y sus mascotas).
  duenio.append(enlaceDuenio(turno.duenio));
  if (turno.duenio.telefono) {
    duenio.append(el('a', turno.duenio.telefono, { class: 'ayuda', href: 'tel:' + turno.duenio.telefono }));
  }

  const celdaEstado = el('td');
  celdaEstado.append(el('span', textoEstadoTurno(turno.estado), { class: CLASE_ESTADO[turno.estado] ?? 'insignia' }));

  // El motivo, y si el turno se sacó en una franja promocionada, su descuento (lo guardó al sacarse).
  const motivo = el('td', textoMotivos(turno));
  if (turno.precio?.descuento) {
    motivo.append(' ', el('span', `${turno.precio.descuento} % off`, { class: 'insignia insignia-promo', title: textoPrecio(turno.precio) }));
  }

  tr.append(el('td', turno.hora), mascota, duenio, motivo, celdaEstado, acciones(turno, tr));
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
    const reprogramar = el('button', 'Reprogramar', {
      type: 'button', class: 'boton boton-borde boton-chico', 'aria-label': `Reprogramar: turno de ${nombre} (${turno.hora})`
    });
    reprogramar.addEventListener('click', () => abrirFormularioTurno(turno));
    td.append(reprogramar);
    td.append(botonEstado(turno, tr, 'cancelar', 'Cancelar', 'boton boton-peligro boton-chico',
      `¿Cancelar el turno de ${nombre} de las ${turno.hora}? El horario queda libre para otro turno.`));
  } else if (turno.consulta_id) {
    const texto = turno.estado === 'EN_ATENCION' ? 'Continuar consulta' : 'Ver consulta';
    td.append(el('a', texto, {
      href: '/panel/consulta.html?id=' + turno.consulta_id, 'aria-label': `${texto} de ${nombre}`
    }));
    // Atendido = consulta finalizada, que ya tiene su factura.
    if (turno.estado === 'ATENDIDO') {
      td.append(el('a', 'Ver factura', {
        href: '/cliente/factura.html?consulta=' + turno.consulta_id, 'aria-label': `Ver la factura de ${nombre} (${turno.hora})`
      }));
    }
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
/* Nuevo turno y reprogramar                                           */
/* ------------------------------------------------------------------ */

const seccionTurno = document.getElementById('seccion-turno');
const formTurno = document.getElementById('form-turno');
const selectMascota = formTurno.elements.mascota_id;

// El rango de la hora sale del horario que configuró la veterinaria (sin esperarlo: mientras
// tanto queda el de siempre, y Pacientes igual valida al guardar).
horarioDeAtencion().then((horario) => aplicarHorario(formTurno.elements.hora, horario, document.getElementById('ayuda-hora')));
const botonGuardarTurno = document.getElementById('guardar-turno');

// El precio que va a guardar el turno: el precio base y, si la fecha y la hora caen en una franja
// promocionada, su descuento (Pacientes lo calcula igual al guardarlo).
const promocionesTurnos = promocionesDeTurnos();
const textoPrecioTurno = document.getElementById('precio-turno');
async function pintarPrecioTurno() {
  const precio = precioPara(await promocionesTurnos, formTurno.elements.fecha.value, formTurno.elements.hora.value);
  if (!precio) {
    textoPrecioTurno.textContent = '';
  } else if (precio.descuento) {
    textoPrecioTurno.textContent = `${precio.nombre} está en promoción: la consulta sale ${textoPrecio(precio)}.`;
  } else {
    textoPrecioTurno.textContent = `Precio de la consulta: ${textoPrecio(precio)}.`;
  }
}
formTurno.elements.fecha.addEventListener('input', pintarPrecioTurno);
formTurno.elements.hora.addEventListener('input', pintarPrecioTurno);
// Al reprogramar solo cambian la fecha y la hora: la mascota y el motivo se ocultan.
const camposSoloAlta = [selectMascota.closest('.campo'), document.getElementById('campo-motivos')];

/* Motivos del turno (25/11): varios; vacunación y desparasitación dicen cuáles, del calendario */

const MOTIVOS_DEL_CALENDARIO = { VACUNACION: 'VACUNA', DESPARASITACION: 'DESPARASITACION' };
const avisoPlan = document.getElementById('aviso-plan');
const fechaCorta = (texto) => texto.split('-').reverse().join('/');
const motivosMarcados = () => [...formTurno.querySelectorAll('input[name="motivo"]:checked')].map((c) => c.value);
const planMarcados = (tipo) => [...document.querySelectorAll(`#campo-${tipo} input:checked`)].map((c) => Number(c.value));
// El calendario de cada mascota, pedido una vez mientras el formulario está abierto.
const calendarios = new Map();
let pedidoCalendario = 0;

// Por qué no se puede sacar el turno para ese ítem del plan (null si se puede). Las mismas reglas que
// Pacientes: estar en el calendario sin dar, sin una dosis anterior sin dar y sin otro turno.
function problemaDelPlan(calendario, item) {
  const { mascota, eventos } = calendario;
  if (eventos.length === 0) {
    return `${mascota.nombre} todavía no tiene calendario sanitario: cargalo primero, con lo que le toca.`;
  }
  const sinDar = eventos.filter((e) => !e.fecha_aplicada);
  const evento = sinDar.find((e) => e.plan_sanitario_id === item.id);
  if (!evento) {
    return `En el calendario de ${mascota.nombre} no figura que se le tenga que dar: ${item.nombre}. Cargala primero en el calendario.`;
  }
  const ordenDe = new Map(calendario.plan.map((p) => [p.id, p]));
  const anterior = sinDar.find((e) => {
    const p = ordenDe.get(e.plan_sanitario_id);
    return p && p.aplicacion === item.aplicacion && p.orden < item.orden;
  });
  if (anterior) {
    return `Antes de ${item.nombre} tiene que darse ${anterior.nombre}. Si ya se la dieron en otra veterinaria, marcala como dada en el calendario.`;
  }
  if (evento.turno) return `${mascota.nombre} ya tiene turno para ${item.nombre} el ${fechaCorta(evento.turno.fecha)}.`;
  return null;
}

// Cómo está cada ítem en el calendario: "vencida el 20/10/2026", "le toca el 05/12/2026"...
function estadoEnCalendario(calendario, item) {
  const eventos = calendario.eventos.filter((e) => e.plan_sanitario_id === item.id);
  const sinDar = eventos.find((e) => !e.fecha_aplicada);
  if (sinDar) return sinDar.estado === 'VENCIDO' ? `vencida el ${fechaCorta(sinDar.fecha_programada)}` : `le toca el ${fechaCorta(sinDar.fecha_programada)}`;
  if (eventos.length) return 'ya dada';
  return 'no está en el calendario';
}

// Muestra la lista de vacunas y la de desparasitaciones si su motivo está marcado, con el estado de cada
// una en el calendario de la mascota elegida.
async function pintarPlan() {
  const marcados = motivosMarcados();
  const tipos = Object.entries(MOTIVOS_DEL_CALENDARIO).filter(([motivo]) => marcados.includes(motivo)).map(([, tipo]) => tipo);
  for (const tipo of Object.values(MOTIVOS_DEL_CALENDARIO)) {
    document.getElementById('campo-' + tipo).hidden = !tipos.includes(tipo) || reprogramando !== null;
  }
  avisoPlan.replaceChildren();
  document.getElementById('error-plan_sanitario_id').textContent = '';
  botonGuardarTurno.disabled = false;
  if (tipos.length === 0 || reprogramando !== null) return;

  const listas = tipos.map((tipo) => document.querySelector(`#campo-${tipo} .lista-plan`));
  const mascotaId = selectMascota.value;
  if (!mascotaId) {
    for (const lista of listas) lista.replaceChildren(el('p', 'Primero elegí la mascota.', { class: 'ayuda' }));
    return;
  }

  const pedido = ++pedidoCalendario;
  let calendario = calendarios.get(mascotaId);
  if (!calendario) {
    for (const lista of listas) lista.replaceChildren(el('p', 'Cargando el calendario…', { class: 'ayuda' }));
    try {
      calendario = await api(`/api/pacientes/mascotas/${encodeURIComponent(mascotaId)}/calendario-sanitario`);
      calendarios.set(mascotaId, calendario);
    } catch {
      if (pedido !== pedidoCalendario) return;
      for (const lista of listas) lista.replaceChildren(el('p', 'No se pudo cargar el calendario.', { class: 'campo-error' }));
      return;
    }
  }
  if (pedido !== pedidoCalendario) return;

  for (const tipo of tipos) {
    const lista = document.querySelector(`#campo-${tipo} .lista-plan`);
    const elegidos = new Set(planMarcados(tipo));
    const items = calendario.plan.filter((p) => p.tipo === tipo);
    lista.replaceChildren(...items.map((p) => {
      const casilla = el('input', '', { type: 'checkbox', value: p.id });
      casilla.checked = elegidos.has(p.id);
      casilla.addEventListener('change', revisarPlan);
      const label = el('label', '', { class: 'casilla' });
      label.append(casilla, ' ' + p.nombre, el('span', `(${estadoEnCalendario(calendario, p)})`, { class: 'ayuda' }));
      return label;
    }));
    // Si hay una sola que se puede dar, queda marcada.
    const posibles = items.filter((p) => problemaDelPlan(calendario, p) === null);
    if (elegidos.size === 0 && posibles.length === 1) {
      lista.querySelector(`input[value="${posibles[0].id}"]`).checked = true;
    }
  }
  revisarPlan();
}

// Avisa si alguna de las marcadas no se puede dar, con el enlace al calendario de la mascota, y no deja guardar.
function revisarPlan() {
  avisoPlan.replaceChildren();
  botonGuardarTurno.disabled = false;
  const calendario = calendarios.get(selectMascota.value);
  if (!calendario) return;
  const problemas = Object.values(MOTIVOS_DEL_CALENDARIO)
    .filter((tipo) => !document.getElementById('campo-' + tipo).hidden)
    .flatMap((tipo) => planMarcados(tipo))
    .map((id) => problemaDelPlan(calendario, calendario.plan.find((p) => p.id === id)))
    .filter(Boolean);
  if (problemas.length === 0) return;
  for (const problema of problemas) avisoPlan.append(el('span', problema + ' ', { class: 'campo-error' }));
  avisoPlan.append(el('a', `Abrir el calendario de ${calendario.mascota.nombre}`, { href: '/cliente/calendario.html?mascota=' + calendario.mascota.id }));
  botonGuardarTurno.disabled = true;
}

// Lo que se manda: [{motivo}, {motivo: 'VACUNACION', plan_sanitario_id}, ...]. Vacunación sin ninguna
// vacuna marcada va sin plan_sanitario_id, así Pacientes responde "Elegí la vacuna".
function motivosParaEnviar() {
  return motivosMarcados().flatMap((motivo) => {
    const tipo = MOTIVOS_DEL_CALENDARIO[motivo];
    if (!tipo) return [{ motivo }];
    const ids = planMarcados(tipo);
    return ids.length ? ids.map((id) => ({ motivo, plan_sanitario_id: id })) : [{ motivo }];
  });
}

formTurno.querySelectorAll('input[name="motivo"]').forEach((c) => c.addEventListener('change', pintarPlan));
selectMascota.addEventListener('change', () => {
  // Otra mascota, otro calendario: las vacunas marcadas no siguen.
  document.querySelectorAll('.lista-plan').forEach((l) => l.replaceChildren());
  pintarPlan();
});
let mascotasCargadas = false;
// Turno que se está reprogramando (null = se está cargando uno nuevo).
let reprogramando = null;

// Abre el formulario. Sin turno, para cargar uno nuevo en el día que se está mirando (o hoy, si ese
// día ya pasó). Con un turno, para reprogramarlo: arranca con su fecha y su hora.
async function abrirFormularioTurno(turno = null) {
  reprogramando = turno;
  formTurno.reset();
  limpiarErrores(formTurno);
  formTurno.elements.fecha.min = hoy();
  for (const campo of camposSoloAlta) campo.hidden = turno !== null;
  document.getElementById('titulo-turno').textContent = turno ? `Reprogramar el turno de ${turno.mascota.nombre}` : 'Nuevo turno';
  botonGuardarTurno.textContent = turno ? 'Guardar cambios' : 'Guardar turno';
  seccionTurno.hidden = false;
  seccionTurno.scrollIntoView({ block: 'nearest' });
  textoPrecioTurno.textContent = '';
  // El calendario se vuelve a pedir cada vez que se abre: pudo cambiar mientras tanto.
  calendarios.clear();
  pintarPlan();

  if (turno) {
    formTurno.elements.fecha.value = turno.fecha >= hoy() ? turno.fecha : hoy();
    formTurno.elements.hora.value = turno.hora;
    pintarPrecioTurno();
    formTurno.elements.fecha.focus();
    return;
  }
  formTurno.elements.fecha.value = inputFecha.value >= hoy() ? inputFecha.value : hoy();

  // La lista de mascotas se pide la primera vez que se abre el formulario.
  if (!mascotasCargadas) await cargarMascotasTurno();
  buscarMascota.focus();
}

// La API trae hasta 100 mascotas por pedido (por nombre). Con más, el buscador pide las que coinciden
// con la mascota o el dueño (GET /api/pacientes/mascotas?buscar=), así ninguna queda afuera (25/11).
const buscarMascota = document.getElementById('buscar-mascota');
let pedidoMascotas = 0;

async function cargarMascotasTurno(buscar = '') {
  const pedido = ++pedidoMascotas;
  const elegida = selectMascota.value;
  try {
    const { mascotas } = await api('/api/pacientes/mascotas' + (buscar ? '?buscar=' + encodeURIComponent(buscar) : ''));
    if (pedido !== pedidoMascotas) return;
    const primera = el('option', mascotas.length || !buscar ? 'Elegí la mascota' : `Ninguna mascota coincide con "${buscar}"`, { value: '' });
    selectMascota.replaceChildren(primera, ...mascotas.map((m) => el('option',
      `${m.nombre} (${textoEspecieMascota(m.especie)}) · ${m.duenio.nombre}`, { value: m.id })));
    if ([...selectMascota.options].some((o) => o.value === elegida)) selectMascota.value = elegida;
    // Si la búsqueda deja una sola mascota, queda elegida.
    if (buscar && mascotas.length === 1) selectMascota.value = String(mascotas[0].id);
    mascotasCargadas = true;
    pintarPlan();
  } catch {
    if (pedido !== pedidoMascotas) return;
    mostrarErrores(formTurno, {}, 'No se pudo cargar la lista de mascotas.');
  }
}

buscarMascota.addEventListener('input', debounce(() => cargarMascotasTurno(buscarMascota.value.trim().slice(0, 80)), 300));

document.getElementById('nuevo-turno').addEventListener('click', () => abrirFormularioTurno());
document.getElementById('cancelar-turno').addEventListener('click', () => {
  seccionTurno.hidden = true;
  reprogramando = null;
});

formTurno.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  limpiarErrores(formTurno);
  botonGuardarTurno.disabled = true;                        // un doble clic no carga dos turnos
  const fecha = formTurno.elements.fecha.value;
  const hora = formTurno.elements.hora.value;
  // Hoy, una hora que ya pasó no vale (27/11, la misma regla que Pacientes): se avisa sin pedir nada.
  const ahora = horaAhora();
  if (fecha === hoy() && hora && hora < ahora) {
    mostrarErrores(formTurno, { hora: `Esa hora ya pasó: hoy el turno tiene que ser a las ${ahora} o después` });
    formTurno.elements.hora.focus();
    botonGuardarTurno.disabled = false;
    return;
  }
  try {
    // Reprogramar: POST /api/pacientes/turnos/{id}/reprogramar con la fecha y la hora.
    // Nuevo: POST /api/pacientes/turnos (el veterinario es el de la sesión). Los dos responden { turno }.
    const { turno } = reprogramando
      ? await api(`${API}/${reprogramando.id}/reprogramar`, { metodo: 'POST', cuerpo: { fecha, hora } })
      : await api(API, {
        metodo: 'POST',
        cuerpo: { mascota_id: Number(selectMascota.value), fecha, hora, motivos: motivosParaEnviar() }
      });
    const accion = reprogramando ? 'Turno reprogramado' : 'Turno cargado';
    seccionTurno.hidden = true;
    reprogramando = null;
    // Se muestra el día del turno, que aparece en la agenda sin recargar la página.
    await cargar(turno.fecha);
    estado.textContent = `${accion}: ${turno.mascota.nombre}, ${textoDia(turno.fecha)} a las ${turno.hora}.`;
  } catch (e) {
    // 400: un error por campo. 409: ya hay un turno a esa hora (viene en campos.hora), el turno ya no
    // está programado, o la vacuna no se puede dar según el calendario (viene en campos.plan_sanitario_id).
    // 404: la mascota está de baja o el turno no existe.
    const porDefecto = reprogramando ? 'No se pudo reprogramar el turno.' : 'No se pudo cargar el turno.';
    mostrarErrores(formTurno, e.datos?.campos, e.datos?.error ?? porDefecto);
  } finally {
    botonGuardarTurno.disabled = false;
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
