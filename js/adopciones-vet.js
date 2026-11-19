/**
 * adopciones-vet.js — Adopciones y rescatistas de la veterinaria (panel/adopciones.html), rol 3, Entrega 5
 *
 * Cuatro pestañas (la activa viaja en el hash, así los enlaces de otras pantallas caen en la correcta):
 * - Rescatistas: aprobar o rechazar las cuentas (Backend, /api/rescatistas).
 * - Publicaciones por revisar: aprobar o rechazar con motivo.
 * - En curso: programar el chequeo (crea el turno en la agenda y lo asocia), completar la adopción
 *   cuando el chequeo está atendido (la mascota pasa al adoptante) o cancelarla. Con búsqueda.
 * - Finalizadas: las adoptadas o las canceladas, filtradas por fecha (arranca en los últimos 30 días)
 *   y por nombre.
 * Las dos listas de adopciones vienen de a 20 (la API pagina) y cada fila enlaza a su detalle
 * (panel/adopcion.html). Contrato: docs/api/contrato-adopciones.md (repo Adopciones).
 * Todo texto de la API va con el().
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { confirmar, el } from './ui.js';
import { textoEspecieMascota } from './etiquetas.js';
import { edad, fecha, insignia, mensajeDeError } from './etiquetas-adopciones.js';
import { activarPestanas } from './pestanas.js';

await exigirRol(['VETERINARIO']);

const POR_PAGINA = 20;
const $ = (id) => document.getElementById(id);

// "Hoy" de Argentina (AAAA-MM-DD), para no dejar elegir un chequeo en el pasado y para el filtro.
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
function haceDias(dias) {
  const d = new Date(hoy + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

const enlaceDetalle = (adopcion) => el('a', 'Ver detalle', {
  href: '/panel/adopcion.html?id=' + adopcion.id,
  'aria-label': 'Ver el detalle de la adopción de ' + adopcion.publicacion.mascota.nombre
});

const cantidad = (n) => (n === 1 ? '1 adopción' : `${n} adopciones`);

// Llena una tabla (o avisa que está vacía).
function pintarTabla(nombre, filas, textoEstado) {
  $('filas-' + nombre).replaceChildren(...filas);
  $('tabla-' + nombre).hidden = filas.length === 0;
  $('estado-' + nombre).textContent = textoEstado;
}

// El número de la pestaña (vacío si es 0, para no llenar de ceros).
function contar(nombre, n) {
  $('cuenta-' + nombre).textContent = n > 0 ? `(${n})` : '';
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

// "Anterior" y "Siguiente" de una lista paginada. alIr recibe -1 o 1.
// Devuelve una función que actualiza los botones con lo que respondió la API.
function paginador(nombre, alIr) {
  const nav = $('paginas-' + nombre);
  nav.addEventListener('click', (ev) => {
    const boton = ev.target.closest('[data-ir]');
    if (boton) alIr(Number(boton.dataset.ir));
  });
  return ({ total, pagina, por_pagina: porPagina }) => {
    const paginas = Math.max(1, Math.ceil(total / porPagina));
    nav.hidden = paginas <= 1;
    nav.querySelector('span').textContent = `Página ${pagina} de ${paginas}`;
    nav.querySelector('[data-ir="-1"]').disabled = pagina <= 1;
    nav.querySelector('[data-ir="1"]').disabled = pagina >= paginas;
  };
}

// Pide una página de adopciones. Si la página quedó vacía (por ejemplo, se completó la única de la
// última página) vuelve a la anterior.
async function pedirPagina(filtros, estadoLista) {
  const query = new URLSearchParams({ por_pagina: String(POR_PAGINA), pagina: String(estadoLista.pagina) });
  for (const [clave, valor] of Object.entries(filtros)) if (valor) query.set(clave, valor);
  const respuesta = await api('/api/adopciones?' + query);
  if (respuesta.adopciones.length === 0 && estadoLista.pagina > 1) {
    estadoLista.pagina = Math.max(1, Math.ceil(respuesta.total / POR_PAGINA));
    return pedirPagina(filtros, estadoLista);
  }
  return respuesta;
}

// El primer error de un 400 de filtros, o un texto general.
const errorDeFiltro = (e, porDefecto) => Object.values(e?.datos?.campos ?? {})[0] ?? mensajeDeError(e, porDefecto);

/* ---------- Rescatistas ---------- */

async function cargarRescatistas() {
  try {
    const { rescatistas } = await api('/api/rescatistas');
    contar('rescatistas', rescatistas.length);
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
    }), rescatistas.length ? '' : 'No hay rescatistas esperando la aprobación.');
  } catch {
    $('estado-rescatistas').textContent = 'No se pudieron cargar los rescatistas.';
  }
}

/* ---------- Moderación ---------- */

