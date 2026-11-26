/**
 * calendario.js — Calendario sanitario de una mascota (cliente/calendario.html), rol 3, Entrega 4
 *
 * Se abre con ?mascota=<id>. Sin ese parámetro, el usuario elige la mascota de la lista: el cliente
 * ve las suyas y el veterinario todas (lo decide el backend). Cambiar de mascota trae su calendario
 * con fetch, sin recargar la página.
 *
 * Entrega 5: la lista trae solo las mascotas con vacunas o desparasitaciones registradas
 * (con_calendario=1). La veterinaria ve el dueño en cada opción y arriba del calendario (con enlace a
 * su ficha), y tiene un buscador por mascota o dueño que vuelve a pedir la lista (buscar=).
 *
 * 25/11: la veterinaria edita el calendario: marca como dada una vacuna que se dio fuera de una
 * consulta (por ejemplo, en otra veterinaria), le cambia la fecha, la quita, o agrega una del plan de
 * la especie. Sin estar en el calendario no se puede sacar un turno para darla. Ve todas las mascotas,
 * no solo las que ya tienen calendario.
 * El calendario no se arma solo: hasta que la veterinaria lo carga, el cliente (también el que adoptó)
 * ve "La veterinaria todavía no cargó el calendario sanitario de esta mascota". Una dosis se agrega con
 * las anteriores de la misma vacuna dadas: las que todavía no se pueden, se ven deshabilitadas.
 *
 * Contrato de la API: docs/api/contrato-calendario.md y contrato-mascotas-turnos.md (repo Pacientes).
 * Seguridad: la guardia de rol la hace guardia-panel.js; la autorización real la hace el backend
 * (404 si la mascota es de otro cliente). Todo texto de la API se inserta con el() (textContent).
 */
import { api, debounce } from './api.js';
import { exigirRol } from './auth.js';
import { confirmar, el, limpiarErrores, mostrarErrores } from './ui.js';
import { hoyArgentina } from './rango-fechas.js';
import { textoEspecieMascota } from './etiquetas.js';
import { enlaceDuenio } from './personas.js';

const usuario = await exigirRol(['CLIENTE', 'VETERINARIO']);
const esVeterinario = usuario.rol === 'VETERINARIO';

const API = '/api/pacientes/mascotas';

const select = document.getElementById('mascota');
const estado = document.getElementById('estado');
const seccion = document.getElementById('calendario');

const TIPOS = { VACUNA: 'Vacuna', DESPARASITACION: 'Desparasitación' };

// Texto y color de cada estado (contrato: APLICADO, VENCIDO, PROXIMO, PENDIENTE).
const ESTADOS = {
  APLICADO: { texto: 'Aplicada', clase: 'insignia insignia-atendido' },
  VENCIDO: { texto: 'Vencida', clase: 'insignia insignia-falta' },
  PROXIMO: { texto: 'Próximamente', clase: 'insignia insignia-bajo' },
  PENDIENTE: { texto: 'Pendiente', clase: 'insignia' }
};

// La API manda AAAA-MM-DD: se muestra como 05/11/2026 sin pasar por Date (evita correr el día por la zona horaria).
const fecha = (texto) => texto.split('-').reverse().join('/');

// Cada carga tiene un número: si se cambia de mascota rápido, se ignoran las respuestas viejas.
let pedidoActual = 0;

/* ------------------------------------------------------------------ */
/* Lista de mascotas                                                   */
/* ------------------------------------------------------------------ */

// "Bobby (Gato)"; para la veterinaria, con el dueño: "Bobby (Gato) · Ana Pérez".
function textoOpcion(m) {
  const texto = `${m.nombre} (${textoEspecieMascota(m.especie)})`;
  return esVeterinario && m.duenio?.nombre ? `${texto} · ${m.duenio.nombre}` : texto;
}

let pedidoLista = 0;

