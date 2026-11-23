// Formularios de registro (cliente y rescatista). Los dos funcionan igual:
// solo cambia la ruta, que el HTML indica en el atributo data-endpoint del formulario.
// Contrato en el repo Backend: docs/api/contrato.md ("Registro" y "Verificación del WhatsApp").
//
// Verificación del WhatsApp (Entrega 5): la cuenta se crea recién con el código que llega por
// WhatsApp al teléfono. "Crear cuenta" manda primero el registro sin código: el servidor revisa todos
// los campos (y si el email ya existe). Si lo único que falta es el código, se pide el WhatsApp y
// aparece el campo para escribirlo; el siguiente "Crear cuenta" lo manda. Así no se gasta un código
// si hay otro error, y se ven todos los errores juntos.

// api() es la función común de fetch del Rol 4 (js/api.js). Si el backend responde un error,
// lanza {estado, datos}, donde datos es el JSON de error ({"error": "...", "campos": {...}}).
import { api } from '/js/api.js';

// A dónde ir después de registrarse (el registro deja la sesión iniciada). Igual que en login.js.
const HOME_POR_ROL = {
  CLIENTE: '/paneles/panel-cliente.html',
  RESCATISTA: '/paneles/panel-rescatista.html',
  VETERINARIO: '/paneles/panel-administrador.html'
};

const formulario = document.getElementById('form-registro');
const mensajeError = document.getElementById('mensaje-error');
const botonEnviar = formulario.querySelector('button[type="submit"]');
const inputTelefono = document.getElementById('telefono');
const campoCodigo = document.getElementById('campo-codigo');
const inputCodigo = document.getElementById('codigo');
const ayudaCodigo = document.getElementById('ayuda-codigo');
const botonReenviar = document.getElementById('reenviar-codigo');

// El teléfono al que se mandó el último código (tal como estaba escrito), o null.
let codigoEnviadoA = null;
let cuentaRegresiva = null;

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
    const cuerpo = Object.fromEntries(new FormData(formulario));
    if (!codigoVigente()) delete cuerpo.codigo;

    const datos = await api(formulario.dataset.endpoint, { metodo: 'POST', cuerpo });

    // 201: la cuenta se creó y la sesión quedó iniciada.
    window.location.href = HOME_POR_ROL[datos.rol] ?? '/index.html';
  } catch (error) {
    if (!error.datos) {
      // No hubo respuesta: no hay conexión, o el servidor está dormido o caído.
      mostrarError('No se pudo conectar con el servidor. Probá de nuevo en un momento.');
      return;
    }

    const campos = error.datos.campos ?? {};

    // Todo lo demás está bien y falta el código: se manda el WhatsApp.
    if (error.estado === 400 && Object.keys(campos).length === 1 && campos.codigo && !codigoVigente()) {
      await pedirCodigo();
      return;
    }

    // 400: el backend manda un mensaje por cada campo con error en "campos".
    // Object.entries recorre cada par campo → mensaje.
    Object.entries(campos).forEach(([campo, mensaje]) => mostrarErrorDeCampo(campo, mensaje));

    // El mensaje general: "Datos inválidos", o en un 409 "Ya existe una cuenta con ese email".
    mostrarError(error.datos.error ?? 'No se pudo crear la cuenta');
  } finally {
    botonEnviar.disabled = false;
  }
});

// ---------- Código por WhatsApp ----------

// Hay un código pedido para el teléfono que está escrito ahora.
function codigoVigente() {
  return codigoEnviadoA !== null && codigoEnviadoA === inputTelefono.value.trim();
}

async function pedirCodigo() {
  botonReenviar.disabled = true;
  try {
    const r = await api('/api/auth/registro/codigo', {
      metodo: 'POST',
      cuerpo: { telefono: inputTelefono.value, nombre: document.getElementById('nombre').value },
    });
    codigoEnviadoA = inputTelefono.value.trim();
    campoCodigo.hidden = false;
    ayudaCodigo.textContent = `${r.mensaje} Escribilo acá y tocá "Crear cuenta". Vence en ${r.vence_en_minutos ?? 10} minutos.`;
    inputCodigo.value = '';
    inputCodigo.focus();
    esperarParaReenviar(r.reenviar_en_segundos ?? 60);
  } catch (error) {
    if (!error?.datos) {
      botonReenviar.disabled = false;
      mostrarError('No se pudo conectar con el servidor. Probá de nuevo en un momento.');
      return;
    }
    // 400: el teléfono no sirve (en su campo). 429: hay que esperar. 503: WhatsApp no anda.
    Object.entries(error.datos.campos ?? {}).forEach(([campo, mensaje]) => mostrarErrorDeCampo(campo, mensaje));
    if (error.estado === 429) {
      esperarParaReenviar(error.datos.espera_segundos ?? 60);
    } else {
      botonReenviar.disabled = false;
    }
    mostrarError(error.estado === 400 ? 'Revisá el teléfono: ahí te llega el código por WhatsApp.' : error.datos.error);
  }
}

// "Reenviar código" se habilita después de la espera que indica el servidor.
function esperarParaReenviar(segundos) {
  clearInterval(cuentaRegresiva);
  let quedan = segundos;
  const pintar = () => {
    botonReenviar.disabled = quedan > 0;
    botonReenviar.textContent = quedan > 0 ? `Reenviar código (${quedan} s)` : 'Reenviar código';
  };
  pintar();
  cuentaRegresiva = setInterval(() => {
    quedan -= 1;
    pintar();
    if (quedan <= 0) clearInterval(cuentaRegresiva);
  }, 1000);
}

botonReenviar.addEventListener('click', () => {
  limpiarErrores();
  pedirCodigo();
});

// Si cambia el teléfono, el código pedido ya no sirve: hay que pedir otro.
inputTelefono.addEventListener('input', () => {
  if (codigoEnviadoA !== null && !codigoVigente()) {
    campoCodigo.hidden = true;
    inputCodigo.value = '';
  }
});

// ---------- Mensajes ----------

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
