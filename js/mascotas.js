/**
 * mascotas.js — Mascotas (cliente/mascotas.html), rol 3, Entrega 4
 *
 * Cliente: ve sus mascotas y las da de alta, edita y da de baja. Puede cargarles una foto (Entrega 5).
 * Veterinario: ve todas, con su dueño y un buscador; no las modifica (el backend responde 403).
 * Todo con fetch: guardar o dar de baja actualiza la lista sin recargar la página.
 *
 * Contrato de la API: docs/api/contrato-mascotas-turnos.md (repo Pacientes).
 * Seguridad: la guardia de rol es solo comodidad de interfaz; la autorización real la hace el backend
 * (un cliente solo puede tocar sus mascotas). Todo texto de la API se inserta con el() (textContent).
 */
import { api, debounce } from './api.js';
import { exigirRol } from './auth.js';
import { confirmar, el, limpiarErrores, mostrarErrores } from './ui.js';
import { textoEspecieMascota } from './etiquetas.js';

const usuario = await exigirRol(['CLIENTE', 'VETERINARIO']);
const esCliente = usuario.rol === 'CLIENTE';

const API = '/api/pacientes/mascotas';
const estado = document.getElementById('estado');
const seccionForm = document.getElementById('seccion-form');
const form = document.getElementById('form-mascota');
const buscar = document.getElementById('buscar');

// Mascota que se está editando (null = alta de una nueva).
let editando = null;

// Cambia en cada carga del listado: así, después de cambiar una foto, el navegador no muestra la vieja.
let versionFotos = Date.now();
const urlFoto = (mascota) => `${API}/${mascota.id}/foto?v=${versionFotos}`;

const TIPOS_FOTO = ['image/png', 'image/jpeg', 'image/webp'];
const TAMANIO_MAXIMO_FOTO = 1024 * 1024;   // 1 MB, el mismo límite que el backend

// "Hoy" de Argentina, para que el calendario no deje elegir un nacimiento futuro.
const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
form.elements.fecha_nacimiento.max = hoy;

/* ------------------------------------------------------------------ */
/* Cliente o veterinario                                               */
/* ------------------------------------------------------------------ */

if (esCliente) {
  document.getElementById('nueva').hidden = false;
} else {
  document.getElementById('titulo').textContent = 'Mascotas';
  document.title = 'Mascotas | HuellaVet';
  document.getElementById('form-buscar').hidden = false;
  // El veterinario ve también el dueño de cada mascota.
  document.getElementById('encabezados').children[0].after(el('th', 'Dueño', { scope: 'col' }));
}

/* ------------------------------------------------------------------ */
/* Listado                                                             */
/* ------------------------------------------------------------------ */

let pedidoActual = 0;

async function cargar() {
  const pedido = ++pedidoActual;
  const texto = buscar.value.trim();
  estado.textContent = 'Cargando…';
  try {
    const { mascotas } = await api(API + (!esCliente && texto ? '?buscar=' + encodeURIComponent(texto) : ''));
    if (pedido !== pedidoActual) return;               // llegó tarde: ya se buscó otra cosa
    versionFotos = Date.now();
    document.getElementById('filas').replaceChildren(...mascotas.map(fila));
    document.getElementById('tabla').hidden = mascotas.length === 0;
    estado.textContent = mascotas.length ? ''
      : (esCliente ? 'Todavía no cargaste ninguna mascota.' : 'No hay mascotas que coincidan con la búsqueda.');
  } catch {
    if (pedido === pedidoActual) estado.textContent = 'No se pudieron cargar las mascotas.';
  }
}

// 36 meses → "3 años"; 14 → "1 año y 2 meses"; 2 → "2 meses".
function edad(meses) {
  if (meses === null || meses === undefined) return '—';
  if (meses < 1) return 'Menos de 1 mes';
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  const textoMeses = resto === 1 ? '1 mes' : `${resto} meses`;
  if (anios === 0) return textoMeses;
  const textoAnios = anios === 1 ? '1 año' : `${anios} años`;
  return resto === 0 ? textoAnios : `${textoAnios} y ${textoMeses}`;
}

function fila(mascota) {
  const tr = el('tr', '', { 'data-id': mascota.id });

  const nombre = el('td');
  if (mascota.tiene_foto) {
    nombre.classList.add('con-foto');
    nombre.append(el('img', '', { src: urlFoto(mascota), alt: 'Foto de ' + mascota.nombre, class: 'miniatura', width: '48', height: '48', loading: 'lazy' }));
  }
  nombre.append(el('strong', mascota.nombre));
  if (mascota.raza) nombre.append(el('span', mascota.raza, { class: 'ayuda' }));
  tr.append(nombre);

  if (!esCliente) tr.append(el('td', mascota.duenio.nombre));

  tr.append(
    el('td', textoEspecieMascota(mascota.especie)),
    el('td', edad(mascota.edad_meses)),
    el('td', mascota.peso_kg ? `${Number(mascota.peso_kg).toLocaleString('es-AR')} kg` : '—')
  );

  // Las acciones van en un <div>: con "acciones" (display: flex) en el <td>, la celda no se alinearía.
  const celda = el('td');
  const acciones = el('div', '', { class: 'acciones' });
  acciones.append(
    el('a', 'Calendario', { href: '/cliente/calendario.html?mascota=' + mascota.id, 'aria-label': 'Calendario sanitario de ' + mascota.nombre }),
    el('a', 'Historial', { href: '/cliente/historial.html?mascota=' + mascota.id, 'aria-label': 'Historial clínico de ' + mascota.nombre })
  );
  if (esCliente) acciones.append(botonEditar(mascota), botonBaja(mascota, celda));
  celda.append(acciones, el('span', '', { class: 'campo-error', role: 'alert' }));
  tr.append(celda);
  return tr;
}