// buscar: lo escrito en el buscador de la veterinaria (vacío = todas).
async function cargarMascotas(elegida, buscar = '') {
  const pedido = ++pedidoLista;
  const primera = select.options[0];
  try {
    // La veterinaria ve todas (puede armarle el calendario a cualquiera); el cliente, las que tienen.
    const parametros = new URLSearchParams(esVeterinario ? {} : { con_calendario: '1' });
    if (buscar) parametros.set('buscar', buscar);
    const { mascotas } = await api(`${API}?${parametros}`);
    if (pedido !== pedidoLista) return;
    select.replaceChildren(primera, ...mascotas.map((m) => el('option', textoOpcion(m), { value: m.id })));
    select.disabled = mascotas.length === 0 && !buscar;
    if (mascotas.length === 0) {
      const conCalendario = esVeterinario ? '' : ' con calendario';
      estado.textContent = buscar ? `Ninguna mascota${conCalendario} coincide con "${buscar}".`
        : (esVeterinario ? 'Todavía no hay mascotas cargadas.' : 'Todavía no hay mascotas con vacunas o desparasitaciones registradas.');
    } else if (!select.value || buscar) {
      estado.textContent = buscar ? `${mascotas.length} mascotas coinciden.` : '';
    }
  } catch {
    if (pedido !== pedidoLista) return;
    estado.textContent = 'No se pudo cargar la lista de mascotas.';
  }

  // Una mascota que no está en la lista (dada de baja, o sin calendario) se puede ver igual por la URL.
  if (elegida && ![...select.options].some((o) => o.value === elegida)) {
    select.append(el('option', 'Mascota ' + elegida, { value: elegida }));
  }
  select.value = elegida ?? '';
}

// El buscador (solo la veterinaria): pide la lista de nuevo mientras escribe, sin perder la elegida.
if (esVeterinario) {
  const buscar = document.getElementById('buscar');
  document.getElementById('campo-buscar').hidden = false;
  buscar.addEventListener('input', debounce(() => {
    cargarMascotas(select.value || null, buscar.value.trim().slice(0, 80));
  }, 300));
}

select.addEventListener('change', () => {
  // La URL queda con la mascota, así recargar o compartir el enlace abre la misma.
  history.replaceState(null, '', select.value ? '?mascota=' + select.value : location.pathname);
  if (select.value) {
    cargarCalendario(select.value);
  } else {
    seccion.hidden = true;
  }
});

/* ------------------------------------------------------------------ */
/* Calendario de una mascota                                           */
/* ------------------------------------------------------------------ */

async function cargarCalendario(id) {
  const pedido = ++pedidoActual;
  estado.textContent = 'Cargando…';
  try {
    const r = await api(`${API}/${encodeURIComponent(id)}/calendario-sanitario`);
    if (pedido !== pedidoActual) return;
    pintar(r);
    estado.textContent = '';
  } catch (e) {
    if (pedido !== pedidoActual) return;
    seccion.hidden = true;
    estado.textContent = e.estado === 404 ? 'No se encontró la mascota.' : 'No se pudo cargar el calendario.';
  }
}

// El calendario que se está mostrando (lo usan las acciones de la veterinaria).
let actual = null;

function pintar(calendario) {
  actual = calendario;
  const { mascota, vacunas_al_dia: alDia, eventos } = calendario;
  document.getElementById('titulo-mascota').textContent = `${mascota.nombre} · ${textoEspecieMascota(mascota.especie)}`;
  document.getElementById('leyenda-tabla').textContent = 'Calendario sanitario de ' + mascota.nombre;
  document.getElementById('enlace-historial').href = '/cliente/historial.html?mascota=' + mascota.id;

  // La veterinaria ve de quién es, con enlace a la ficha del cliente.
  const duenio = document.getElementById('duenio');
  duenio.hidden = !(esVeterinario && mascota.duenio);
  if (!duenio.hidden) document.getElementById('duenio-enlace').replaceChildren(enlaceDuenio(mascota.duenio));

  const aviso = document.getElementById('al-dia');
  aviso.hidden = eventos.length === 0;
  aviso.className = alDia ? 'mensaje mensaje-ok' : 'mensaje mensaje-error';
  aviso.textContent = alDia
    ? 'Tiene las vacunas al día.'
    : 'Tiene vacunas vencidas: pedí un turno de vacunación por WhatsApp.';

  document.getElementById('filas').replaceChildren(...eventos.map(fila));
  document.getElementById('tabla').hidden = eventos.length === 0;
  const vacio = document.getElementById('vacio');
  vacio.hidden = eventos.length > 0;
  vacio.textContent = esVeterinario
    ? `${mascota.nombre} todavía no tiene calendario sanitario: cargá abajo lo que le toca (o lo que ya le dieron, y marcalo como dado).`
    : 'La veterinaria todavía no cargó el calendario sanitario de esta mascota.';
  document.getElementById('col-acciones').hidden = !esVeterinario;
  if (esVeterinario) pintarAgregar(calendario);
  seccion.hidden = false;
}

