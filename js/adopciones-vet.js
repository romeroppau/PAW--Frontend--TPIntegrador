/**
 * adopciones-vet.js — Adopciones y rescatistas de la veterinaria (panel/adopciones.html), rol 3, Entrega 5
 *
 * Cuatro pestañas (la activa viaja en el hash, así los enlaces de otras pantallas caen en la correcta):
 * - Rescatistas (Backend, /api/rescatistas): por aprobar (aprobar, o rechazar con motivo), aprobados y
 *   rechazados (con la fecha y hora y el motivo). Con búsqueda; el nombre lleva a su perfil.
 * - Publicaciones (Adopciones): por revisar (aprobar o rechazar con motivo), aprobadas y el historial
 *   de rechazos (GET /api/adopciones/rechazos: cada rechazo, aunque después la hayan corregido).
 *   Con búsqueda y fechas.
 * - En curso: programar el chequeo (crea el turno en la agenda y lo asocia), completar la adopción
 *   cuando el chequeo está atendido (la mascota pasa al adoptante). Con búsqueda. No se cancela desde
 *   acá: solo la rescatista corta una adopción, dando de baja la publicación.
 * - Finalizadas: las adoptadas o las dadas de baja, filtradas por fecha (arranca en los últimos 30 días)
 *   y por nombre.
 * Las dos listas de adopciones vienen de a 20 (la API pagina) y cada fila enlaza a su detalle
 * (panel/adopcion.html). Contrato: docs/api/contrato-adopciones.md (repo Adopciones).
 * Todo texto de la API va con el().
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { confirmar, el } from './ui.js';
import { textoEspecieMascota } from './etiquetas.js';
import { edad, fecha, fechaHora, insignia, insigniaPublicacion, mensajeDeError } from './etiquetas-adopciones.js';
import { activarPestanas } from './pestanas.js';
import { aplicarHorario, horarioDeAtencion } from './horario.js';
import { accionesRescatista, enlacePerfil } from './validar-rescatista.js';
import { enlaceMascota } from './mascota-datos.js';

// El adoptante como enlace a su ficha de cliente (panel/cliente.html).
const enlaceAdoptante = (adoptante) => el('a', adoptante.nombre, {
  href: '/panel/cliente.html?id=' + encodeURIComponent(adoptante.id),
  title: 'Ver la ficha de ' + adoptante.nombre,
});

await exigirRol(['VETERINARIO']);

// El horario de atención que configuró la veterinaria, para el campo de hora del chequeo.
const horario = await horarioDeAtencion();

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

// Las sub-listas de una pestaña (botones con aria-pressed). alCambiar recibe el data-lista elegido.
function activarListas(grupo, alCambiar) {
  grupo.addEventListener('click', (ev) => {
    const boton = ev.target.closest('[data-lista]');
    if (!boton || boton.getAttribute('aria-pressed') === 'true') return;
    grupo.querySelectorAll('[data-lista]').forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));
    alCambiar(boton.dataset.lista);
  });
}

// Los filtros de un formulario de búsqueda, como query string (sin los vacíos).
function filtrosDe(form, extra = {}) {
  const query = new URLSearchParams(extra);
  for (const nombre of ['buscar', 'desde', 'hasta']) {
    const campo = form.elements[nombre];
    if (campo && !campo.closest('[hidden]') && campo.value.trim()) query.set(nombre, campo.value.trim());
  }
  return query;
}

// Las fechas de los filtros llegan hasta hoy (no hay nada en el futuro), y "hasta" no puede ser
// anterior a "desde". El navegador respeta min/max en el calendario; escritas a mano, las revisa
// fechasValidas() antes de pedir la lista.
function limitarFechas(form) {
  const { desde, hasta } = form.elements;
  desde.max = hoy;
  hasta.max = hoy;
  desde.addEventListener('change', () => { hasta.min = desde.value; });
  hasta.addEventListener('change', () => { desde.max = hasta.value || hoy; });
}

// null si las fechas sirven; si no, el mensaje de error.
function errorDeFechas(form) {
  const { desde, hasta } = form.elements;
  for (const campo of [desde, hasta]) {
    if (campo.closest('[hidden]') || !campo.value) continue;
    if (campo.validity.badInput) return 'La fecha no es válida.';
    if (campo.value > hoy) return 'La fecha no puede ser posterior a hoy.';
  }
  if (desde.value && hasta.value && !desde.closest('[hidden]') && desde.value > hasta.value) {
    return 'La fecha "hasta" no puede ser anterior a "desde".';
  }
  return null;
}

const columnas = (fila, nombres) => $(fila).replaceChildren(...nombres.map((n) => el('th', n, { scope: 'col' })));

/* ---------- Rescatistas ---------- */

