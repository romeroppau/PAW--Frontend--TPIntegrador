// Formularios de registro (cliente y rescatista). Los dos funcionan igual:
// solo cambia la ruta, que el HTML indica en el atributo data-endpoint del formulario.
// Contrato en el repo Backend: docs/api/contrato.md.

// api() es la función común de fetch del Rol 4 (js/api.js). Si el backend responde un error,
// lanza {estado, datos}, donde datos es el JSON de error ({"error": "...", "campos": {...}}).
import { api } from '/js/api.js';

// A dónde ir después de registrarse (el registro deja la sesión iniciada). Igual que en login.js.
const HOME_POR_ROL = {
  CLIENTE: '/catalogo.html',
  RESCATISTA: '/catalogo.html',
  VETERINARIO: '/panel.html'
};

const formulario = document.getElementById('form-registro');
const mensajeError = document.getElementById('mensaje-error');
const botonEnviar = formulario.querySelector('button[type="submit"]');

formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarErrores();

  // "Confirmar contraseña" se controla solo acá: el backend no la recibe.
  if (document.getElementById('password').value !== document.getElementById('confirmacion').value) {
    mostrarErrorDeCampo('confirmacion', 'Las contraseñas no coinciden');
    return;
  }

  botonEnviar.disabled = true;

  try {
    // FormData junta todos los campos del formulario que tienen name (por eso "confirmacion" no va).
    // Object.fromEntries lo convierte en un objeto: {nombre: '...', email: '...', ...}
    // dataset.endpoint lee el atributo data-endpoint del formulario.
    const datos = await api(formulario.dataset.endpoint, {
      metodo: 'POST',
      cuerpo: Object.fromEntries(new FormData(formulario))
    });

    // 201: la cuenta se creó y la sesión quedó iniciada.
    window.location.href = HOME_POR_ROL[datos.rol] ?? '/index.html';
  } catch (error) {
    if (!error.datos) {
      // No hubo respuesta: no hay conexión, o el servidor está dormido o caído.
      mostrarError('No se pudo conectar con el servidor. Probá de nuevo en un momento.');
      return;
    }

    // 400: el backend manda un mensaje por cada campo con error en "campos".
    // Object.entries recorre cada par campo → mensaje.
    if (error.datos.campos) {
      Object.entries(error.datos.campos).forEach(([campo, mensaje]) => mostrarErrorDeCampo(campo, mensaje));
    }

    // El mensaje general: "Datos inválidos", o en un 409 "Ya existe una cuenta con ese email".
    mostrarError(error.datos.error ?? 'No se pudo crear la cuenta');
  } finally {
    botonEnviar.disabled = false;
  }
});

// Muestra el mensaje general de error, o lo oculta si el texto está vacío.
function mostrarError(texto) {
  mensajeError.textContent = texto;
  mensajeError.hidden = texto === '';
}

// Muestra un error debajo de un campo (en su <span id="error-...">), y marca el campo como inválido
// (aria-invalid): los lectores de pantalla lo anuncian, y base.css le pone el borde rojo.
function mostrarErrorDeCampo(campo, mensaje) {
  const lugarDelError = document.getElementById('error-' + campo);
  const input = document.getElementById(campo);

  if (lugarDelError) {
    lugarDelError.textContent = mensaje;
  }
  if (input) {
    input.setAttribute('aria-invalid', 'true');
  }
}

// Borra los errores del envío anterior.
function limpiarErrores() {
  mostrarError('');
  document.querySelectorAll('.campo-error').forEach((lugar) => (lugar.textContent = ''));
  document.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'));
}
