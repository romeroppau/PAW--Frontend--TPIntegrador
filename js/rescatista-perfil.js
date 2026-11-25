/**
 * rescatista-perfil.js — Perfil de un rescatista para la veterinaria (panel/rescatista.html?id=109).
 *
 * API:
 *   GET /api/rescatistas/{id}                                     → { rescatista } (Backend)
 *   GET /api/adopciones/moderacion?estado=TODAS&rescatista_id={id} → { publicaciones } (Adopciones)
 *   GET /api/adopciones/rechazos?rescatista_id={id}               → { rechazos } (Adopciones)
 * Si el rescatista está pendiente, se lo aprueba o rechaza (con motivo) desde acá (validar-rescatista.js).
 * Todo texto de la API va con el().
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { enlaceTelefono } from './personas.js';
import { fecha, fechaHora, insignia } from './etiquetas-adopciones.js';
import { accionesRescatista } from './validar-rescatista.js';

const $ = (id) => document.getElementById(id);
const id = Number(new URLSearchParams(location.search).get('id'));

await exigirRol('VETERINARIO');

const enlacePublicacion = (publicacionId, nombre) => el('a', nombre, {
  href: '/adopciones/publicacion.html?id=' + encodeURIComponent(publicacionId),
  title: 'Ver la publicación de ' + nombre,
});

function celda(...hijos) {
  const td = el('td');
  td.append(...hijos);
  return td;
}

function tabla(nombre, filas, vacio) {
  $('filas-' + nombre).replaceChildren(...filas);
  $('tabla-' + nombre).hidden = filas.length === 0;
  $('estado-' + nombre).textContent = filas.length ? '' : vacio;
}

function mostrar(r) {
  document.title = `${r.nombre} | HuellaVet`;
  $('nombre').textContent = r.nombre;
  $('insignia-estado').replaceChildren(insignia(r.estado_validacion === 'PENDIENTE' ? 'PENDIENTE' : r.estado_validacion));
  $('organizacion').textContent = r.organizacion ?? '—';
  $('email').replaceChildren(el('a', r.email, { href: 'mailto:' + r.email }));
  $('telefono').replaceChildren(enlaceTelefono(r.telefono));

  const cuando = r.validado_en ? ' el ' + fechaHora(r.validado_en) : ' (sin fecha registrada)';
  $('validacion').textContent = {
    PENDIENTE: 'Esperando tu aprobación',
    APROBADO: 'Aprobada' + cuando,
    RECHAZADO: 'Rechazada' + cuando,
  }[r.estado_validacion] ?? r.estado_validacion;

  $('dato-motivo').hidden = r.estado_validacion !== 'RECHAZADO';
  $('motivo').textContent = r.motivo_rechazo ?? 'Sin motivo registrado';

  const acciones = $('acciones-pendiente');
  acciones.hidden = r.estado_validacion !== 'PENDIENTE';
  acciones.replaceChildren(...(r.estado_validacion === 'PENDIENTE' ? [accionesRescatista(r, cargar)] : []));

  $('enlace-ficha').href = '/panel/cliente.html?id=' + encodeURIComponent(r.id);
}

async function cargarPublicaciones() {
  try {
    const { publicaciones } = await api(`/api/adopciones/moderacion?estado=TODAS&rescatista_id=${id}`);
    tabla('publicaciones', publicaciones.map((p) => {
      const revision = p.activa ? insignia(p.estado_moderacion) : insignia('BAJA');
      const adopcion = p.adopcion ? celda(insignia(p.adopcion.estado), ' ',
        el('a', 'Ver la adopción', { href: '/panel/adopcion.html?id=' + p.adopcion.id })) : celda('—');
      const tr = el('tr');
      tr.append(celda(enlacePublicacion(p.id, p.mascota.nombre)), el('td', fecha(p.creada_en)), celda(revision), adopcion);
      return tr;
    }), 'Todavía no publicó ninguna mascota.');
  } catch {
    $('estado-publicaciones').textContent = 'No se pudieron cargar sus publicaciones.';
  }
}

async function cargarRechazos() {
  try {
    const { rechazos } = await api(`/api/adopciones/rechazos?rescatista_id=${id}`);
    tabla('rechazos', rechazos.map((r) => {
      const tr = el('tr');
      tr.append(celda(enlacePublicacion(r.publicacion.id, r.mascota.nombre)), el('td', fechaHora(r.rechazada_en)), el('td', r.motivo));
      return tr;
    }), 'No se le rechazó ninguna publicación.');
  } catch {
    $('estado-rechazos').textContent = 'No se pudieron cargar los rechazos.';
  }
}

async function cargar() {
  try {
    const { rescatista } = await api('/api/rescatistas/' + id);
    mostrar(rescatista);
    $('estado').textContent = '';
    $('perfil').hidden = false;
  } catch (error) {
    $('estado').textContent = error?.estado === 404 ? 'No encontramos ese rescatista.' : 'No se pudo cargar el rescatista.';
    return;
  }
  await Promise.all([cargarPublicaciones(), cargarRechazos()]);
}

if (!Number.isInteger(id) || id <= 0) {
  $('estado').textContent = 'Falta indicar el rescatista.';
} else {
  cargar();
}