const formRescatistas = $('filtro-rescatistas');
const rescatistas = { lista: 'PENDIENTE' };
const TEXTOS_RESCATISTAS = {
  PENDIENTE: { titulo: 'Rescatistas por aprobar', vacio: 'No hay rescatistas esperando la aprobación.', fecha: '' },
  APROBADO: { titulo: 'Rescatistas aprobados', vacio: 'Todavía no aprobaste a ningún rescatista.', fecha: 'Aprobado' },
  RECHAZADO: { titulo: 'Rescatistas rechazados', vacio: 'No rechazaste a ningún rescatista.', fecha: 'Rechazado' },
};

function contacto(r) {
  const td = el('td');
  td.append(el('span', r.email), el('span', r.telefono ?? '', { class: 'ayuda' }));
  return td;
}

function filaRescatista(r) {
  const tr = el('tr');
  const nombre = el('td');
  nombre.append(enlacePerfil(r));
  tr.append(nombre, el('td', r.organizacion ?? '—'), contacto(r));

  if (rescatistas.lista === 'PENDIENTE') {
    const celda = el('td');
    celda.append(accionesRescatista(r, cargarTodo));
    tr.append(celda);
  } else {
    // Los validados antes de que se guardara la fecha (migración 022) no la tienen.
    tr.append(el('td', r.validado_en ? fechaHora(r.validado_en) : 'Sin fecha registrada'));
    if (rescatistas.lista === 'RECHAZADO') tr.append(el('td', r.motivo_rechazo ?? 'Sin motivo registrado'));
  }
  return tr;
}

async function cargarRescatistas() {
  const { lista } = rescatistas;
  const textos = TEXTOS_RESCATISTAS[lista];
  $('error-rescatistas').textContent = errorDeFechas(formRescatistas) ?? '';
  if ($('error-rescatistas').textContent) return;
  try {
    // El número de la pestaña siempre es el de pendientes (lo que hay que resolver).
    const query = filtrosDe(formRescatistas, { estado: lista });
    const filtrada = query.has('buscar') || query.has('desde') || query.has('hasta');
    const pedidos = [api('/api/rescatistas?' + query)];
    if (lista !== 'PENDIENTE' || filtrada) pedidos.push(api('/api/rescatistas'));
    const [{ rescatistas: filas }, pendientes] = await Promise.all(pedidos);
    const cuantosPendientes = (pendientes ?? { rescatistas: filas }).rescatistas.length;
    contar('rescatistas', cuantosPendientes);
    $('cuenta-rescatistas-por-aprobar').textContent = cuantosPendientes > 0 ? `(${cuantosPendientes})` : '';

    $('titulo-tabla-rescatistas').textContent = textos.titulo;
    const nombres = ['Nombre', 'Organización', 'Contacto'];
    if (lista === 'PENDIENTE') nombres.push('Acciones');
    else nombres.push(textos.fecha + ' el');
    if (lista === 'RECHAZADO') nombres.push('Motivo');
    columnas('columnas-rescatistas', nombres);

    const vacio = filtrada ? 'Ningún rescatista coincide con la búsqueda.' : textos.vacio;
    pintarTabla('rescatistas', filas.map(filaRescatista), filas.length ? '' : vacio);
  } catch (e) {
    $('estado-rescatistas').textContent = '';
    $('error-rescatistas').textContent = errorDeFiltro(e, 'No se pudieron cargar los rescatistas.');
  }
}

activarListas($('lista-rescatistas'), (lista) => {
  rescatistas.lista = lista;
  // Las fechas solo tienen sentido en los ya decididos.
  formRescatistas.querySelectorAll('[data-solo-decididos]').forEach((c) => { c.hidden = lista === 'PENDIENTE'; });
  formRescatistas.querySelector('[data-etiqueta-desde]').textContent = TEXTOS_RESCATISTAS[lista].fecha + ' desde';
  cargarRescatistas();
});
limitarFechas(formRescatistas);
formRescatistas.addEventListener('submit', (ev) => {
  ev.preventDefault();
  cargarRescatistas();
});

