/**
 * publicaciones-rescatista.js — Mis publicaciones (rescatista/publicaciones.html), rol 3, Entrega 5
 *
 * El rescatista aprobado publica a una mascota que tiene a cargo, ve sus publicaciones separadas en
 * Activas, Adoptados, Rechazadas (con el motivo, para corregirlas) y Dadas de baja, las edita o las da
 * de baja, revisa los postulantes y elige al adoptante. Dar de baja es la única forma de cortar una
 * adopción en curso: se avisa a los postulantes, y si ya había adoptante, se cancela el turno del
 * chequeo y se avisa al adoptante y a la veterinaria. Si su cuenta está pendiente o rechazada, solo ve el aviso.
 * Contrato: docs/api/contrato-adopciones.md (repo Adopciones). Todo texto de la API va con el().
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { confirmar, el, limpiarErrores, mostrarErrores } from './ui.js';
import { edad, fecha, insignia, insigniaPostulacion, leerComoDataUrl, mensajeDeError } from './etiquetas-adopciones.js';
import { textoEspecieMascota } from './etiquetas.js';

const usuario = await exigirRol(['RESCATISTA']);

const estado = document.getElementById('estado');
const seccionForm = document.getElementById('seccion-form');
const form = document.getElementById('form-publicacion');
const seccionPostulantes = document.getElementById('seccion-postulantes');

const TIPOS_FOTO = ['image/png', 'image/jpeg', 'image/webp'];
const TAMANIO_MAXIMO_FOTO = 1024 * 1024;

/* ---------- Estado de la cuenta ---------- */

const avisoCuenta = document.getElementById('aviso-cuenta');
if (usuario.estado_validacion === 'APROBADO') {
  document.getElementById('nueva').hidden = false;
} else {
  avisoCuenta.textContent = usuario.estado_validacion === 'RECHAZADO'
    ? 'La veterinaria no aprobó tu cuenta, así que no podés publicar. Escribinos si creés que es un error.'
    : 'Tu cuenta está esperando la aprobación de la veterinaria. Mientras tanto podés cargar tus mascotas; cuando te aprueben, vas a poder publicarlas.';
  avisoCuenta.classList.add('mensaje-error');
  avisoCuenta.hidden = false;
}

/* ---------- Mis publicaciones ---------- */

// Cambia en cada carga: así, después de cambiar la foto, el navegador no muestra la vieja.
let versionFotos = Date.now();

// En qué sección va cada publicación.
function seccionDe(p) {
  if (p.adopcion?.estado === 'FINALIZADA') return 'adoptados';
  if (!p.activa) return 'bajas';
  if (p.estado_moderacion === 'RECHAZADA') return 'rechazadas';
  return 'activas';
}

const VACIAS = {
  activas: 'No tenés publicaciones activas.',
  adoptados: 'Todavía no se adoptó ninguno de tus animales.',
  rechazadas: 'No tenés publicaciones rechazadas.',
  bajas: 'No diste de baja ninguna publicación.',
};
const secciones = document.getElementById('secciones');
let seccion = 'activas';
let todas = [];

function pintar() {
  secciones.querySelectorAll('[data-seccion]').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.seccion === seccion));
    const n = todas.filter((p) => seccionDe(p) === b.dataset.seccion).length;
    b.querySelector('.contador').textContent = n ? `(${n})` : '';
  });
  const lista = todas.filter((p) => seccionDe(p) === seccion);
  document.getElementById('publicaciones').replaceChildren(...lista.map(tarjeta));
  document.getElementById('estado-seccion').textContent = lista.length ? '' : VACIAS[seccion];
}

secciones.addEventListener('click', (ev) => {
  const boton = ev.target.closest('[data-seccion]');
  if (!boton) return;
  seccion = boton.dataset.seccion;
  pintar();
});

// mostrarId: después de publicar, editar o dar de baja, se abre la sección donde quedó esa publicación
// (una rechazada que se corrige pasa a Activas; una que se da de baja, a Dadas de baja).
async function cargar(mostrarId = null) {
  estado.textContent = 'Cargando…';
  try {
    const { publicaciones } = await api('/api/adopciones/mis-publicaciones');
    versionFotos = Date.now();
    todas = publicaciones;
    const mostrar = publicaciones.find((p) => p.id === mostrarId);
    if (mostrar) seccion = seccionDe(mostrar);
    secciones.hidden = publicaciones.length === 0;
    estado.textContent = publicaciones.length ? '' : 'Todavía no publicaste ningún animal.';
    if (publicaciones.length) pintar();
    else document.getElementById('publicaciones').replaceChildren();
  } catch {
    estado.textContent = 'No se pudieron cargar tus publicaciones.';
  }
}

