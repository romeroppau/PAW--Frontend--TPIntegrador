// Pantalla de inicio de sesión: envía el email y la contraseña a POST /api/auth/login
// (contrato en el repo Backend: docs/api/contrato.md).

// api() es la función común de fetch del Rol 4 (js/api.js): manda JSON, agrega el header X-CSRF-Token
// cuando hace falta y reintenta si Render está dormido. Si el backend responde un error (400, 401...),
// lanza {estado, datos}, donde datos es el JSON de error ({"error": "..."}).
import { api } from '/js/api.js';

// A dónde ir después de iniciar sesión, según el rol.
// Esas páginas las hacen otros roles: si cambian de nombre, se cambia solo acá.
const HOME_POR_ROL = {
  CLIENTE: '/catalogo/catalogo.html',
  RESCATISTA: '/catalogo/catalogo.html',
  VETERINARIO: '/panel.html'
};

const formulario = document.getElementById('form-login');
const mensajeError = document.getElementById('mensaje-error');
const botonEnviar = formulario.querySelector('button[type="submit"]');

// 'submit' se dispara al enviar el formulario. Gracias a "required" en el HTML,
// el navegador solo lo dispara si los dos campos están completos.
// async permite usar await adentro: "esperá a que llegue la respuesta antes de seguir".
formulario.addEventListener('submit', async (evento) => {
  // Evita que el navegador recargue la página (lo que hace un formulario por defecto).
  evento.preventDefault();

  mostrarError('');
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
    window.location.href = HOME_POR_ROL[datos.rol] ?? '/index.html';
  } catch (error) {
    // Si el backend respondió (400 o 401), su mensaje viene en error.datos.error
    // (por ejemplo, "Email o contraseña incorrectos"). Si no hay error.datos, ni siquiera hubo respuesta.
    if (error.datos) {
      mostrarError(error.datos.error ?? 'No se pudo iniciar sesión');
    } else {
      mostrarError('No se pudo conectar con el servidor. Probá de nuevo en un momento.');
    }
  } finally {
    // finally se ejecuta siempre al final, haya salido bien o mal: vuelve a habilitar el botón.
    botonEnviar.disabled = false;
  }
});

// Muestra el mensaje de error, o lo oculta si el texto está vacío.
// textContent (y no innerHTML) muestra el texto tal cual, sin interpretarlo como HTML: evita XSS.
function mostrarError(texto) {
  mensajeError.textContent = texto;
  mensajeError.hidden = texto === '';
}