async function cargarModeracion() {
  const estado = $('estado-moderacion');
  try {
    const { publicaciones } = await api('/api/adopciones/moderacion');
    contar('moderacion', publicaciones.length);
    $('publicaciones').replaceChildren(...publicaciones.map(tarjetaModeracion));
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

const curso = { pagina: 1, buscar: '' };
const paginasCurso = paginador('curso', (paso) => { curso.pagina += paso; cargarEnCurso(); });

async function cargarEnCurso() {
  $('error-curso').textContent = '';
  try {
    const respuesta = await pedirPagina({ buscar: curso.buscar }, curso);
    // El número de la pestaña cuenta todas las en curso, sin la búsqueda.
    if (!curso.buscar) contar('curso', respuesta.total);
    const vacio = curso.buscar ? 'Ninguna adopción en curso coincide con la búsqueda.' : 'No hay adopciones en curso.';
    pintarTabla('curso', respuesta.adopciones.map(filaEnCurso), respuesta.total ? cantidad(respuesta.total) + ' en curso.' : vacio);
    paginasCurso(respuesta);
  } catch (e) {
    $('estado-curso').textContent = '';
    $('error-curso').textContent = errorDeFiltro(e, 'No se pudieron cargar las adopciones.');
  }
}

$('filtro-curso').addEventListener('submit', (ev) => {
  ev.preventDefault();
  curso.buscar = ev.target.elements.buscar.value.trim();
  curso.pagina = 1;
  cargarEnCurso();
});

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
  acciones.append(enlaceDetalle(adopcion), botonAccion('Cancelar', {
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

/* ---------- Finalizadas (y canceladas) ---------- */

const formFinalizadas = $('filtro-finalizadas');
const finalizadas = { pagina: 1, cargada: false };
const paginasFinalizadas = paginador('finalizadas', (paso) => { finalizadas.pagina += paso; cargarFinalizadas(); });

// Arranca en los últimos 30 días.
formFinalizadas.elements.desde.value = haceDias(30);
formFinalizadas.elements.hasta.value = hoy;

async function cargarFinalizadas() {
  finalizadas.cargada = true;
  $('error-finalizadas').textContent = '';
  const campos = formFinalizadas.elements;
  const filtros = {
    estado: campos.estado.value, desde: campos.desde.value, hasta: campos.hasta.value, buscar: campos.buscar.value.trim()
  };
  try {
    const respuesta = await pedirPagina(filtros, finalizadas);
    const terminadas = filtros.estado === 'CANCELADA' ? 'canceladas' : 'finalizadas';
    const resumen = respuesta.total === 1 ? `1 adopción ${terminadas.slice(0, -1)}.` : `${respuesta.total} adopciones ${terminadas}.`;
    pintarTabla('finalizadas', respuesta.adopciones.map((a) => {
      const tr = el('tr');
      const detalle = el('td');
      detalle.append(enlaceDetalle(a));
      tr.append(
        el('td', a.publicacion.mascota.nombre),
        el('td', a.adoptante?.nombre ?? '—'),
        el('td', a.publicacion.rescatista.nombre),
        el('td', fecha(a.fecha_inicio)),
        el('td', fecha(a.fecha_fin)),
        detalle
      );
      return tr;
    }), respuesta.total ? resumen : `No hay adopciones ${terminadas} con estos filtros.`);
    paginasFinalizadas(respuesta);
  } catch (e) {
    $('estado-finalizadas').textContent = '';
    $('error-finalizadas').textContent = errorDeFiltro(e, 'No se pudieron cargar las adopciones.');
  }
}

formFinalizadas.addEventListener('submit', (ev) => {
  ev.preventDefault();
  finalizadas.pagina = 1;
  cargarFinalizadas();
});
// Cambiar entre adoptadas y canceladas filtra en el momento.
formFinalizadas.elements.estado.addEventListener('change', () => formFinalizadas.requestSubmit());

/* ---------- Carga y pestañas ---------- */

// Después de una acción se recarga todo lo que pudo cambiar. Las finalizadas, solo si ya se abrieron.
function cargarTodo() {
  const pedidos = [cargarRescatistas(), cargarModeracion(), cargarEnCurso()];
  if (finalizadas.cargada) pedidos.push(cargarFinalizadas());
  return Promise.all(pedidos);
}

const VISTAS = ['rescatistas', 'moderacion', 'en-curso', 'finalizadas'];
const vistaDelHash = () => (VISTAS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'en-curso');
let iniciando = true;

const elegir = activarPestanas($('pestanas'), (vista) => {
  // La pestaña queda en la URL sin sumar entradas al historial.
  if (!iniciando) history.replaceState(null, '', '#' + vista);
  if (vista === 'finalizadas' && !finalizadas.cargada) cargarFinalizadas();
});
window.addEventListener('hashchange', () => elegir(vistaDelHash()));

// Las tres primeras se cargan enseguida: sus números se ven en las pestañas. Las finalizadas, cuando
// se abre su pestaña (si se llega con #finalizadas, ya la pidió elegir()).
elegir(vistaDelHash());
iniciando = false;
cargarRescatistas();
cargarModeracion();
cargarEnCurso();
