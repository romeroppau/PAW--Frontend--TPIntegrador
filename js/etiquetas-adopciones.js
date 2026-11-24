// Textos y estilos de los estados del circuito de adopción (contrato-adopciones.md del repo Adopciones).
import { el } from './ui.js';

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
export function bloquePostulacion(p) {
  const caja = el('div', '', { class: 'tu-postulacion' });
  const linea = el('p', 'Tu postulación: ');
  linea.append(insignia(p.estado));
  caja.append(linea);
  const paso = seguimiento(p);
  if (paso) caja.append(el('p', paso, { class: 'datos' }));
  return caja;
}