/* ---------- Publicaciones ---------- */

const formPublicaciones = $('filtro-publicaciones');
const publicaciones = { lista: 'PENDIENTE' };
const TEXTOS_PUBLICACIONES = {
  PENDIENTE: { desde: 'Publicada desde', vacio: 'No hay publicaciones por revisar.', buscar: 'Mascota, rescatista u organización' },
  APROBADA: { desde: 'Aprobada desde', vacio: 'Todavía no aprobaste ninguna publicación.', buscar: 'Mascota, rescatista u organización' },
  RECHAZOS: { desde: 'Rechazada desde', vacio: 'No rechazaste ninguna publicación.', buscar: 'Mascota, rescatista o motivo' },
};

// El animal como enlace a su publicación (la veterinaria la ve en cualquier estado).
const enlacePublicacion = (id, nombre) => el('a', nombre, {
  href: '/adopciones/publicacion.html?id=' + encodeURIComponent(id),
  title: 'Ver la publicación de ' + nombre,
});

function conEnlace(nodo) {
  const td = el('td');
  td.append(nodo);
  return td;
}

// Cómo está ahora una publicación del historial: si después se aprobó, en qué quedó su adopción.
const estadoActual = (publicacion) => insigniaPublicacion(publicacion, publicacion.adopcion_estado);

async function cargarModeracion() {
  const { lista } = publicaciones;
  const textos = TEXTOS_PUBLICACIONES[lista];
  const estado = $('estado-moderacion');
  $('error-publicaciones').textContent = errorDeFechas(formPublicaciones) ?? '';
  if ($('error-publicaciones').textContent) return;
  $('ayuda-rechazos').hidden = lista !== 'RECHAZOS';
  try {
    const query = filtrosDe(formPublicaciones, lista === 'RECHAZOS' ? {} : { estado: lista });
    const filtrada = query.has('buscar') || query.has('desde') || query.has('hasta');
    const ruta = lista === 'RECHAZOS' ? '/api/adopciones/rechazos?' : '/api/adopciones/moderacion?';
    const pedidos = [api(ruta + query)];
    if (lista !== 'PENDIENTE' || filtrada) pedidos.push(api('/api/adopciones/moderacion'));
    const [respuesta, pendientes] = await Promise.all(pedidos);
    const cuantas = (pendientes ?? respuesta).publicaciones.length;
    contar('moderacion', cuantas);
    $('cuenta-por-revisar').textContent = cuantas > 0 ? `(${cuantas})` : '';

    const vacio = filtrada ? 'Ninguna publicación coincide con la búsqueda.' : textos.vacio;
    if (lista === 'PENDIENTE') {
      $('tabla-publicaciones').hidden = true;
      $('publicaciones').replaceChildren(...respuesta.publicaciones.map(tarjetaModeracion));
      estado.textContent = respuesta.publicaciones.length ? '' : vacio;
      return;
    }

    $('publicaciones').replaceChildren();
    let filas;
    if (lista === 'APROBADA') {
      $('titulo-tabla-publicaciones').textContent = 'Publicaciones aprobadas, las más recientes primero';
      columnas('columnas-publicaciones', ['Animal', 'Rescatista', 'Aprobada el', 'Adopción', 'Detalle']);
      filas = respuesta.publicaciones.map((p) => {
        const tr = el('tr');
        const adopcion = el('td');
        if (p.adopcion) adopcion.append(insignia(p.adopcion.estado));
        const detalle = el('td');
        if (p.adopcion) detalle.append(el('a', 'Ver la adopción', { href: '/panel/adopcion.html?id=' + p.adopcion.id }));
        tr.append(conEnlace(enlacePublicacion(p.id, p.mascota.nombre)), conEnlace(enlacePerfil(p.rescatista)),
          el('td', fechaHora(p.aprobada_en)), adopcion, detalle);
        return tr;
      });
    } else {
      $('titulo-tabla-publicaciones').textContent = 'Historial de rechazos de publicaciones, los más nuevos primero';
      columnas('columnas-publicaciones', ['Animal', 'Rescatista', 'Rechazada el', 'Motivo', 'Ahora']);
      filas = respuesta.rechazos.map((r) => {
        const tr = el('tr');
        const ahora = el('td');
        ahora.append(estadoActual(r.publicacion));
        tr.append(conEnlace(enlacePublicacion(r.publicacion.id, r.mascota.nombre)), conEnlace(enlacePerfil(r.rescatista)),
          el('td', fechaHora(r.rechazada_en)), el('td', r.motivo), ahora);
        return tr;
      });
    }
    $('filas-publicaciones').replaceChildren(...filas);
    $('tabla-publicaciones').hidden = filas.length === 0;
    estado.textContent = filas.length ? '' : vacio;
  } catch (e) {
    estado.textContent = '';
    $('error-publicaciones').textContent = errorDeFiltro(e, 'No se pudieron cargar las publicaciones.');
  }
}