function fila(evento) {
  const tr = el('tr', '', { 'data-id': evento.id });
  const estadoEvento = ESTADOS[evento.estado] ?? { texto: evento.estado, clase: 'insignia' };

  const celdaEstado = el('td');
  celdaEstado.append(el('span', estadoEvento.texto, { class: estadoEvento.clase }));
  if (evento.fecha_aplicada) {
    // Dada en una consulta de HuellaVet, o cargada a mano (por ejemplo, se la dieron en otra veterinaria).
    const donde = evento.en_consulta === false ? ' (cargada a mano)' : '';
    celdaEstado.append(el('span', 'el ' + fecha(evento.fecha_aplicada) + donde, { class: 'ayuda' }));
  } else if (evento.turno) {
    celdaEstado.append(el('span', 'Turno el ' + fecha(evento.turno.fecha), { class: 'ayuda' }));
  }

  tr.append(el('td', fecha(evento.fecha_programada)), el('td', TIPOS[evento.tipo] ?? evento.tipo), el('td', evento.nombre), celdaEstado);
  if (esVeterinario) tr.append(accionesEvento(evento));
  return tr;
}

/* ------------------------------------------------------------------ */
/* Edición (solo la veterinaria)                                       */
/* ------------------------------------------------------------------ */

const rutaEvento = (evento) => `${API}/${actual.mascota.id}/calendario-sanitario/${evento.id}`;

// Las acciones de una vacuna o desparasitación sin dar: marcarla como dada, cambiarle la fecha o quitarla.
// De una dada que se repite (antirrábica, refuerzo anual, desparasitación): agregar la próxima en la fecha
// sugerida (26/11: ya no se agrega sola al darla).
function accionesEvento(evento) {
  const td = el('td');
  if (evento.fecha_aplicada) {
    if (evento.proxima_sugerida) td.append(accionProxima(evento));
    return td;
  }

  const caja = el('div', '', { class: 'acciones' });
  const error = el('span', '', { class: 'campo-error', role: 'alert' });
  const nombre = evento.nombre;

  const dada = el('button', 'Marcar como dada', { type: 'button', class: 'boton boton-chico', 'aria-label': `Marcar como dada: ${nombre}` });
  dada.addEventListener('click', () => abrirFecha(caja, error, {
    etiqueta: `Fecha en que se dio ${nombre}`, valor: hoyArgentina(), max: hoyArgentina(), boton: 'Guardar',
    enviar: (valor) => api(rutaEvento(evento) + '/dada', { metodo: 'POST', cuerpo: { fecha_aplicada: valor } }),
    listo: `${nombre}: marcada como dada.`,
  }));

  const mover = el('button', 'Cambiar fecha', { type: 'button', class: 'boton boton-borde boton-chico', 'aria-label': `Cambiar la fecha: ${nombre}` });
  mover.addEventListener('click', () => abrirFecha(caja, error, {
    etiqueta: `Nueva fecha para ${nombre}`, valor: evento.fecha_programada >= hoyArgentina() ? evento.fecha_programada : hoyArgentina(),
    min: hoyArgentina(), boton: 'Guardar',
    enviar: (valor) => api(rutaEvento(evento), { metodo: 'PUT', cuerpo: { fecha_programada: valor } }),
    listo: `${nombre}: fecha cambiada.`,
  }));

  const quitar = el('button', 'Quitar', { type: 'button', class: 'boton boton-borde boton-chico', 'aria-label': `Quitar del calendario: ${nombre}` });
  quitar.addEventListener('click', async () => {
    if (!await confirmar(`¿Quitar ${nombre} del calendario de ${actual.mascota.nombre}?`, { aceptar: 'Quitar', peligro: true })) return;
    await guardar(() => api(rutaEvento(evento), { metodo: 'DELETE' }), error, `${nombre}: quitada del calendario.`);
  });

  caja.append(dada, mover, quitar, error);
  td.append(caja);
  return td;
}

