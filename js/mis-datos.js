/**
 * mis-datos.js — "Mis datos" (cuenta/mis-datos.html): los datos de la propia cuenta y el cambio de
 * contraseña, para cliente, rescatista y veterinaria.
 *
 * API (repo Backend, docs/api/contrato.md, "Mis datos"):
 *   GET /api/cuenta                → { id, nombre, email, telefono, rol, organizacion }
 *   PUT /api/cuenta                { nombre, organizacion? }            → la cuenta actualizada
 *   PUT /api/cuenta/contrasena     { actual, nueva, repetir }           → { mensaje }
 *   POST /api/cuenta/telefono/codigo  { telefono }  → manda el código por WhatsApp al número nuevo
 *   POST /api/cuenta/telefono         { codigo }    → si es correcto, cambia el teléfono (la cuenta)
 * El teléfono no se cambia con "Guardar": recién cuando se confirma el código del número nuevo
 * (Verificación del WhatsApp). Mientras tanto sigue el anterior.
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
  document.getElementById('telefono-actual').value = cuenta.telefono ?? '';
  document.getElementById('email').value = cuenta.email ?? '';

  // La veterinaria puede no tener teléfono (se creó sin él): lo puede agregar, también verificándolo.
  const telefonoOpcional = cuenta.rol === 'VETERINARIO';
  document.getElementById('etiqueta-telefono').textContent = telefonoOpcional ? 'Teléfono (opcional)' : 'Teléfono';
  document.getElementById('cambiar-telefono').textContent = cuenta.telefono ? 'Cambiar número' : 'Agregar número';

  const esRescatista = cuenta.rol === 'RESCATISTA';
  document.getElementById('campo-organizacion').hidden = !esRescatista;
  if (esRescatista) $formDatos.elements.organizacion.value = cuenta.organizacion ?? '';
}

// ---------- Datos personales ----------

$formDatos.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarErrores($formDatos);
  $okDatos.hidden = true;

  const cuerpo = { nombre: $formDatos.elements.nombre.value };
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

// ---------- Cambiar el WhatsApp ----------

const $bloqueTelefono = document.getElementById('bloque-telefono');
const $formTelefono = document.getElementById('form-telefono');
const $botonCambiar = document.getElementById('cambiar-telefono');
const $enviarCodigo = document.getElementById('enviar-codigo');
const $confirmar = document.getElementById('confirmar-telefono');
const $campoCodigo = document.getElementById('campo-codigo');
const $ayudaCodigo = document.getElementById('ayuda-codigo');
const $errorTelefono = document.getElementById('error-telefono-general');
const $okTelefono = document.getElementById('ok-telefono');
let cuentaRegresiva = null;

function abrirCambio(abierto) {
  $bloqueTelefono.hidden = !abierto;
  $botonCambiar.setAttribute('aria-expanded', String(abierto));
  limpiarErrores($formTelefono);
  errorDelTelefono('');
  $formTelefono.reset();
  ocultarCodigo();
  if (abierto) {
    $okTelefono.hidden = true;
    $formTelefono.elements.telefono.focus();
  }
}

// Vuelve al primer paso: sin código pedido.
function ocultarCodigo() {
  $campoCodigo.hidden = true;
  $confirmar.hidden = true;
  clearInterval(cuentaRegresiva);
  $enviarCodigo.disabled = false;
  $enviarCodigo.textContent = 'Enviar código por WhatsApp';
}

function errorDelTelefono(texto) {
  $errorTelefono.textContent = texto;
  $errorTelefono.hidden = texto === '';
}

// "Reenviar código" se habilita después de la espera que indica el servidor.
function esperarParaReenviar(segundos) {
  clearInterval(cuentaRegresiva);
  let quedan = segundos;
  const pintar = () => {
    $enviarCodigo.disabled = quedan > 0;
    $enviarCodigo.textContent = quedan > 0 ? 'Reenviar código (' + quedan + ' s)' : 'Reenviar código';
  };
  pintar();
  cuentaRegresiva = setInterval(() => {
    quedan -= 1;
    pintar();
    if (quedan <= 0) clearInterval(cuentaRegresiva);
  }, 1000);
}

$botonCambiar.addEventListener('click', () => abrirCambio($bloqueTelefono.hidden));
document.getElementById('cancelar-telefono').addEventListener('click', () => {
  abrirCambio(false);
  $botonCambiar.focus();
});

$enviarCodigo.addEventListener('click', async () => {
  limpiarErrores($formTelefono);
  errorDelTelefono('');
  $enviarCodigo.disabled = true;
  try {
    const r = await api('/api/cuenta/telefono/codigo', { metodo: 'POST', cuerpo: { telefono: $formTelefono.elements.telefono.value } });
    $campoCodigo.hidden = false;
    $confirmar.hidden = false;
    $ayudaCodigo.textContent = r.mensaje + ' Vence en ' + (r.vence_en_minutos ?? 10) + ' minutos.';
    $formTelefono.elements.codigo.value = '';
    $formTelefono.elements.codigo.focus();
    esperarParaReenviar(r.reenviar_en_segundos ?? 60);
  } catch (error) {
    mostrarErrores($formTelefono, error?.datos?.campos ?? {});
    if (error?.estado === 429) {
      esperarParaReenviar(error.datos.espera_segundos ?? 60);
    } else {
      $enviarCodigo.disabled = false;
    }
    if (error?.estado !== 400) {
      errorDelTelefono(error?.datos?.error ?? 'No se pudo mandar el código. Probá de nuevo en un momento.');
    }
  }
});

// Cambiar el número escrito invalida el código pedido: hay que pedir otro.
$formTelefono.elements.telefono.addEventListener('input', () => {
  if (!$campoCodigo.hidden) ocultarCodigo();
});

$formTelefono.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if ($confirmar.hidden) return;   // Enter antes de pedir el código: todavía no hay nada que confirmar
  limpiarErrores($formTelefono);
  errorDelTelefono('');
  $confirmar.disabled = true;
  try {
    const cuenta = await api('/api/cuenta/telefono', { metodo: 'POST', cuerpo: { codigo: $formTelefono.elements.codigo.value } });
    mostrar(cuenta);
    abrirCambio(false);
    $okTelefono.textContent = 'Listo: tu WhatsApp ahora es ' + cuenta.telefono + '.';
    $okTelefono.hidden = false;
    $botonCambiar.focus();
  } catch (error) {
    mostrarErrores($formTelefono, error?.datos?.campos ?? {});
    if (error?.estado !== 400) errorDelTelefono('No se pudo cambiar el número. Probá de nuevo en un momento.');
  } finally {
    $confirmar.disabled = false;
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
