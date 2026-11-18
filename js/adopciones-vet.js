/**
 * adopciones-vet.js — Adopciones y rescatistas de la veterinaria (panel/adopciones.html), rol 3, Entrega 5
 *
 * - Rescatistas por aprobar: aprobar o rechazar (Backend, /api/rescatistas).
 * - Publicaciones por revisar: aprobar o rechazar con motivo.
 * - Adopciones en curso: programar el chequeo (crea el turno en la agenda y lo asocia), completar la
 *   adopción cuando el chequeo está atendido (la mascota pasa al adoptante) o cancelarla.
 * - Adopciones finalizadas.
 * Contrato: docs/api/contrato-adopciones.md (repo Adopciones). Todo texto de la API va con el().
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { confirmar, el } from './ui.js';
import { textoEspecieMascota } from './etiquetas.js';
import { edad, fecha, insignia, mensajeDeError } from './etiquetas-adopciones.js';

await exigirRol(['VETERINARIO']);

// "Hoy" de Argentina, para no dejar elegir un chequeo en el pasado.
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());

// Llena una tabla (o avisa que está vacía).
function pintarTabla(nombre, filas, vacio) {
  document.getElementById('filas-' + nombre).replaceChildren(...filas);
  document.getElementById('tabla-' + nombre).hidden = filas.length === 0;
  document.getElementById('estado-' + nombre).textContent = filas.length ? '' : vacio;
}

// Botón que hace un POST y, si sale bien, recarga todo. Los errores van al <span> de la fila.
function botonAccion(texto, { ruta, cuerpo = null, pregunta = null, peligro = false, error, clase = 'boton boton-chico' }) {
  const boton = el('button', texto, { type: 'button', class: clase });
  boton.addEventListener('click', async () => {
    if (pregunta && !await confirmar(pregunta, { aceptar: texto, peligro })) return;
    boton.disabled = true;
    error.textContent = '';
    try {
      await api(ruta, { metodo: 'POST', cuerpo });
      cargarTodo();
    } catch (e) {
      error.textContent = mensajeDeError(e, 'No se pudo hacer. Probá de nuevo.');
      boton.disabled = false;
    }
  });
  return boton;
}

/* ---------- Rescatistas ---------- */

async function cargarRescatistas() {
  try {
    const { rescatistas } = await api('/api/rescatistas');
    pintarTabla('rescatistas', rescatistas.map((r) => {
      const tr = el('tr');
      const contacto = el('td');
      contacto.append(el('span', r.email), el('span', r.telefono ?? '', { class: 'ayuda' }));
      const celda = el('td');
      const acciones = el('div', '', { class: 'acciones' });
      const error = el('span', '', { class: 'campo-error', role: 'alert' });
      acciones.append(
        botonAccion('Aprobar', { ruta: `/api/rescatistas/${r.id}/aprobar`, error }),
        botonAccion('Rechazar', { ruta: `/api/rescatistas/${r.id}/rechazar`, error, peligro: true, clase: 'boton boton-borde boton-chico', pregunta: `¿Rechazar la cuenta de ${r.nombre}? No va a poder publicar.` }),
        error
      );
      celda.append(acciones);
      tr.append(el('td', r.nombre), el('td', r.organizacion ?? '—'), contacto, celda);
      return tr;
    }), 'No hay rescatistas esperando la aprobación.');
  } catch {
    document.getElementById('estado-rescatistas').textContent = 'No se pudieron cargar los rescatistas.';
  }
}

/* ---------- Moderación ---------- */

async function cargarModeracion() {
  const estado = document.getElementById('estado-moderacion');
  try {
    const { publicaciones } = await api('/api/adopciones/moderacion');
    document.getElementById('publicaciones').replaceChildren(...publicaciones.map(tarjetaModeracion));
    estado.textContent = publicaciones.length ? '' : 'No hay publicaciones por revisar.';
  } catch {
    estado.textContent = 'No se pudieron cargar las publicaciones.';
  }
}

