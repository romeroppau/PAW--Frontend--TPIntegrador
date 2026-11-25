// Textos y estilos de los estados del circuito de adopción (contrato-adopciones.md del repo Adopciones).
import { api } from './api.js';
import { confirmar, el } from './ui.js';

const ESTADOS = {
  // Publicación (moderación)
  PENDIENTE: ['Esperando revisión', 'insignia-espera'],
  APROBADA: ['Aprobada', 'insignia-listo'],
  RECHAZADA: ['Rechazada', 'insignia-rechazo'],
  // Adopción
  PUBLICADA: ['Publicada, sin postulantes', ''],
  CON_POSTULANTES: ['Con postulantes', 'insignia-pedido'],
  ADOPTANTE_ELEGIDO: ['Adoptante elegido', 'insignia-espera'],
  CHEQUEO_PENDIENTE: ['Chequeo pendiente', 'insignia-espera'],
  FINALIZADA: ['Adoptado', 'insignia-listo'],
  CANCELADA: ['Cancelada', 'insignia-anulado'],
  BAJA: ['Dada de baja', 'insignia-anulado'],
  // Postulación
  ELEGIDA: ['Elegida', 'insignia-listo'],
  // Rescatista
  APROBADO: ['Aprobado', 'insignia-listo'],
  RECHAZADO: ['Rechazado', 'insignia-rechazo'],
  // Turno de chequeo
  PROGRAMADO: ['Programado', ''],
  EN_ATENCION: ['En atención', 'insignia-pedido'],
  ATENDIDO: ['Atendido', 'insignia-atendido'],
  CANCELADO: ['Cancelado', 'insignia-anulado'],
  AUSENTE: ['Ausente', 'insignia-falta'],
};

export const textoEstado = (codigo) => ESTADOS[codigo]?.[0] ?? codigo;

// Estados de una postulación (24/11). RECHAZADA: la rescatista eligió a otra persona, o se cerró la
// publicación o la adopción. CANCELADA: la canceló el cliente. Al cliente se le dice "por vos".
const ESTADOS_POSTULACION = {
  PENDIENTE: ['Esperando revisión', 'insignia-espera'],
  ELEGIDA: ['Elegida', 'insignia-listo'],
  RECHAZADA: ['Cancelada por la rescatista', 'insignia-anulado'],
  CANCELADA: ['Cancelada por el postulante', 'insignia-anulado'],
};

/**
 * La insignia de una postulación. mira: quién la ve. Al cliente que la canceló y a la rescatista que
 * la cerró se les dice "Cancelada por vos"; a la veterinaria, quién la canceló.
 */
export function insigniaPostulacion(codigo, { mira = 'veterinaria' } = {}) {
  let [texto, clase] = ESTADOS_POSTULACION[codigo] ?? [codigo, ''];
  if ((mira === 'postulante' && codigo === 'CANCELADA') || (mira === 'rescatista' && codigo === 'RECHAZADA')) {
    texto = 'Cancelada por vos';
  }
  return el('span', texto, { class: ('insignia ' + clase).trim() });
}

/**
 * Cancela una postulación PENDIENTE del cliente (POST /api/adopciones/postulaciones/{id}/cancelar),
 * después de confirmarlo. Devuelve la postulación actualizada, null si no confirmó, o lanza el error.
 */
export async function cancelarPostulacion(p) {
  const pregunta = `¿Cancelar tu postulación para adoptar a ${p.publicacion.mascota.nombre}? `
    + 'Si cambiás de idea, podés volver a postularte mientras siga disponible.';
  if (!await confirmar(pregunta, { aceptar: 'Cancelar postulación', peligro: true })) return null;
  const { postulacion } = await api(`/api/adopciones/postulaciones/${encodeURIComponent(p.id)}/cancelar`, { metodo: 'POST' });
  return postulacion;
}

// <span class="insignia ...">Texto</span>
export function insignia(codigo) {
  const [texto, clase] = ESTADOS[codigo] ?? [codigo, ''];
  return el('span', texto, { class: ('insignia ' + clase).trim() });
}

