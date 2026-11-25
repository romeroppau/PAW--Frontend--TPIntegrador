// Pantalla de inicio de sesión: envía el email y la contraseña a POST /api/auth/login
// (contrato en el repo Backend: docs/api/contrato.md).

// api() es la función común de fetch del Rol 4 (js/api.js): manda JSON, agrega el header X-CSRF-Token
// cuando hace falta y reintenta si Render está dormido. Si el backend responde un error (400, 401...),
// lanza {estado, datos}, donde datos es el JSON de error ({"error": "..."}).
import { api } from '/js/api.js';
import { limpiarErrores, mostrarErrores } from '/js/ui.js';

// A dónde ir después de iniciar sesión, según el rol.
// Esas páginas las hacen otros roles: si cambian de nombre, se cambia solo acá.
const HOME_POR_ROL = {
  CLIENTE: '/paneles/panel-cliente.html',
  RESCATISTA: '/paneles/panel-rescatista.html',
  VETERINARIO: '/paneles/panel-administrador.html'
};

const formulario = document.getElementById('form-login');
const mensajeError = document.getElementById('mensaje-error');
const botonEnviar = formulario.querySelector('button[type="submit"]');

// 'submit' se dispara al enviar el formulario. Tiene novalidate: los campos vacíos se avisan
// debajo de cada uno, con el estilo del sitio, y no con el cartel del navegador.
// async permite usar await adentro: "esperá a que llegue la respuesta antes de seguir".
formulario.addEventListener('submit', async (evento) => {
  // Evita que el navegador recargue la página (lo que hace un formulario por defecto).
  evento.preventDefault();

  mostrarError('');
  limpiarErrores(formulario);

  const faltan = {};
  if (document.getElementById('email').value.trim() === '') faltan.email = 'Ingresá tu email';
  if (document.getElementById('password').value === '') faltan.password = 'Ingresá tu contraseña';
  if (Object.keys(faltan).length > 0) {
    mostrarErrores(formulario, faltan);
    return;
  }

  botonEnviar.disabled = true; // evita enviarlo dos veces mientras se espera la respuesta

  try {
    // La cookie de sesión la guarda el navegador solo: este código no la toca (y no podría, es HttpOnly).
    const datos = await api('/api/auth/login', {
      metodo: 'POST',
      cuerpo: {
        email: document.getElementById('email').value,
        password: document.getElementById('password').value
      }
    });

    // Si llegó acá, el login salió bien. Al cambiar de página se pierde lo que está en memoria
    // (incluido el csrf): la página siguiente lo vuelve a pedir con GET /api/auth/yo.
    // Si venía de otra página (por ejemplo, "Agregar al carrito" sin sesión), vuelve ahí.
    window.location.href = destinoAnterior() ?? HOME_POR_ROL[datos.rol] ?? '/index.html';
  } catch (error) {
    // Si el backend respondió (400 o 401), su mensaje viene en error.datos.error
    // (por ejemplo, "Email o contraseña incorrectos"). Si no hay error.datos, ni siquiera hubo respuesta.
    if (error.estado === 429 && error.datos?.bloqueada) {
      bloquear(error.datos.segundos_restantes);
    } else if (error.datos) {
      mostrarError(error.datos.error ?? 'No se pudo iniciar sesión');
    } else {
      mostrarError('No se pudo conectar con el servidor. Probá de nuevo en un momento.');
    }
  } finally {
    // finally se ejecuta siempre al final, haya salido bien o mal: vuelve a habilitar el botón
    // (salvo que la cuenta haya quedado bloqueada).
    if (!finDelBloqueo) botonEnviar.disabled = false;
  }
});

// Cuenta bloqueada (25/11): 5 intentos fallidos la bloquean 15 minutos. El servidor responde 429 con
// los segundos que faltan; mientras tanto no se puede escribir la contraseña ni enviar, y el mensaje
// dice cuánto falta. Si se cambia el email (otra cuenta), se puede volver a intentar.
const campoPassword = document.getElementById('password');
const campoEmail = document.getElementById('email');
let finDelBloqueo = null;
let reloj = null;

function bloquear(segundos) {
  const espera = Math.max(1, Number(segundos) || 900) * 1000;
  finDelBloqueo = Date.now() + espera;
  campoPassword.value = '';
  campoPassword.disabled = true;
  botonEnviar.disabled = true;
  // Un solo mensaje con la hora (role="alert": si cambiara cada segundo, el lector lo leería cada vez).
  const hora = new Date(finDelBloqueo).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const minutos = Math.ceil(espera / 60000);
  mostrarError(`Tu cuenta quedó bloqueada por demasiados intentos fallidos. Podés volver a intentar a las ${hora} `
    + `(en ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}).`);
  clearTimeout(reloj);
  reloj = setTimeout(() => {
    desbloquear();
    mostrarError('');
  }, espera);
}

function desbloquear() {
  clearTimeout(reloj);
  finDelBloqueo = null;
  campoPassword.disabled = false;
  botonEnviar.disabled = false;
}

campoEmail.addEventListener('input', () => {
  if (finDelBloqueo) {
    desbloquear();
    mostrarError('');
  }
});

// La página a la que hay que volver después de entrar: ?volver=/catalogo/producto.html?id=101.
// Solo se aceptan direcciones de este mismo sitio: tienen que empezar con una sola "/".
// Así nadie puede armar un enlace de login que, después de entrar, lleve a otro sitio
// ("//sitio-falso.com" o "https://..."), que podría hacerse pasar por HuellaVet.
function destinoAnterior() {
  const volver = new URLSearchParams(window.location.search).get('volver');
  return volver && /^\/(?![\/\\])/.test(volver) ? volver : null;
}

// Muestra el mensaje de error, o lo oculta si el texto está vacío.
// textContent (y no innerHTML) muestra el texto tal cual, sin interpretarlo como HTML: evita XSS.
function mostrarError(texto) {
  mensajeError.textContent = texto;
  mensajeError.hidden = texto === '';
}