function tarjetaModeracion(publicacion) {
  const { mascota, rescatista } = publicacion;
  const articulo = el('article', '', { class: 'tarjeta tarjeta-adopcion' });
  articulo.append(el('img', '', {
    src: `/api/adopciones/publicaciones/${publicacion.id}/foto`,
    alt: 'Foto de ' + mascota.nombre, width: '400', height: '300', loading: 'lazy'
  }));
  const cuerpo = el('div', '', { class: 'cuerpo' });
  cuerpo.append(
    el('h3', publicacion.titulo),
    el('p', [mascota.nombre, textoEspecieMascota(mascota.especie), edad(mascota.edad_meses)].join(' · '), { class: 'datos' }),
    el('p', publicacion.descripcion),
    el('p', 'Rescatista: ' + rescatista.nombre + (rescatista.organizacion ? ` (${rescatista.organizacion})` : ''), { class: 'datos' })
  );

  const error = el('span', '', { class: 'campo-error', role: 'alert' });
  const acciones = el('div', '', { class: 'acciones' });
  acciones.append(botonAccion('Aprobar', { ruta: `/api/adopciones/publicaciones/${publicacion.id}/aprobar`, error }));

  // Rechazar pide el motivo, que el rescatista ve en sus publicaciones.
  const formRechazo = el('form', '', { class: 'form-linea', novalidate: '' });
  const etiqueta = el('label', 'Motivo del rechazo');
  const motivo = el('input', '', { type: 'text', name: 'motivo', maxlength: '255', required: '' });
  etiqueta.append(motivo);
  formRechazo.append(etiqueta, el('button', 'Rechazar', { type: 'submit', class: 'boton boton-borde boton-chico' }));
  formRechazo.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    try {
      await api(`/api/adopciones/publicaciones/${publicacion.id}/rechazar`, { metodo: 'POST', cuerpo: { motivo: motivo.value.trim() } });
      cargarTodo();
    } catch (e) {
      error.textContent = e?.datos?.campos?.motivo ?? mensajeDeError(e, 'No se pudo rechazar.');
    }
  });

  cuerpo.append(acciones, formRechazo, error);
  articulo.append(cuerpo);
  return articulo;
}

/* ---------- Adopciones en curso ---------- */

async function cargarEnCurso() {
  try {
    const { adopciones } = await api('/api/adopciones');
    pintarTabla('curso', adopciones.map(filaEnCurso), 'No hay adopciones en curso.');
  } catch {
    document.getElementById('estado-curso').textContent = 'No se pudieron cargar las adopciones.';
  }
}

function filaEnCurso(adopcion) {
  const { publicacion, adoptante, turno_chequeo: turno } = adopcion;
  const tr = el('tr');

  const animal = el('td');
  animal.append(el('strong', publicacion.mascota.nombre), el('span', 'Rescatista: ' + publicacion.rescatista.nombre, { class: 'ayuda' }));
  const celdaEstado = el('td');
  celdaEstado.append(insignia(adopcion.estado));
  if (adopcion.estado === 'CON_POSTULANTES') {
    celdaEstado.append(el('span', `${publicacion.adopcion.postulaciones_pendientes} postulación(es) sin revisar`, { class: 'ayuda' }));
  }

  const celdaAdoptante = el('td');
  if (adoptante) celdaAdoptante.append(el('span', adoptante.nombre), el('span', adoptante.telefono ?? '', { class: 'ayuda' }));
  else celdaAdoptante.textContent = '—';

  const celdaChequeo = el('td');
  if (turno) celdaChequeo.append(el('span', `${fecha(turno.fecha)} ${turno.hora}`), insignia(turno.estado));
  else celdaChequeo.textContent = '—';

  const celda = el('td');
  const acciones = el('div', '', { class: 'acciones' });
  const error = el('span', '', { class: 'campo-error', role: 'alert' });
  const sinChequeoVigente = adopcion.estado === 'ADOPTANTE_ELEGIDO'
    || (adopcion.estado === 'CHEQUEO_PENDIENTE' && ['CANCELADO', 'AUSENTE'].includes(turno?.estado));

  if (sinChequeoVigente) acciones.append(formChequeo(adopcion, error));
  if (adopcion.estado === 'CHEQUEO_PENDIENTE' && turno?.estado === 'ATENDIDO') {
    acciones.append(botonAccion('Completar adopción', {
      ruta: `/api/adopciones/${adopcion.id}/completar`, error,
      pregunta: `¿Completar la adopción? ${publicacion.mascota.nombre} pasa a ser de ${adoptante.nombre}, con su ficha y su historial.`
    }));
  } else if (adopcion.estado === 'CHEQUEO_PENDIENTE' && turno?.estado === 'PROGRAMADO') {
    acciones.append(el('a', 'Atender en la agenda', { href: '/panel/agenda.html' }));
  }
  acciones.append(botonAccion('Cancelar', {
    ruta: `/api/adopciones/${adopcion.id}/cancelar`, error, peligro: true, clase: 'boton boton-borde boton-chico',
    pregunta: `¿Cancelar la adopción de ${publicacion.mascota.nombre}? Si había un chequeo programado, cancelalo también en la agenda.`
  }), error);
  celda.append(acciones);

  tr.append(animal, celdaEstado, celdaAdoptante, celdaChequeo, celda);
  return tr;
}

