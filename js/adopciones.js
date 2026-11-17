/**
 * adopciones.js — Animales en adopción (adopciones/adopciones.html), rol 3, Entrega 5
 *
 * Público: las publicaciones aprobadas y disponibles, con filtro por especie.
 * Cliente con sesión: se postula a una adopción y ve el estado de sus postulaciones.
 * Contrato: docs/api/contrato-adopciones.md (repo Adopciones). Todo texto de la API va con el().
 */
import { api } from './api.js';
import { sesion } from './auth.js';
import { el, limpiarErrores, mostrarErrores } from './ui.js';
import { textoEspecieMascota } from './etiquetas.js';
import { edad, fecha, insignia, mensajeDeError } from './etiquetas-adopciones.js';

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

async function cargar() {
  estado.textContent = 'Cargando…';
  try {
    const { publicaciones } = await api('/api/adopciones/publicaciones' + (especie ? '?especie=' + especie : ''));
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

  if (esCliente) {
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
    document.getElementById('filas-mias').replaceChildren(...postulaciones.map((p) => {
      const tr = el('tr');
      const celdaEstado = el('td');
      celdaEstado.append(insignia(p.estado));
      tr.append(el('td', p.publicacion.mascota.nombre), el('td', fecha(p.fecha)), celdaEstado);
      return tr;
    }));
    document.getElementById('tabla-mias').hidden = postulaciones.length === 0;
    estadoMias.textContent = postulaciones.length ? '' : 'Todavía no te postulaste a ninguna adopción.';
  } catch {
    estadoMias.textContent = 'No se pudieron cargar tus postulaciones.';
  }
}

if (esCliente) {
  document.getElementById('seccion-mias').hidden = false;
  cargarMias();
}

cargar();