// "Agregar la próxima": la misma vacuna o desparasitación en la fecha sugerida (si ya pasó, hoy). Se
// puede cambiar la fecha antes de guardar.
function accionProxima(evento) {
  const caja = el('div', '', { class: 'acciones' });
  const error = el('span', '', { class: 'campo-error', role: 'alert' });
  const sugerida = evento.proxima_sugerida >= hoyArgentina() ? evento.proxima_sugerida : hoyArgentina();
  const boton = el('button', 'Agregar la próxima', {
    type: 'button', class: 'boton boton-borde boton-chico',
    'aria-label': `Agregar la próxima dosis de ${evento.nombre} (sugerida para el ${fecha(sugerida)})`,
  });
  boton.addEventListener('click', () => abrirFecha(caja, error, {
    etiqueta: `Fecha de la próxima dosis de ${evento.nombre}`, valor: sugerida, min: hoyArgentina(), boton: 'Agregar',
    enviar: (valor) => api(`${API}/${actual.mascota.id}/calendario-sanitario`, {
      metodo: 'POST', cuerpo: { plan_sanitario_id: evento.plan_sanitario_id, fecha_programada: valor },
    }),
    listo: `${evento.nombre}: próxima dosis agregada al calendario.`,
  }));
  caja.append(el('span', 'Próxima sugerida: ' + fecha(evento.proxima_sugerida), { class: 'ayuda' }), boton, error);
  return caja;
}

// Cambia los botones de la fila por un campo de fecha con Guardar y Volver.
function abrirFecha(caja, error, { etiqueta, valor, min, max, boton, enviar, listo }) {
  const botones = [...caja.querySelectorAll('button')];
  botones.forEach((b) => { b.hidden = true; });
  const form = el('form', '', { class: 'form-stock', novalidate: '' });
  const input = el('input', '', { type: 'date', 'aria-label': etiqueta, required: '' });
  input.value = valor;
  if (min) input.min = min;
  if (max) input.max = max;
  const ok = el('button', boton, { type: 'submit', class: 'boton boton-chico' });
  const volver = el('button', 'Volver', { type: 'button', class: 'boton boton-borde boton-chico' });
  volver.addEventListener('click', () => { form.remove(); error.textContent = ''; botones.forEach((b) => { b.hidden = false; }); });
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!input.value) { error.textContent = 'Elegí la fecha.'; return; }
    ok.disabled = true;
    if (!await guardar(() => enviar(input.value), error, listo)) ok.disabled = false;
  });
  form.append(input, ok, volver);
  caja.insertBefore(form, error);
  input.focus();
}

// Manda la edición: cada una responde el calendario completo, que se vuelve a pintar.
async function guardar(pedido, error, listo) {
  error.textContent = '';
  try {
    pintar(await pedido());
    estado.textContent = listo;
    return true;
  } catch (e) {
    error.textContent = e.datos?.error ?? 'No se pudo guardar el cambio.';
    return false;
  }
}

// El formulario "Agregar al calendario": los ítems del plan de la especie. Los que ya tiene sin dar
// no se ofrecen (para esos se cambia la fecha), ni los de una sola vez que ya se dio.
const formAgregar = document.getElementById('form-agregar');
const selectPlan = formAgregar.elements.plan_sanitario_id;