// Programar el chequeo: crea el turno CHEQUEO_ADOPCION en la agenda y lo asocia a la adopción.
function formChequeo(adopcion, error) {
  const form = el('form', '', { class: 'form-linea', novalidate: '' });
  const etiquetaFecha = el('label', 'Día');
  const inputFecha = el('input', '', { type: 'date', name: 'fecha', min: hoy, value: hoy, required: '' });
  etiquetaFecha.append(inputFecha);
  const etiquetaHora = el('label', 'Hora');
  const inputHora = el('input', '', { type: 'time', name: 'hora', min: '08:00', max: '19:59', step: '600', required: '' });
  etiquetaHora.append(inputHora);
  form.append(etiquetaFecha, etiquetaHora, el('button', 'Programar chequeo', { type: 'submit', class: 'boton boton-chico' }));

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    error.textContent = '';
    const boton = form.querySelector('button');
    boton.disabled = true;
    try {
      const { turno } = await api('/api/pacientes/turnos', {
        metodo: 'POST',
        cuerpo: { mascota_id: adopcion.publicacion.mascota.id, fecha: inputFecha.value, hora: inputHora.value, motivo: 'CHEQUEO_ADOPCION' }
      });
      await api(`/api/adopciones/${adopcion.id}/chequeo`, { metodo: 'POST', cuerpo: { turno_id: turno.id } });
      cargarTodo();
    } catch (e) {
      const campos = e?.datos?.campos ?? {};
      error.textContent = campos.hora ?? campos.fecha ?? campos.turno_id ?? mensajeDeError(e, 'No se pudo programar el chequeo.');
      boton.disabled = false;
    }
  });
  return form;
}

/* ---------- Finalizadas ---------- */

async function cargarFinalizadas() {
  try {
    const { adopciones } = await api('/api/adopciones?estado=FINALIZADA');
    pintarTabla('finalizadas', adopciones.reverse().map((a) => {
      const tr = el('tr');
      tr.append(
        el('td', a.publicacion.mascota.nombre),
        el('td', a.adoptante?.nombre ?? '—'),
        el('td', a.publicacion.rescatista.nombre),
        el('td', fecha(a.fecha_fin))
      );
      return tr;
    }), 'Todavía no hay adopciones finalizadas.');
  } catch {
    document.getElementById('estado-finalizadas').textContent = 'No se pudieron cargar las adopciones finalizadas.';
  }
}

function cargarTodo() {
  return Promise.all([cargarRescatistas(), cargarModeracion(), cargarEnCurso(), cargarFinalizadas()]);
}

// Si se llega con un ancla (por ejemplo #en-curso, desde la consulta de un chequeo), se baja hasta la
// sección cuando todo terminó de cargar: antes, las otras secciones la corren hacia abajo.
await cargarTodo();
const destino = location.hash ? document.getElementById(location.hash.slice(1)) : null;
if (destino) destino.scrollIntoView();
