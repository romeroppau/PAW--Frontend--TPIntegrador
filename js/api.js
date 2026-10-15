// Función común de fetch. Todas las páginas la usan.
// Misma origen (Vercel reenvía /api/ a Render): la cookie SameSite=Strict viaja sola.
let csrfToken = null;

// Se llama desde el HTML de cada página, con el token que genera el servidor.
export function setCsrf(token) { csrfToken = token; }

// Función de fetch con JSON, CSRF y reintentos ante timeout o error de red.
export async function api(ruta, { metodo = 'GET', cuerpo = null, reintentar = true } = {}) {
  
  const opciones = { // Opciones de fetch. Se envía la cookie SameSite=Strict automáticamente.
    method: metodo,
    credentials: 'same-origin',
    headers: { 'Accept': 'application/json' }
  };
  if (cuerpo !== null) { // Si hay cuerpo, se envía como JSON y se agrega el header correspondiente
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  if (metodo !== 'GET' && csrfToken) opciones.headers['X-CSRF-Token'] = csrfToken; // Se envía el token CSRF en todas las solicitudes que no sean GET, para proteger contra CSRF. El token se obtiene del servidor y se establece con setCsrf().

  const controlador = new AbortController(); // Permite abortar la solicitud si tarda demasiado
  const temporizador = setTimeout(() => controlador.abort(), 15000); // 15 segundos de timeout
  opciones.signal = controlador.signal; // Se pasa la señal de abort al fetch

  try { // Se hace la solicitud
    const respuesta = await fetch(ruta, opciones);
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw { estado: respuesta.status, datos };
    return datos;
  } catch (e) {
    // Render dormido: un reintento ante timeout o error de red
    if (reintentar && (e.name === 'AbortError' || e instanceof TypeError)) {
      return api(ruta, { metodo, cuerpo, reintentar: false });
    }
    throw e;
  } finally {
    clearTimeout(temporizador); // Se limpia el temporizador para evitar fugas de memoria
  }
}

// Función de debounce: retrasa la ejecución de una función hasta que hayan pasado ms milisegundos desde la última vez que se llamó. Evita hacer demasiadas solicitudes al servidor mientras el usuario escribe.
export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}