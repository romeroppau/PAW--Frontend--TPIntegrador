/**
 * volver-adopciones.js — El "Volver" de las fichas que se abren desde las adopciones de la veterinaria.
 *
 * Desde "En curso" y "Finalizadas" (js/adopciones-vet.js), los enlaces al animal, al rescatista y al
 * adoptante llevan ?desde=adopciones-en-curso o ?desde=adopciones-finalizadas. La ficha que se abre
 * (cliente/mascota.html, panel/cliente.html, panel/rescatista.html) cambia su "Volver" para regresar
 * a esa pestaña. Desde cualquier otro lado, el "Volver" queda como estaba.
 */
const DESTINOS = {
  'adopciones-en-curso': ['← Volver a adopciones en curso', '/panel/adopciones.html#en-curso'],
  'adopciones-finalizadas': ['← Volver a adopciones finalizadas', '/panel/adopciones.html#finalizadas'],
};

/** Le suma a un enlace de qué pestaña viene. */
export function conOrigen(enlace, desde) {
  const url = new URL(enlace.getAttribute('href'), location.origin);
  url.searchParams.set('desde', desde);
  enlace.setAttribute('href', url.pathname + url.search);
  return enlace;
}

/** Si la página se abrió desde las adopciones, su "Volver" regresa ahí. */
export function volverAAdopciones(volver) {
  const destino = DESTINOS[new URLSearchParams(location.search).get('desde')];
  if (!volver || !destino) return false;
  volver.textContent = destino[0];
  volver.setAttribute('href', destino[1]);
  return true;
}
