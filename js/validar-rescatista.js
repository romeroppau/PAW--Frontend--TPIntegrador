/**
 * validar-rescatista.js — Aprobar o rechazar (con motivo) a un rescatista pendiente. Lo usan la
 * pestaña Rescatistas (js/adopciones-vet.js) y su perfil (js/rescatista-perfil.js).
 *
 * API (Backend, docs/api/contrato.md, "Rescatistas"):
 *   POST /api/rescatistas/{id}/aprobar               sin cuerpo
 *   POST /api/rescatistas/{id}/rechazar  {"motivo"}  de 3 a 255 letras; le llega al rescatista
 */
import { api } from './api.js';
import { el } from './ui.js';
import { mensajeDeError } from './etiquetas-adopciones.js';

/**
 * Los botones "Aprobar" y "Rechazar" de un rescatista. "Rechazar" abre el campo del motivo (es
 * obligatorio): así no se rechaza a nadie de un clic. alTerminar() se llama cuando la API respondió bien.
 * @returns {HTMLElement}
 */
export function accionesRescatista(rescatista, alTerminar) {
  const caja = el('div', '', { class: 'acciones-rescatista' });
  const botones = el('div', '', { class: 'acciones' });
  const error = el('span', '', { class: 'campo-error', role: 'alert' });

  const aprobar = el('button', 'Aprobar', { type: 'button', class: 'boton boton-chico' });
  const abrirRechazo = el('button', 'Rechazar', { type: 'button', class: 'boton boton-borde boton-chico', 'aria-expanded': 'false' });
  botones.append(aprobar, abrirRechazo);

  // El motivo, oculto hasta que se toca "Rechazar".
  const form = el('form', '', { class: 'form-linea', novalidate: '', hidden: '' });
  const etiqueta = el('label', 'Motivo del rechazo');
  const motivo = el('input', '', { type: 'text', name: 'motivo', maxlength: '255', required: '' });
  etiqueta.append(motivo);
  const confirmarRechazo = el('button', 'Confirmar rechazo', { type: 'submit', class: 'boton boton-chico boton-peligro' });
  const cancelar = el('button', 'Cancelar', { type: 'button', class: 'boton boton-borde boton-chico' });
  form.append(etiqueta, confirmarRechazo, cancelar);
  form.append(el('span', `${rescatista.nombre} no va a poder publicar. El motivo le llega en un aviso.`, { class: 'ayuda' }));

  async function enviar(ruta, cuerpo, boton) {
    error.textContent = '';
    boton.disabled = true;
    try {
      await api(ruta, { metodo: 'POST', cuerpo });
      alTerminar();
    } catch (e) {
      error.textContent = e?.datos?.campos?.motivo ?? mensajeDeError(e, 'No se pudo hacer. Probá de nuevo.');
      boton.disabled = false;
    }
  }

  aprobar.addEventListener('click', () => enviar(`/api/rescatistas/${rescatista.id}/aprobar`, null, aprobar));
  abrirRechazo.addEventListener('click', () => {
    form.hidden = false;
    abrirRechazo.setAttribute('aria-expanded', 'true');
    motivo.focus();
  });
  cancelar.addEventListener('click', () => {
    form.hidden = true;
    abrirRechazo.setAttribute('aria-expanded', 'false');
    error.textContent = '';
    abrirRechazo.focus();
  });
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    enviar(`/api/rescatistas/${rescatista.id}/rechazar`, { motivo: motivo.value.trim() }, confirmarRechazo);
  });

  caja.append(botones, form, error);
  return caja;
}

// El nombre del rescatista como enlace a su perfil (panel/rescatista.html).
export const enlacePerfil = (rescatista) => el('a', rescatista.nombre, {
  href: '/panel/rescatista.html?id=' + encodeURIComponent(rescatista.id),
  title: 'Ver el perfil de ' + rescatista.nombre,
});