// 36 meses → "3 años"; 14 → "1 año y 2 meses"; 2 → "2 meses" (igual que en mascotas.js).
export function edad(meses) {
  if (meses === null || meses === undefined) return 'Edad desconocida';
  if (meses < 1) return 'Menos de 1 mes';
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  const textoMeses = resto === 1 ? '1 mes' : `${resto} meses`;
  if (anios === 0) return textoMeses;
  const textoAnios = anios === 1 ? '1 año' : `${anios} años`;
  return resto === 0 ? textoAnios : `${textoAnios} y ${textoMeses}`;
}

// "2026-11-17 10:30:00" → "17/11/2026"
export const fecha = (texto) => (texto ? texto.slice(0, 10).split('-').reverse().join('/') : '—');

// Lee un archivo elegido en un <input type="file"> como data URL (así viaja la foto en el JSON).
export function leerComoDataUrl(archivo) {
  return new Promise((resolver, rechazar) => {
    const lector = new FileReader();
    lector.onload = () => resolver(lector.result);
    lector.onerror = () => rechazar(lector.error);
    lector.readAsDataURL(archivo);
  });
}

// El mensaje de error de un pedido fallido (el backend lo manda en "error").
export const mensajeDeError = (e, porDefecto) => e?.datos?.error ?? porDefecto;

// "2026-11-26" → "jue 26/11" (al mediodía UTC, para que la zona horaria no corra el día).
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export function diaCorto(f) {
  const [, mes, dia] = f.split('-');
  return `${DIAS[new Date(f + 'T12:00:00Z').getUTCDay()]} ${dia}/${mes}`;
}

// En qué paso está la postulación: para la elegida, el de la adopción y el turno del chequeo.
export function seguimiento(p) {
  if (p.estado === 'PENDIENTE') return 'La rescatista todavía está eligiendo.';
  if (p.estado === 'RECHAZADA') return 'La rescatista eligió a otra persona o cerró la publicación.';
  if (p.estado === 'CANCELADA') return 'La cancelaste. Si cambiás de idea, podés volver a postularte mientras siga disponible.';
  if (p.estado !== 'ELEGIDA') return '';
  const { estado: estadoAdopcion, turno_chequeo: turno } = p.adopcion;
  if (estadoAdopcion === 'FINALIZADA') return '¡Adopción completa! Ya está en Mis mascotas.';
  if (estadoAdopcion === 'CANCELADA') return 'La adopción se canceló.';
  if (turno?.estado === 'PROGRAMADO' || turno?.estado === 'EN_ATENCION') return `Turno de chequeo: ${diaCorto(turno.fecha)} a las ${turno.hora}.`;
  if (turno?.estado === 'ATENDIDO') return 'Chequeo hecho: falta que la veterinaria cierre la adopción.';
  if (turno) return 'El turno del chequeo se canceló: te vamos a dar otro.';
  return 'Esperando el turno del chequeo: te avisamos cuando esté.';
}

/**
 * "Tu postulación: Pendiente" y en qué paso está, para un animal al que el cliente ya se postuló
 * (en "Animales que buscan familia" y en la publicación, en lugar de "Quiero adoptarlo": no se puede
 * postular dos veces por el mismo animal).
 */
export function bloquePostulacion(p, { cancelable = false } = {}) {
  const caja = el('div', '', { class: 'tu-postulacion' });
  const linea = el('p', 'Tu postulación: ');
  linea.append(insigniaPostulacion(p.estado, { mira: 'postulante' }));
  caja.append(linea);
  const paso = seguimiento(p);
  if (paso) caja.append(el('p', paso, { class: 'datos' }));
  // Mientras la rescatista no eligió, se puede cancelar (24/11). La caja se reemplaza por la nueva.
  if (cancelable && p.estado === 'PENDIENTE') {
    const error = el('p', '', { class: 'campo-error', role: 'alert' });
    const boton = el('button', 'Cancelar postulación', { type: 'button', class: 'boton boton-borde boton-chico' });
    boton.addEventListener('click', async () => {
      error.textContent = '';
      boton.disabled = true;
      try {
        const actualizada = await cancelarPostulacion(p);
        if (actualizada) caja.replaceWith(bloquePostulacion(actualizada, { cancelable }));
      } catch (e) {
        error.textContent = e?.datos?.error ?? 'No se pudo cancelar la postulación. Probá de nuevo.';
      } finally {
        boton.disabled = false;
      }
    });
    caja.append(el('div', '', { class: 'acciones' }), error);
    caja.querySelector('.acciones').append(boton);
  }
  return caja;
}
