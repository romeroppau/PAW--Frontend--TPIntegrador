/**
 * escribir-resena.js — Escribir una reseña (resenas/escribir.html).
 *
 * API: POST /api/resenas { estrellas, texto } (repo Backend, docs/api/contrato-resenas.md).
 * Clientes y rescatistas. Sin sesión: a iniciar sesión, y después de vuelta acá. La veterinaria no
 * escribe reseñas (las responde desde "Reseñas").
 */
import { api } from './api.js';
import { sesion } from './auth.js';
import { limpiarErrores, mostrarErrores } from './ui.js';

const $estado = document.getElementById('estado');
const $form = document.getElementById('form-resena');
const $opciones = document.getElementById('estrellas-opciones');

const usuario = await sesion.catch(() => null);

if (!usuario) {
  location.replace('/login/login.html?volver=' + encodeURIComponent('/resenas/escribir.html'));
} else if (!['CLIENTE', 'RESCATISTA'].includes(usuario.rol)) {
  $estado.textContent = 'Las reseñas las escriben los clientes. Desde "Ver reseñas" las podés responder.';
} else {
  $form.hidden = false;
}

// Al elegir (o pasar por encima de) una estrella, se pintan también las anteriores.
function pintar(hasta) {
  $opciones.querySelectorAll('label').forEach((label, i) => label.classList.toggle('pintada', i < hasta));
}
const elegidas = () => Number($form.elements.estrellas.value || 0);
$opciones.addEventListener('change', () => pintar(elegidas()));
$opciones.querySelectorAll('label').forEach((label, i) => {
  label.addEventListener('mouseenter', () => pintar(i + 1));
});
$opciones.addEventListener('mouseleave', () => pintar(elegidas()));

// mostrarErrores marca el campo con aria-invalid; las estrellas son 5 radios con el mismo nombre,
// así que su error se muestra aparte (en el fieldset).
function mostrar(errores, general = '') {
  const { estrellas: errorEstrellas, ...resto } = errores;
  document.getElementById('error-estrellas').textContent = errorEstrellas ?? '';
  const fieldset = $opciones.closest('fieldset');
  if (errorEstrellas) fieldset.setAttribute('aria-invalid', 'true'); else fieldset.removeAttribute('aria-invalid');
  mostrarErrores($form, resto, general);
}

$form.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  limpiarErrores($form);
  document.getElementById('error-estrellas').textContent = '';

  const estrellas = elegidas();
  const texto = $form.elements.texto.value;
  const errores = {};
  if (!estrellas) errores.estrellas = 'Elegí de 1 a 5 estrellas';
  if (!texto.trim()) errores.texto = 'Escribí tu opinión';
  if (Object.keys(errores).length > 0) {
    mostrar(errores);
    return;
  }

  const boton = $form.querySelector('button[type="submit"]');
  boton.disabled = true;
  try {
    await api('/api/resenas', { metodo: 'POST', cuerpo: { estrellas, texto } });
    location.href = '/resenas/resenas.html?publicada=1';
  } catch (error) {
    mostrar(error?.datos?.campos ?? {},
      error?.estado === 400 ? '' : 'No se pudo publicar la reseña. Probá de nuevo en un momento.');
    boton.disabled = false;
  }
});