function tarjeta(publicacion) {
  const { mascota, adopcion } = publicacion;
  const articulo = el('article', '', { class: 'tarjeta tarjeta-adopcion' });
  articulo.append(el('img', '', {
    src: `/api/adopciones/publicaciones/${publicacion.id}/foto?v=${versionFotos}`,
    alt: 'Foto de ' + mascota.nombre, width: '400', height: '300', loading: 'lazy'
  }));

  const cuerpo = el('div', '', { class: 'cuerpo' });
  const estados = el('p', '', { class: 'acciones' });
  estados.append(insignia(publicacion.estado_moderacion));
  if (adopcion) estados.append(insignia(adopcion.estado));
  if (!publicacion.activa && !adopcion) estados.append(insignia('BAJA'));

  cuerpo.append(
    el('h2', mascota.nombre),
    el('p', publicacion.titulo, { class: 'etiqueta' }),
    estados,
    el('p', [textoEspecieMascota(mascota.especie), edad(mascota.edad_meses), 'publicada el ' + fecha(publicacion.creada_en)].join(' · '), { class: 'datos' })
  );

  if (publicacion.motivo_rechazo) {
    cuerpo.append(el('p', `Motivo del rechazo: ${publicacion.motivo_rechazo}. Editala y vuelve a revisión.`, { class: 'mensaje mensaje-error' }));
  }

  const acciones = el('div', '', { class: 'acciones' });
  const error = el('span', '', { class: 'campo-error', role: 'alert' });

  if (adopcion && CON_ADOPTANTE.includes(adopcion.estado)) {
    // Ya eligió (24/11): no hay nada que revisar, se ve quién adopta y lo que contestó.
    const ver = el('button', 'Ver adoptante elegido', { type: 'button', class: 'boton boton-chico', 'aria-label': 'Ver el adoptante elegido para ' + mascota.nombre });
    ver.addEventListener('click', () => verElegido(adopcion.id, mascota.nombre));
    acciones.append(ver);
  } else if (adopcion) {
    const ver = el('button', `Postulantes (${adopcion.postulaciones_pendientes ?? 0} sin revisar)`, { type: 'button', class: 'boton boton-chico' });
    ver.addEventListener('click', () => verPostulantes(adopcion.id, mascota.nombre));
    acciones.append(ver);
  }

  // Editar y dar de baja: solo las publicaciones activas.
  if (publicacion.activa) {
    const editar = el('button', 'Editar', { type: 'button', class: 'boton boton-borde boton-chico', 'aria-label': 'Editar la publicación de ' + mascota.nombre });
    editar.addEventListener('click', () => abrirFormulario(publicacion));
    const baja = el('button', 'Dar de baja', { type: 'button', class: 'boton boton-borde boton-chico', 'aria-label': 'Dar de baja la publicación de ' + mascota.nombre });
    baja.addEventListener('click', () => darDeBaja(publicacion, error));
    acciones.append(editar, baja);
  }

  if (acciones.children.length) {
    acciones.append(error);
    cuerpo.append(acciones);
  }

  articulo.append(cuerpo);
  return articulo;
}

// Lo que pasa al dar de baja, según en qué paso está la adopción (contrato-adopciones.md, "Dar de baja").
function preguntaDeBaja(publicacion) {
  const nombre = publicacion.mascota.nombre;
  const adopcion = publicacion.adopcion;
  const pendientes = adopcion?.postulaciones_pendientes ?? 0;
  let consecuencia = ' Los clientes ya no la van a ver.';
  if (adopcion?.estado === 'CHEQUEO_PENDIENTE') {
    consecuencia = ' La adopción no sigue: se cancela el turno del chequeo y les avisamos al adoptante y a la veterinaria.';
  } else if (adopcion?.estado === 'ADOPTANTE_ELEGIDO') {
    consecuencia = ' La adopción no sigue: les avisamos al adoptante y a la veterinaria.';
  } else if (pendientes > 0) {
    consecuencia = pendientes === 1
      ? ' Le avisamos a la persona que se postuló.'
      : ` Les avisamos a las ${pendientes} personas que se postularon.`;
  }
  return `¿Dar de baja la publicación de ${nombre}?${consecuencia} ${nombre} sigue a tu cargo y la podés volver a publicar.`;
}

