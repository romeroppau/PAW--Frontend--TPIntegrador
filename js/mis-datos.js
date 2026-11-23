/**
 * mis-datos.js — "Mis datos" (cuenta/mis-datos.html): los datos de la propia cuenta y el cambio de
 * contraseña, para cliente, rescatista y veterinaria.
 *
 * API (repo Backend, docs/api/contrato.md, "Mis datos"):
 *   GET /api/cuenta                → { id, nombre, email, telefono, rol, organizacion }
 *   PUT /api/cuenta                { nombre, telefono, organizacion? }  → la cuenta actualizada
 *   PUT /api/cuenta/contrasena     { actual, nueva, repetir }           → { mensaje }
 * Los errores de validación llegan en un 400 con { campos: { campo: "mensaje" } }.
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { limpiarErrores, mostrarErrores } from './ui.js';

// A dónde vuelve cada rol (su panel).
const PANEL = {
  CLIENTE: '/paneles/panel-cliente.html',
  RESCATISTA: '/paneles/panel-rescatista.html',
  VETERINARIO: '/paneles/panel-administrador.html',
};

const $estado = document.getElementById('estado');
const $formDatos = document.getElementById('form-datos');
const $formContrasena = document.getElementById('form-contrasena');
const $okDatos = document.getElementById('ok-datos');
const $okContrasena = document.getElementById('ok-contrasena');

const usuario = await exigirRol(['CLIENTE', 'RESCATISTA', 'VETERINARIO']);
document.getElementById('volver').href = PANEL[usuario.rol] ?? '/index.html';

try {
  mostrar(await api('/api/cuenta'));
  $estado.textContent = '';
  document.getElementById('bloque-datos').hidden = false;
  document.getElementById('bloque-contrasena').hidden = false;
} catch {
  $estado.textContent = 'No se pudieron cargar tus datos. Probá de nuevo en un momento.';
}

function mostrar(cuenta) {
  $formDatos.elements.nombre.value = cuenta.nombre ?? '';
  $formDatos.elements.telefono.value = cuenta.telefono ?? '';
  document.getElementById('email').value = cuenta.email ?? '';

  // La veterinaria puede no tener teléfono; para cliente y rescatista es obligatorio.
  const telefonoOpcional = cuenta.rol === 'VETERINARIO';
  $formDatos.elements.telefono.required = !telefonoOpcional;
  document.getElementById('etiqueta-telefono').textContent = telefonoOpcional ? 'Teléfono (opcional)' : 'Teléfono';

  const esRescatista = cuenta.rol === 'RESCATISTA';
  document.getElementById('campo-organizacion').hidden = !esRescatista;
  if (esRescatista) $formDatos.elements.organizacion.value = cuenta.organizacion ?? '';
}

// ---------- Datos personales ----------

$formDatos.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarErrores($formDatos);
  $okDatos.hidden = true;

  const cuerpo = {
    nombre: $formDatos.elements.nombre.value,
    telefono: $formDatos.elements.telefono.value,
  };
  if (usuario.rol === 'RESCATISTA') cuerpo.organizacion = $formDatos.elements.organizacion.value;

  const boton = $formDatos.querySelector('button[type="submit"]');
  boton.disabled = true;
  try {
    const cuenta = await api('/api/cuenta', { metodo: 'PUT', cuerpo });
    mostrar(cuenta);
    // El nombre de arriba a la derecha (lo pone auth.js al cargar) se actualiza enseguida.
    document.querySelectorAll('.sesion-nombre').forEach((n) => { n.textContent = cuenta.nombre; });
    $okDatos.textContent = 'Guardamos tus datos.';
    $okDatos.hidden = false;
  } catch (error) {
    mostrarErrores($formDatos, error?.datos?.campos ?? {},
      error?.estado === 400 ? '' : 'No se pudieron guardar tus datos. Probá de nuevo en un momento.');
  } finally {
    boton.disabled = false;
  }
});

// ---------- Contraseña ----------

$formContrasena.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarErrores($formContrasena);
  $okContrasena.hidden = true;

  const actual = $formContrasena.elements.actual.value;
  const nueva = $formContrasena.elements.nueva.value;
  const repetir = $formContrasena.elements.repetir.value;

  // Lo mismo que controla el servidor, para avisar sin esperar la respuesta.
  const errores = {};
  if (!actual) errores.actual = 'Escribí tu contraseña actual';
  if (nueva.length < 8 || nueva.length > 72) errores.nueva = 'La contraseña debe tener entre 8 y 72 caracteres';
  else if (nueva !== repetir) errores.repetir = 'Las contraseñas nuevas no coinciden';
  if (Object.keys(errores).length > 0) {
    mostrarErrores($formContrasena, errores);
    return;
  }

  const boton = $formContrasena.querySelector('button[type="submit"]');
  boton.disabled = true;
  try {
    const { mensaje } = await api('/api/cuenta/contrasena', { metodo: 'PUT', cuerpo: { actual, nueva, repetir } });
    $formContrasena.reset();
    $okContrasena.textContent = (mensaje ?? 'Tu contraseña se cambió') + '. La próxima vez, entrá con la nueva.';
    $okContrasena.hidden = false;
  } catch (error) {
    mostrarErrores($formContrasena, error?.datos?.campos ?? {});
    if (error?.estado !== 400) {
      $okContrasena.hidden = true;
      mostrarErrores($formContrasena, { actual: 'No se pudo cambiar la contraseña. Probá de nuevo en un momento.' });
    }
  } finally {
    boton.disabled = false;
  }
});