function pintarAgregar({ eventos, plan = [] }) {
  const sinDar = new Set(eventos.filter((e) => !e.fecha_aplicada).map((e) => e.plan_sanitario_id));
  const dados = new Set(eventos.filter((e) => e.fecha_aplicada).map((e) => e.plan_sanitario_id));
  const disponibles = plan.filter((p) => !sinDar.has(p.id) && !(dados.has(p.id) && p.se_repite_cada_meses === null));

  // Las dosis anteriores de la misma vacuna que todavía no están dadas (la 1.ª y la 2.ª antes de la 3.ª).
  const faltanAntes = (p) => plan.filter((q) => q.aplicacion === p.aplicacion && q.orden < p.orden && !dados.has(q.id));

  const grupos = [['VACUNA', 'Vacunas'], ['DESPARASITACION', 'Desparasitaciones']].map(([tipo, titulo]) => {
    const grupo = el('optgroup', '', { label: titulo });
    grupo.append(...disponibles.filter((p) => p.tipo === tipo).map((p) => {
      const faltan = faltanAntes(p);
      const texto = (p.automatico ? p.nombre : `${p.nombre} (opcional)`)
        + (faltan.length ? ` — primero, dadas: ${faltan.map((q) => q.nombre).join(', ')}` : '');
      const opcion = el('option', texto, { value: p.id });
      opcion.disabled = faltan.length > 0;
      return opcion;
    }));
    return grupo;
  }).filter((g) => g.children.length > 0);

  selectPlan.replaceChildren(el('option', disponibles.length ? 'Elegí cuál' : 'Ya tiene todo el plan en el calendario', { value: '' }), ...grupos);
  planActual = plan;
  formAgregar.elements.fecha_programada.value = hoyArgentina();
  ajustarFechaMinima();
  formAgregar.hidden = plan.length === 0;
}

// La fecha mínima del ítem elegido (26/11): la API la calcula con la dosis anterior dada y los días
// mínimos de Configuración → Vacunas. El campo no deja elegir antes, y la ayuda dice desde cuándo.
let planActual = [];
function ajustarFechaMinima() {
  const item = planActual.find((p) => String(p.id) === selectPlan.value);
  const input = formAgregar.elements.fecha_programada;
  const ayuda = document.getElementById('ayuda-fecha_programada');
  const minima = item?.fecha_minima && item.fecha_minima > hoyArgentina() ? item.fecha_minima : hoyArgentina();
  input.min = minima;
  if (input.value < minima) input.value = minima;
  ayuda.textContent = item?.fecha_minima && item.fecha_minima > hoyArgentina()
    ? `Por la dosis anterior, se puede dar desde el ${fecha(item.fecha_minima)} (días mínimos de Configuración → Vacunas).`
    : '';
}
selectPlan.addEventListener('change', ajustarFechaMinima);

formAgregar.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  limpiarErrores(formAgregar);
  const boton = document.getElementById('agregar');
  const nombre = selectPlan.selectedOptions[0]?.textContent ?? '';
  boton.disabled = true;
  try {
    const r = await api(`${API}/${actual.mascota.id}/calendario-sanitario`, {
      metodo: 'POST',
      cuerpo: { plan_sanitario_id: Number(selectPlan.value) || null, fecha_programada: formAgregar.elements.fecha_programada.value },
    });
    pintar(r);
    estado.textContent = `${nombre}: agregada al calendario.`;
  } catch (e) {
    mostrarErrores(formAgregar, e.datos?.campos, e.datos?.error ?? 'No se pudo agregar.');
  } finally {
    boton.disabled = false;
  }
});

/* ------------------------------------------------------------------ */
/* Inicio                                                              */
/* ------------------------------------------------------------------ */

const pedida = new URLSearchParams(location.search).get('mascota');
const elegida = pedida && /^\d+$/.test(pedida) ? pedida : null;

await cargarMascotas(elegida);
if (elegida) cargarCalendario(elegida);