async function darDeBaja(publicacion, error) {
  const pregunta = preguntaDeBaja(publicacion);
  if (!await confirmar(pregunta, { aceptar: 'Dar de baja', peligro: true })) return;
  try {
    await api(`/api/adopciones/publicaciones/${publicacion.id}`, { metodo: 'DELETE' });
    seccionPostulantes.hidden = true;
    seccionForm.hidden = true;
    cargar(publicacion.id);
  } catch (e) {
    error.textContent = mensajeDeError(e, 'No se pudo dar de baja la publicación.');
  }
}

/* ---------- Postulantes y elección ---------- */

// Adopciones en las que la rescatista ya eligió: muestran al adoptante en lugar de los postulantes.
const CON_ADOPTANTE = ['ADOPTANTE_ELEGIDO', 'CHEQUEO_PENDIENTE', 'FINALIZADA'];

// El adoptante elegido y lo que contestó en la postulación (24/11). Mismo pedido que los postulantes:
// GET /api/adopciones/{id}/postulaciones (el teléfono llega solo del elegido).
async function verElegido(adopcionId, nombre) {
  const estadoPostulantes = document.getElementById('estado-postulantes');
  const ficha = document.getElementById('adoptante-elegido');
  document.getElementById('titulo-postulantes').textContent = 'Adoptante elegido para ' + nombre;
  document.getElementById('tabla-postulantes').hidden = true;
  ficha.hidden = true;
  seccionPostulantes.hidden = false;
  estadoPostulantes.textContent = 'Cargando…';
  try {
    const { adopcion, postulaciones } = await api(`/api/adopciones/${adopcionId}/postulaciones`);
    const elegida = postulaciones.find((p) => p.estado === 'ELEGIDA');
    if (!elegida) {
      estadoPostulantes.textContent = 'No se encontró el adoptante elegido.';
      return;
    }
    const datos = el('dl', '', { class: 'contacto-datos' });
    const dato = (titulo, valor) => {
      const fila = el('div');
      fila.append(el('dt', titulo), el('dd', valor || '—'));
      datos.append(fila);
    };
    dato('Nombre', elegida.cliente.nombre);
    dato('Teléfono', elegida.cliente.telefono);
    dato('Se postuló el', fecha(elegida.fecha));
    dato('Tipo de vivienda', elegida.tipo_vivienda);
    dato('Otras mascotas', elegida.otras_mascotas);
    dato('Tiempo disponible', elegida.tiempo_disponible);
    const estadoAdopcion = el('p', 'Adopción: ');
    estadoAdopcion.append(insignia(adopcion.estado));
    ficha.replaceChildren(estadoAdopcion, datos);
    ficha.hidden = false;
    estadoPostulantes.textContent = '';
    seccionPostulantes.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    estadoPostulantes.textContent = 'No se pudo cargar el adoptante elegido.';
  }
}