/* ------------------------------------------------------------------ */
/* Alta y edición (cliente)                                            */
/* ------------------------------------------------------------------ */

function abrirFormulario(mascota = null) {
  editando = mascota;
  form.reset();
  limpiarErrores(form);
  document.getElementById('titulo-form').textContent = mascota ? 'Editar a ' + mascota.nombre : 'Nueva mascota';
  if (mascota) {
    for (const campo of ['nombre', 'especie', 'raza', 'fecha_nacimiento', 'peso_kg']) {
      form.elements[campo].value = mascota[campo] ?? '';
    }
  }
  // La foto actual (al editar) se muestra arriba del campo, con la opción de quitarla.
  const fotoActual = document.getElementById('foto-actual');
  const conFoto = Boolean(mascota?.tiene_foto);
  fotoActual.replaceChildren(...(conFoto
    ? [el('img', '', { src: urlFoto(mascota), alt: 'Foto actual de ' + mascota.nombre, class: 'foto-mascota', width: '120', height: '120' })]
    : []));
  fotoActual.hidden = !conFoto;
  document.getElementById('campo-quitar-foto').hidden = !conFoto;
  seccionForm.hidden = false;
  form.elements.nombre.focus();
}

function cerrarFormulario() {
  seccionForm.hidden = true;
  editando = null;
}

function botonEditar(mascota) {
  const boton = el('button', 'Editar', { type: 'button', class: 'boton boton-borde boton-chico', 'aria-label': 'Editar ' + mascota.nombre });
  boton.addEventListener('click', () => abrirFormulario(mascota));
  return boton;
}

document.getElementById('nueva').addEventListener('click', () => abrirFormulario());
document.getElementById('cancelar').addEventListener('click', cerrarFormulario);

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  limpiarErrores(form);
  const guardar = document.getElementById('guardar');
  guardar.disabled = true;                            // un doble clic no crea dos mascotas

  const valor = (campo) => form.elements[campo].value.trim();
  const cuerpo = {
    nombre: valor('nombre'),
    especie: valor('especie'),
    raza: valor('raza'),
    fecha_nacimiento: valor('fecha_nacimiento'),
    peso_kg: valor('peso_kg') === '' ? null : Number(valor('peso_kg'))
  };

  // Foto: si se eligió un archivo, viaja como data URL; si se marcó "Quitar", va null; si no, no se manda
  // y el backend deja la que tenía. El tipo y el tamaño se revisan acá solo para avisar antes: el backend
  // vuelve a revisar todo, incluido el contenido real del archivo.
  const archivo = form.elements.foto.files[0];
  if (archivo) {
    if (!TIPOS_FOTO.includes(archivo.type)) {
      mostrarErrores(form, { foto: 'La foto debe ser PNG, JPG o WEBP' });
      guardar.disabled = false;
      return;
    }
    if (archivo.size > TAMANIO_MAXIMO_FOTO) {
      mostrarErrores(form, { foto: 'La foto no puede superar 1 MB' });
      guardar.disabled = false;
      return;
    }
    cuerpo.foto = await leerComoDataUrl(archivo);
  } else if (editando && document.getElementById('quitar-foto').checked) {
    cuerpo.foto = null;
  }

  try {
    // POST para una nueva, PUT para editar. Los dos responden la mascota guardada.
    const guardada = editando
      ? await api(`${API}/${editando.id}`, { metodo: 'PUT', cuerpo })
      : await api(API, { metodo: 'POST', cuerpo });
    cerrarFormulario();
    await cargar();
    estado.textContent = `${guardada.nombre} quedó guardada.`;
  } catch (e) {
    mostrarErrores(form, e.datos?.campos, e.datos?.error ?? 'No se pudo guardar la mascota.');
  } finally {
    guardar.disabled = false;
  }
});

// FileReader trabaja con eventos: se lo envuelve en una promesa para usar await.
function leerComoDataUrl(archivo) {
  return new Promise((ok, fallo) => {
    const lector = new FileReader();
    lector.onload = () => ok(lector.result);           // "data:image/png;base64,...."
    lector.onerror = () => fallo(lector.error);
    lector.readAsDataURL(archivo);
  });
}

/* ------------------------------------------------------------------ */
/* Baja (cliente)                                                      */
/* ------------------------------------------------------------------ */

function botonBaja(mascota, celda) {
  const boton = el('button', 'Dar de baja', {
    type: 'button', class: 'boton boton-peligro boton-chico', 'aria-label': 'Dar de baja a ' + mascota.nombre
  });
  boton.addEventListener('click', async () => {
    if (!await confirmar(`¿Dar de baja a ${mascota.nombre}? Su historial y su calendario se conservan.`, { aceptar: 'Dar de baja', peligro: true })) return;
    boton.disabled = true;
    const error = celda.querySelector('.campo-error');
    error.textContent = '';
    try {
      await api(`${API}/${mascota.id}`, { metodo: 'DELETE' });   // 204: sin cuerpo
      if (editando?.id === mascota.id) cerrarFormulario();
      await cargar();
      estado.textContent = `${mascota.nombre} quedó dada de baja.`;
    } catch (e) {
      // 409: tiene turnos programados.
      error.textContent = e.datos?.error ?? 'No se pudo dar de baja.';
      boton.disabled = false;
    }
  });
  return boton;
}

/* ------------------------------------------------------------------ */
/* Inicio                                                              */
/* ------------------------------------------------------------------ */

document.getElementById('form-buscar').addEventListener('submit', (ev) => ev.preventDefault());
buscar.addEventListener('input', debounce(cargar, 300));

cargar();