activarListas($('lista-publicaciones'), (lista) => {
  publicaciones.lista = lista;
  const textos = TEXTOS_PUBLICACIONES[lista];
  formPublicaciones.querySelector('[data-etiqueta-desde]').textContent = textos.desde;
  formPublicaciones.elements.buscar.placeholder = textos.buscar;
  cargarModeracion();
});
limitarFechas(formPublicaciones);
formPublicaciones.addEventListener('submit', (ev) => {
  ev.preventDefault();
  cargarModeracion();
});

function tarjetaModeracion(publicacion) {
  const { mascota, rescatista } = publicacion;
  const articulo = el('article', '', { class: 'tarjeta tarjeta-adopcion' });
  articulo.append(el('img', '', {
    src: `/api/adopciones/publicaciones/${publicacion.id}/foto`,
    alt: 'Foto de ' + mascota.nombre, width: '400', height: '300', loading: 'lazy'
  }));
  const cuerpo = el('div', '', { class: 'cuerpo' });
  const deQuien = el('p', 'Rescatista: ', { class: 'datos' });
  deQuien.append(enlacePerfil(rescatista));
  if (rescatista.organizacion) deQuien.append(` (${rescatista.organizacion})`);
  cuerpo.append(
    el('h3', publicacion.titulo),
    el('p', [mascota.nombre, textoEspecieMascota(mascota.especie), edad(mascota.edad_meses)].join(' · '), { class: 'datos' }),
    el('p', publicacion.descripcion),
    deQuien
  );
  // Si ya se rechazó antes, el rescatista la corrigió: se avisa para mirar el historial.
  const veces = publicacion.veces_rechazada ?? 0;
  if (veces > 0) {
    cuerpo.append(el('p', veces === 1 ? 'Ya se rechazó 1 vez: está corregida.' : `Ya se rechazó ${veces} veces: está corregida.`, { class: 'ayuda' }));
  }

  const error = el('span', '', { class: 'campo-error', role: 'alert' });
  const acciones = el('div', '', { class: 'acciones' });
  acciones.append(botonAccion('Aprobar', { ruta: `/api/adopciones/publicaciones/${publicacion.id}/aprobar`, error }));

  // Rechazar pide el motivo, que el rescatista ve en sus publicaciones (y queda en el historial).
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

const curso = { pagina: 1, buscar: '', estado: '', orden: 'prioridad' };
const paginasCurso = paginador('curso', (paso) => { curso.pagina += paso; cargarEnCurso(); });

async function cargarEnCurso() {
  $('error-curso').textContent = '';
  try {
    const respuesta = await pedirPagina({ buscar: curso.buscar, estado: curso.estado, orden: curso.orden }, curso);
    // El número de la pestaña cuenta todas las en curso, sin la búsqueda ni el filtro de paso.
    const filtrada = curso.buscar || curso.estado;
    if (!filtrada) contar('curso', respuesta.total);
    const vacio = filtrada ? 'Ninguna adopción en curso coincide con los filtros.' : 'No hay adopciones en curso.';
    pintarTabla('curso', respuesta.adopciones.map(filaEnCurso), respuesta.total ? cantidad(respuesta.total) + ' en curso.' : vacio);
    paginasCurso(respuesta);
  } catch (e) {
    $('estado-curso').textContent = '';
    $('error-curso').textContent = errorDeFiltro(e, 'No se pudieron cargar las adopciones.');
  }
}

function filtrarEnCurso() {
  const campos = $('filtro-curso').elements;
  curso.buscar = campos.buscar.value.trim();
  curso.estado = campos.estado.value;
  curso.orden = campos.orden.value;
  curso.pagina = 1;
  cargarEnCurso();
}

$('filtro-curso').addEventListener('submit', (ev) => {
  ev.preventDefault();
  filtrarEnCurso();
});
// Ordenar y Paso cambian la lista enseguida, sin apretar "Buscar".
$('orden-curso').addEventListener('change', filtrarEnCurso);
$('paso-curso').addEventListener('change', filtrarEnCurso);

function filaEnCurso(adopcion) {
  const { publicacion, adoptante, turno_chequeo: turno } = adopcion;
  const tr = el('tr');

  const animal = el('td');
  // Cada nombre lleva a su información: la ficha del animal, el perfil del rescatista y la ficha del adoptante.
  const nombreAnimal = el('strong');
  nombreAnimal.append(enlaceMascota(publicacion.mascota));
  const deRescatista = el('span', 'Rescatista: ', { class: 'ayuda' });
  deRescatista.append(enlacePerfil(publicacion.rescatista));
  animal.append(nombreAnimal, deRescatista);
  const celdaEstado = el('td');
  celdaEstado.append(insignia(adopcion.estado));
  if (adopcion.estado === 'CON_POSTULANTES') {
    celdaEstado.append(el('span', `${publicacion.adopcion.postulaciones_pendientes} postulación(es) sin revisar`, { class: 'ayuda' }));
  }

  const celdaAdoptante = el('td');
  if (adoptante) celdaAdoptante.append(enlaceAdoptante(adoptante), el('span', adoptante.telefono ?? '', { class: 'ayuda' }));
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
  // Sin "Cancelar" (24/11): una adopción solo se corta cuando la rescatista da de baja la publicación.
  acciones.append(enlaceDetalle(adopcion), error);
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
  const inputHora = el('input', '', { type: 'time', name: 'hora', step: '600', required: '' });
  aplicarHorario(inputHora, horario);
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
limitarFechas(formFinalizadas);
formFinalizadas.elements.hasta.min = formFinalizadas.elements.desde.value;

async function cargarFinalizadas() {
  finalizadas.cargada = true;
  $('error-finalizadas').textContent = errorDeFechas(formFinalizadas) ?? '';
  if ($('error-finalizadas').textContent) return;
  const campos = formFinalizadas.elements;
  const filtros = {
    estado: campos.estado.value, desde: campos.desde.value, hasta: campos.hasta.value, buscar: campos.buscar.value.trim(),
    orden: campos.orden.value,
  };
  try {
    const respuesta = await pedirPagina(filtros, finalizadas);
    const [una, varias] = filtros.estado === 'CANCELADA' ? ['dada de baja', 'dadas de baja'] : ['finalizada', 'finalizadas'];
    const terminadas = varias;
    const resumen = respuesta.total === 1 ? `1 adopción ${una}.` : `${respuesta.total} adopciones ${varias}.`;
    pintarTabla('finalizadas', respuesta.adopciones.map((a) => {
      const tr = el('tr');
      const detalle = el('td');
      detalle.append(enlaceDetalle(a));
      tr.append(
        conEnlace(enlaceMascota(a.publicacion.mascota)),
        a.adoptante ? conEnlace(enlaceAdoptante(a.adoptante)) : el('td', '—'),
        conEnlace(enlacePerfil(a.publicacion.rescatista)),
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
formFinalizadas.elements.orden.addEventListener('change', () => formFinalizadas.requestSubmit());

/* ---------- Carga y pestañas ---------- */

// Después de una acción se recarga todo lo que pudo cambiar. Las finalizadas, solo si ya se abrieron.
function cargarTodo() {
  const pedidos = [cargarRescatistas(), cargarModeracion(), cargarEnCurso()];
  if (finalizadas.cargada) pedidos.push(cargarFinalizadas());
  return Promise.all(pedidos);
}

const VISTAS = ['rescatistas', 'publicaciones', 'en-curso', 'finalizadas'];
// #moderacion era el nombre viejo de Publicaciones (enlaces guardados, otras pantallas).
function vistaDelHash() {
  const hash = location.hash.slice(1) === 'moderacion' ? 'publicaciones' : location.hash.slice(1);
  return VISTAS.includes(hash) ? hash : 'en-curso';
}
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
