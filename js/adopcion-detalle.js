/**
 * adopcion-detalle.js — Detalle de una adopción (panel/adopcion.html), rol 3, Entrega 5
 *
 * Se abre con ?id=<adopción> desde las pestañas "En curso" y "Finalizadas" de panel/adopciones.html.
 * Muestra la publicación (foto, datos de la mascota), el rescatista y el adoptante con sus contactos,
 * el recorrido de la adopción (con el chequeo y el enlace a su consulta) y todas las postulaciones.
 * Contrato: GET /api/adopciones/{id}/detalle en docs/api/contrato-adopciones.md (repo Adopciones).
 * Todo texto de la API va con el() (textContent).
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { textoEspecieMascota } from './etiquetas.js';
import { edad, fecha, insignia, insigniaPostulacion, textoEstado } from './etiquetas-adopciones.js';

await exigirRol(['VETERINARIO']);

const $ = (id) => document.getElementById(id);
const estado = $('estado');

// "2026-11-17 10:30:00" → "17/11/2026, 10:30"
const fechaHora = (texto) => (texto ? `${fecha(texto)}, ${texto.slice(11, 16)}` : '—');
const TERMINADAS = ['FINALIZADA', 'CANCELADA'];

function datoMascota(dl, nombre, valor) {
  dl.append(el('dt', nombre), el('dd', valor ?? '—'));
}

// Nombre, organización y contactos de una persona. Los contactos son enlaces (mailto y tel).
function pintarPersona(contenedor, persona, { extra = null } = {}) {
  if (!persona) {
    contenedor.append(el('p', 'Todavía no se eligió.', { class: 'ayuda' }));
    return;
  }
  contenedor.append(el('p', persona.nombre + (extra ? ` (${extra})` : '')));
  if (persona.email) {
    const p = el('p');
    p.append(el('a', persona.email, { href: 'mailto:' + persona.email }));
    contenedor.append(p);
  }
  if (persona.telefono) {
    const p = el('p');
    p.append(el('a', persona.telefono, { href: 'tel:' + persona.telefono }));
    contenedor.append(p);
  }
}

// Un paso del recorrido. "contenido" puede ser texto o un nodo; "pendiente" lo pinta en gris.
function paso(titulo, cuando, { pendiente = false, contenido = null } = {}) {
  const li = el('li', '', pendiente ? { class: 'pendiente' } : {});
  li.append(el('strong', titulo));
  if (cuando) li.append(el('span', cuando, { class: 'cuando' }));
  if (contenido) li.append(contenido);
  return li;
}

function pintarRecorrido(adopcion, postulaciones) {
  const { publicacion, adoptante, turno_chequeo: turno } = adopcion;
  const pasos = [
    paso('Publicación cargada por ' + publicacion.rescatista.nombre, fechaHora(publicacion.creada_en)),
    paso('Aprobada por la veterinaria y publicada', fechaHora(adopcion.fecha_inicio)),
  ];

  if (postulaciones.length) {
    const texto = postulaciones.length === 1 ? '1 postulación' : `${postulaciones.length} postulaciones`;
    pasos.push(paso(texto, 'La primera, el ' + fechaHora(postulaciones[0].fecha)));
  } else {
    pasos.push(paso('Sin postulaciones', null, { pendiente: true }));
  }

  if (adoptante) {
    pasos.push(paso('Adoptante elegido: ' + adoptante.nombre, null));
  } else if (!TERMINADAS.includes(adopcion.estado)) {
    pasos.push(paso('Elegir al adoptante', 'Lo hace el rescatista', { pendiente: true }));
  }

  if (turno) {
    const contenido = el('span', '', { class: 'acciones' });
    contenido.append(insignia(turno.estado));
    if (turno.consulta_id) {
      contenido.append(el('a', 'Ver la consulta del chequeo', { href: '/panel/consulta.html?id=' + turno.consulta_id }));
    }
    pasos.push(paso('Chequeo en la veterinaria', `${fecha(turno.fecha)}, ${turno.hora}`, { contenido }));
  } else if (adoptante && !TERMINADAS.includes(adopcion.estado)) {
    pasos.push(paso('Programar el chequeo', 'Desde la pestaña "En curso"', { pendiente: true }));
  }

  if (adopcion.estado === 'FINALIZADA') {
    pasos.push(paso(`Adopción completa: ${publicacion.mascota.nombre} pasó a ser de ${adoptante.nombre}`, fechaHora(adopcion.fecha_fin)));
  } else if (adopcion.estado === 'CANCELADA') {
    pasos.push(paso('La rescatista dio de baja la publicación: la adopción no sigue', fechaHora(adopcion.fecha_fin)));
  } else {
    pasos.push(paso('Todavía en curso: ' + textoEstado(adopcion.estado), null, { pendiente: true }));
  }

  $('recorrido').replaceChildren(...pasos);
}

function pintarPostulaciones(postulaciones, estadoAdopcion) {
  $('filas-postulaciones').replaceChildren(...postulaciones.map((p) => {
    const tr = el('tr');
    const cliente = el('td');
    cliente.append(el('span', p.cliente.nombre));
    if (p.cliente.telefono) cliente.append(el('span', p.cliente.telefono, { class: 'ayuda' }));
    const celdaEstado = el('td');
    celdaEstado.append(insigniaPostulacion(p.estado, { adopcion: estadoAdopcion }));
    tr.append(cliente, el('td', fecha(p.fecha)), el('td', p.tipo_vivienda), el('td', p.otras_mascotas), el('td', p.tiempo_disponible), celdaEstado);
    return tr;
  }));
  $('tabla-postulaciones').hidden = postulaciones.length === 0;
  $('estado-postulaciones').textContent = postulaciones.length ? '' : 'Nadie se postuló para esta adopción.';
}

async function iniciar() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id || !/^\d+$/.test(id)) {
    estado.textContent = 'Falta indicar la adopción.';
    return;
  }

  let respuesta;
  try {
    respuesta = await api(`/api/adopciones/${id}/detalle`);
  } catch (e) {
    estado.textContent = e?.estado === 404 ? 'No encontramos esa adopción.' : 'No se pudo cargar la adopción. Probá de nuevo.';
    return;
  }

  const { adopcion, postulaciones } = respuesta;
  const { publicacion } = adopcion;
  const { mascota } = publicacion;

  document.title = `Adopción de ${mascota.nombre} | HuellaVet`;
  $('titulo').textContent = 'Adopción de ' + mascota.nombre;
  $('insignia-estado').replaceChildren(insignia(adopcion.estado));
  if (!TERMINADAS.includes(adopcion.estado)) $('volver').href = '/panel/adopciones.html#en-curso';

  $('foto').replaceChildren(el('img', '', {
    src: `/api/adopciones/publicaciones/${publicacion.id}/foto`,
    alt: 'Foto de ' + mascota.nombre, width: '400', height: '300'
  }));
  $('publicacion-titulo').textContent = publicacion.titulo;
  $('publicacion-descripcion').textContent = publicacion.descripcion;

  const dl = $('datos-mascota');
  datoMascota(dl, 'Especie', textoEspecieMascota(mascota.especie));
  datoMascota(dl, 'Raza', mascota.raza);
  datoMascota(dl, 'Edad hoy', edad(mascota.edad_meses));
  datoMascota(dl, 'Peso', mascota.peso_kg ? `${Number(mascota.peso_kg).toLocaleString('es-AR')} kg` : null);

  pintarPersona($('rescatista'), publicacion.rescatista, { extra: publicacion.rescatista.organizacion });
  pintarPersona($('adoptante'), adopcion.adoptante);
  pintarRecorrido(adopcion, postulaciones);
  pintarPostulaciones(postulaciones, adopcion.estado);

  estado.textContent = '';
  $('detalle').hidden = false;
}

iniciar();
