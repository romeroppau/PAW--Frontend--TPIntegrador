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
