/**
 * adopciones.js — Animales en adopción (adopciones/adopciones.html), rol 3, Entrega 5
 *
 * Público: las publicaciones aprobadas y disponibles, con filtro por especie.
 * Cliente con sesión: dos pestañas, "Animales que buscan familia" (se postula desde ahí) y "Mis
 * postulaciones" (el estado de cada una; el animal lleva a su publicación, adopciones/publicacion.html).
 * Con #seccion-mias en la dirección abre la segunda; con ?postular=ID, el formulario de ese animal.
 * Contrato: docs/api/contrato-adopciones.md (repo Adopciones). Todo texto de la API va con el().
 */
import { api } from './api.js';
import { sesion } from './auth.js';
import { el, limpiarErrores, mostrarErrores } from './ui.js';
import { textoEspecieMascota } from './etiquetas.js';
import { bloquePostulacion, cancelarPostulacion, edad, fecha, insigniaPostulacion, mensajeDeError, seguimiento } from './etiquetas-adopciones.js';
import { activarPestanas } from './pestanas.js';

const usuario = await sesion;
const esCliente = usuario?.rol === 'CLIENTE';

const estado = document.getElementById('estado');
const grilla = document.getElementById('publicaciones');
const seccionForm = document.getElementById('seccion-postulacion');
const form = document.getElementById('form-postulacion');
const aviso = document.getElementById('aviso');

// La adopción a la que se está postulando el cliente.
let elegida = null;

if (usuario) document.getElementById('invitacion').hidden = true;

/* ---------- Animales disponibles ---------- */

let especie = '';
let ultimasPublicaciones = [];
// Las postulaciones del cliente, por publicación: esos animales muestran el estado en lugar de
// "Quiero adoptarlo" (no se puede postular dos veces por el mismo).
let misPostulaciones = new Map();

async function cargar() {
  estado.textContent = 'Cargando…';
  try {
    const { publicaciones } = await api('/api/adopciones/publicaciones' + (especie ? '?especie=' + especie : ''));
    ultimasPublicaciones = publicaciones;
    grilla.replaceChildren(...publicaciones.map(tarjeta));
    estado.textContent = publicaciones.length ? '' : 'Por ahora no hay animales en adopción con ese filtro.';
  } catch {
    estado.textContent = 'No se pudieron cargar los animales en adopción.';
  }
}

function tarjeta(publicacion) {
  const { mascota, rescatista } = publicacion;
  const articulo = el('article', '', { class: 'tarjeta tarjeta-adopcion' });
  articulo.append(el('img', '', {
    src: `/api/adopciones/publicaciones/${publicacion.id}/foto`,
    alt: 'Foto de ' + mascota.nombre, width: '400', height: '300', loading: 'lazy'
  }));

  const cuerpo = el('div', '', { class: 'cuerpo' });
  cuerpo.append(
    el('h2', mascota.nombre),
    el('p', publicacion.titulo, { class: 'etiqueta' }),
    el('p', [textoEspecieMascota(mascota.especie), mascota.raza, edad(mascota.edad_meses)].filter(Boolean).join(' · '), { class: 'datos' }),
    el('p', publicacion.descripcion),
    el('p', 'Lo cuida: ' + (rescatista.organizacion || rescatista.nombre), { class: 'datos' })
  );

  // Si ya se postuló, ve el estado; si la había cancelado, también "Quiero adoptarlo" (24/11).
  const mia = misPostulaciones.get(publicacion.id);
  if (esCliente && mia) cuerpo.append(bloquePostulacion(mia));
  if (esCliente && (!mia || mia.estado === 'CANCELADA')) {
    const acciones = el('div', '', { class: 'acciones' });
    const boton = el('button', 'Quiero adoptarlo', { type: 'button', class: 'boton', 'aria-label': 'Postularme para adoptar a ' + mascota.nombre });
    boton.addEventListener('click', () => abrirFormulario(publicacion));
    acciones.append(boton);
    cuerpo.append(acciones);
  }

  articulo.append(cuerpo);
  return articulo;
}

for (const boton of document.querySelectorAll('[data-especie]')) {
  boton.addEventListener('click', () => {
    especie = boton.dataset.especie;
    document.querySelectorAll('[data-especie]').forEach((b) => b.setAttribute('aria-pressed', String(b === boton)));
    cargar();
  });
}

/* ---------- Postulación (cliente) ---------- */

function abrirFormulario(publicacion) {
  elegida = publicacion;
  form.reset();
  limpiarErrores(form);
  aviso.hidden = true;
  document.getElementById('titulo-postulacion').textContent = 'Postularme para adoptar a ' + publicacion.mascota.nombre;
  seccionForm.hidden = false;
  seccionForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  form.elements.tipo_vivienda.focus({ preventScroll: true });
}

