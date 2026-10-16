/**
 * ui.js — Utilidades de interfaz compartidas por todas las pantallas.
 *
 * Regla de seguridad: el texto que viene de la base de datos SIEMPRE se inserta con
 * textContent (lo que hace el() acá). Nunca con innerHTML: si alguien guardara un
 * <script> en un nombre de producto, con innerHTML se ejecutaría en el navegador de
 * otros usuarios (ataque XSS). Con textContent se muestra como texto plano.
 */

/**
 * Crea un elemento HTML con texto y atributos.
 *
 * @param {string} tag         Nombre de la etiqueta ('tr', 'td', 'a', 'button'...).
 * @param {string|number} [texto]  Contenido de texto (se convierte a string).
 * @param {object} [atributos] Pares nombre/valor, por ejemplo { href: '/x', class: 'boton' }.
 * @returns {HTMLElement}
 *
 * Ejemplo: el('a', 'Editar', { href: '/panel/producto-form.html?id=3' })
 */
export function el(tag, texto = '', atributos = {}) {
  const nodo = document.createElement(tag);
  if (texto !== '') nodo.textContent = String(texto);
  for (const [k, v] of Object.entries(atributos)) nodo.setAttribute(k, v);
  return nodo;
}

/**
 * Borra los mensajes de error de un formulario: los de cada campo (.campo-error),
 * las marcas aria-invalid y el mensaje general (#error-general).
 * Se llama al principio de cada envío, para no mostrar errores del intento anterior.
 */
export function limpiarErrores(form) {
  form.querySelectorAll('.campo-error').forEach((n) => { n.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach((n) => n.removeAttribute('aria-invalid'));
  const general = form.querySelector('#error-general');
  if (general) { general.textContent = ''; general.hidden = true; }
}

/**
 * Muestra errores de validación en un formulario.
 *
 * Convención de ids en el HTML: el mensaje del campo "email" va en <span id="error-email">,
 * y el mensaje general del formulario en <p id="error-general">.
 *
 * @param {HTMLFormElement} form
 * @param {object} [errores]  { campo: "mensaje" }, tal como lo devuelve el backend en un 400.
 * @param {string} [general]  Mensaje para todo el formulario (por ejemplo "Credenciales incorrectas").
 */
export function mostrarErrores(form, errores = {}, general = '') {
  for (const [campo, mensaje] of Object.entries(errores)) {
    const destino = document.getElementById('error-' + campo);
    const input = form.elements[campo];
    if (destino) destino.textContent = mensaje;
    if (input) input.setAttribute('aria-invalid', 'true'); // marca el campo para lectores de pantalla y estilos (borde rojo)
  }
  const caja = form.querySelector('#error-general');
  if (caja && general) { caja.textContent = general; caja.hidden = false; } // role="alert": se anuncia solo
}