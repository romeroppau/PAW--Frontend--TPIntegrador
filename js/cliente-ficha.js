/**
 * cliente-ficha.js — Ficha de un cliente para la veterinaria (panel/cliente.html?id=102).
 *
 * API:
 *   GET /api/clientes/{id}               → { id, nombre, email, telefono, rol, organizacion } (Backend)
 *   GET /api/pacientes/mascotas?buscar=  → { mascotas } (Pacientes). Se busca por el nombre del dueño y
 *                                          se dejan solo las de este id (puede haber dueños con el mismo nombre).
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { textoEspecieMascota } from './etiquetas.js';
import { enlaceTelefono } from './personas.js';
import { enlaceMascota } from './mascota-datos.js';
import { volverAAdopciones } from './volver-adopciones.js';

const $estado = document.getElementById('estado');
const id = Number(new URLSearchParams(location.search).get('id'));
const poner = (idElemento, contenido) => document.getElementById(idElemento).replaceChildren(contenido);

await exigirRol('VETERINARIO');
// Abierta desde las adopciones (el adoptante): vuelve a esa pestaña.
volverAAdopciones(document.getElementById('volver'));

if (!Number.isInteger(id) || id <= 0) {
  $estado.textContent = 'Falta indicar el cliente.';
} else {
  try {
    const cliente = await api('/api/clientes/' + id);
    mostrar(cliente);
    $estado.textContent = '';
    cargarMascotas(cliente);
  } catch (error) {
    $estado.textContent = error?.estado === 404 ? 'No encontramos ese cliente.' : 'No se pudo cargar el cliente.';
  }
}

function mostrar(cliente) {
  document.title = `${cliente.nombre} | HuellaVet`;
  document.getElementById('nombre').textContent = cliente.nombre;
  document.getElementById('tipo').textContent = cliente.rol === 'RESCATISTA' ? 'Rescatista' : 'Cliente';
  poner('email', el('a', cliente.email, { href: 'mailto:' + cliente.email }));
  poner('telefono', enlaceTelefono(cliente.telefono));
  document.getElementById('dato-organizacion').hidden = !(cliente.rol === 'RESCATISTA' && cliente.organizacion);
  document.getElementById('organizacion').textContent = cliente.organizacion ?? '';
  document.getElementById('ficha').hidden = false;
}

async function cargarMascotas(cliente) {
  const $estadoMascotas = document.getElementById('estado-mascotas');
  try {
    const { mascotas = [] } = await api('/api/pacientes/mascotas?buscar=' + encodeURIComponent(cliente.nombre));
    const suyas = mascotas.filter((m) => m.duenio?.id === cliente.id);
    document.getElementById('filas-mascotas').replaceChildren(...suyas.map(filaMascota));
    document.getElementById('tabla-mascotas').hidden = suyas.length === 0;
    $estadoMascotas.textContent = suyas.length === 0 ? 'No tiene mascotas cargadas.' : '';
  } catch {
    $estadoMascotas.textContent = 'No se pudieron cargar sus mascotas.';
  }
}

function filaMascota(mascota) {
  const tr = el('tr');
  const acciones = el('td', '', { class: 'acciones-tabla' });
  acciones.append(
    el('a', 'Historial', { href: '/cliente/historial.html?mascota=' + mascota.id, 'aria-label': 'Historial clínico de ' + mascota.nombre }),
    el('a', 'Calendario', { href: '/cliente/calendario.html?mascota=' + mascota.id, 'aria-label': 'Calendario sanitario de ' + mascota.nombre }),
  );
  const nombre = el('th', '', { scope: 'row' });
  nombre.append(enlaceMascota(mascota));
  tr.append(nombre, el('td', textoEspecieMascota(mascota.especie)), acciones);
  return tr;
}