document.getElementById('cancelar').addEventListener('click', () => { seccionForm.hidden = true; elegida = null; });

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  limpiarErrores(form);
  const enviar = document.getElementById('enviar');
  enviar.disabled = true;                       // un doble clic no manda dos postulaciones

  const valor = (campo) => form.elements[campo].value.trim();
  const cuerpo = {
    tipo_vivienda: valor('tipo_vivienda'),
    otras_mascotas: valor('otras_mascotas'),
    tiempo_disponible: valor('tiempo_disponible')
  };

  try {
    await api(`/api/adopciones/${elegida.adopcion.id}/postulaciones`, { metodo: 'POST', cuerpo });
    seccionForm.hidden = true;
    aviso.textContent = `¡Listo! Te postulaste para adoptar a ${elegida.mascota.nombre}. El rescatista va a revisar tu postulación.`;
    aviso.hidden = false;
    elegida = null;
    cargarMias();
  } catch (e) {
    mostrarErrores(form, e?.datos?.campos ?? {}, mensajeDeError(e, 'No se pudo enviar la postulación. Probá de nuevo.'));
  } finally {
    enviar.disabled = false;
  }
});

/* ---------- Mis postulaciones (cliente) ---------- */


async function cargarMias() {
  const estadoMias = document.getElementById('estado-mias');
  try {
    const { postulaciones } = await api('/api/adopciones/mis-postulaciones');
    misPostulaciones = new Map(postulaciones.map((p) => [p.publicacion.id, p]));
    grilla.replaceChildren(...ultimasPublicaciones.map(tarjeta));
    document.getElementById('filas-mias').replaceChildren(...postulaciones.map((p) => {
      const tr = el('tr');
      const celdaEstado = el('td');
      celdaEstado.append(insigniaPostulacion(p.estado, { mira: 'postulante', adopcion: p.adopcion?.estado }));
      // El animal lleva a su publicación (la ve aunque ya no esté disponible: se postuló).
      const animal = el('td');
      animal.append(el('a', p.publicacion.mascota.nombre, {
        href: '/adopciones/publicacion.html?id=' + encodeURIComponent(p.publicacion.id),
        'aria-label': 'Ver la publicación de ' + p.publicacion.mascota.nombre
      }));
      tr.append(animal, el('td', fecha(p.fecha)), celdaEstado, el('td', seguimiento(p)), celdaCancelar(p));
      return tr;
    }));
    document.getElementById('tabla-mias').hidden = postulaciones.length === 0;
    estadoMias.textContent = postulaciones.length ? '' : 'Todavía no te postulaste a ninguna adopción.';
  } catch {
    estadoMias.textContent = 'No se pudieron cargar tus postulaciones.';
  }
}

// Mientras la rescatista no eligió, el cliente puede cancelar su postulación (24/11).
function celdaCancelar(p) {
  const celda = el('td');
  if (p.estado !== 'PENDIENTE') return celda;
  const boton = el('button', 'Cancelar', {
    type: 'button', class: 'boton boton-borde boton-chico',
    'aria-label': 'Cancelar mi postulación para adoptar a ' + p.publicacion.mascota.nombre
  });
  const error = el('span', '', { class: 'campo-error', role: 'alert' });
  boton.addEventListener('click', async () => {
    error.textContent = '';
    boton.disabled = true;
    try {
      if (await cancelarPostulacion(p)) await cargarMias();
    } catch (e) {
      error.textContent = e?.datos?.error ?? 'No se pudo cancelar. Probá de nuevo.';
    } finally {
      boton.disabled = false;
    }
  });
  celda.append(boton, error);
  return celda;
}

const cargas = [cargar()];
if (esCliente) {
  // Las pestañas: la elegida queda en la dirección (#seccion-mias), así el menú y el panel del
  // cliente ("Mis postulaciones") abren la que corresponde.
  const lista = document.getElementById('pestanas-adopciones');
  lista.hidden = false;
  const elegir = activarPestanas(lista, (vista) => {
    history.replaceState(null, '', vista === 'mias' ? '#seccion-mias' : location.pathname + location.search);
  });
  if (location.hash === '#seccion-mias') elegir('mias');
  cargas.push(cargarMias());
}

// Desde la publicación de un animal ("Quiero adoptarlo"): se abre el formulario para ese animal.
const postular = new URLSearchParams(location.search).get('postular');
if (esCliente && postular) {
  await cargas[0];
  await cargas[1];
  const publicacion = ultimasPublicaciones.find((p) => String(p.id) === postular);
  const mia = publicacion && misPostulaciones.get(publicacion.id);
  if (publicacion && (!mia || mia.estado === 'CANCELADA')) abrirFormulario(publicacion);
}