async function verPostulantes(adopcionId, nombre) {
  const estadoPostulantes = document.getElementById('estado-postulantes');
  document.getElementById('titulo-postulantes').textContent = 'Postulantes para ' + nombre;
  document.getElementById('adoptante-elegido').hidden = true;
  seccionPostulantes.hidden = false;
  estadoPostulantes.textContent = 'Cargando…';
  try {
    const { adopcion, postulaciones } = await api(`/api/adopciones/${adopcionId}/postulaciones`);
    document.getElementById('filas-postulantes').replaceChildren(...postulaciones.map((p) => filaPostulante(p, adopcion, nombre)));
    document.getElementById('tabla-postulantes').hidden = postulaciones.length === 0;
    estadoPostulantes.textContent = postulaciones.length ? '' : 'Todavía no hay postulantes.';
    seccionPostulantes.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch {
    estadoPostulantes.textContent = 'No se pudieron cargar los postulantes.';
  }
}

function filaPostulante(postulacion, adopcion, nombre) {
  const tr = el('tr');
  const cliente = el('td');
  cliente.append(el('strong', postulacion.cliente.nombre));
  // El teléfono llega solo cuando la postulación está elegida, para coordinar la entrega.
  if (postulacion.cliente.telefono) cliente.append(el('span', 'Tel.: ' + postulacion.cliente.telefono, { class: 'ayuda' }));
  const celdaEstado = el('td');
  celdaEstado.append(insigniaPostulacion(postulacion.estado, { mira: 'rescatista', adopcion: adopcion.estado }));

  const celda = el('td');
  const acciones = el('div', '', { class: 'acciones' });
  if (adopcion.estado === 'CON_POSTULANTES' && postulacion.estado === 'PENDIENTE') {
    const elegir = el('button', 'Elegir', { type: 'button', class: 'boton boton-chico', 'aria-label': 'Elegir a ' + postulacion.cliente.nombre });
    const error = el('span', '', { class: 'campo-error', role: 'alert' });
    elegir.addEventListener('click', async () => {
      if (!await confirmar(`¿Elegir a ${postulacion.cliente.nombre} para adoptar a ${nombre}? Las demás postulaciones quedan rechazadas.`, { aceptar: 'Elegir adoptante' })) return;
      elegir.disabled = true;
      try {
        await api(`/api/adopciones/${adopcion.id}/elegir`, { metodo: 'POST', cuerpo: { postulacion_id: postulacion.id } });
        await verPostulantes(adopcion.id, nombre);
        cargar();
      } catch (e) {
        error.textContent = mensajeDeError(e, 'No se pudo elegir al adoptante.');
        elegir.disabled = false;
      }
    });
    acciones.append(elegir, error);
  }
  celda.append(acciones);

  tr.append(cliente, el('td', postulacion.tipo_vivienda), el('td', postulacion.otras_mascotas), el('td', postulacion.tiempo_disponible), celdaEstado, celda);
  return tr;
}

/* ---------- Nueva publicación y edición ---------- */

// Publicación que se está editando (null = una nueva). Al editar no se cambia la mascota y la foto
// es opcional: si no se elige otra, queda la actual.
let editando = null;

async function abrirFormulario(publicacion = null) {
  editando = publicacion;
  form.reset();
  limpiarErrores(form);
  const select = form.elements.mascota_id;
  document.getElementById('campo-mascota').hidden = Boolean(publicacion);
  document.getElementById('ayuda-foto-edicion').hidden = !publicacion;
  form.elements.foto.required = !publicacion;
  document.getElementById('publicar').textContent = publicacion ? 'Guardar cambios' : 'Publicar';
  document.getElementById('titulo-form').textContent = publicacion
    ? 'Editar la publicación de ' + publicacion.mascota.nombre
    : 'Nueva publicación';

  if (publicacion) {
    form.elements.titulo.value = publicacion.titulo;
    form.elements.descripcion.value = publicacion.descripcion;
  } else {
    select.replaceChildren(el('option', 'Elegí una de tus mascotas', { value: '' }));
    try {
      const { mascotas } = await api('/api/pacientes/mascotas');
      for (const m of mascotas) select.append(el('option', `${m.nombre} (${textoEspecieMascota(m.especie)})`, { value: m.id }));
    } catch {
      mostrarErrores(form, {}, 'No se pudieron cargar tus mascotas.');
    }
  }

  seccionForm.hidden = false;
  seccionForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  (publicacion ? form.elements.titulo : select).focus({ preventScroll: true });
}

document.getElementById('nueva').addEventListener('click', () => abrirFormulario());
document.getElementById('cancelar').addEventListener('click', () => { seccionForm.hidden = true; editando = null; });

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  limpiarErrores(form);
  const publicar = document.getElementById('publicar');
  publicar.disabled = true;                       // un doble clic no publica dos veces

  const archivo = form.elements.foto.files[0];
  const errores = {};
  if (!archivo && !editando) errores.foto = 'La foto es obligatoria';
  else if (archivo && !TIPOS_FOTO.includes(archivo.type)) errores.foto = 'La foto debe ser PNG, JPG o WEBP';
  else if (archivo && archivo.size > TAMANIO_MAXIMO_FOTO) errores.foto = 'La foto no puede superar 1 MB';
  if (Object.keys(errores).length) {
    mostrarErrores(form, errores);
    publicar.disabled = false;
    return;
  }

  const cuerpo = {
    titulo: form.elements.titulo.value.trim(),
    descripcion: form.elements.descripcion.value.trim()
  };
  if (archivo) cuerpo.foto = await leerComoDataUrl(archivo);
  if (!editando) cuerpo.mascota_id = Number(form.elements.mascota_id.value) || null;

  let mostrarId = null;
  try {
    if (editando) {
      await api(`/api/adopciones/publicaciones/${editando.id}`, { metodo: 'PUT', cuerpo });
      mostrarId = editando.id;
    } else {
      mostrarId = (await api('/api/adopciones/publicaciones', { metodo: 'POST', cuerpo }))?.publicacion?.id ?? null;
    }
    seccionForm.hidden = true;
    editando = null;
    cargar(mostrarId);
  } catch (e) {
    const general = editando ? 'No se pudo guardar. Probá de nuevo.' : 'No se pudo publicar. Probá de nuevo.';
    mostrarErrores(form, e?.datos?.campos ?? {}, mensajeDeError(e, general));
  } finally {
    publicar.disabled = false;
  }
});

cargar();
