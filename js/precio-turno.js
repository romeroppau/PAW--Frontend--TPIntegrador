/**
 * precio-turno.js — El precio de la consulta y las franjas promocionadas (Entrega 5).
 *
 * La consulta tiene un precio base (Configuración) y las franjas con menos turnos se promocionan con un
 * descuento desde Reportes. Cada turno guarda su precio al sacarse (turno.precio = {base, descuento,
 * final}). Contrato: repo Pacientes, docs/api/contrato-mascotas-turnos.md, "Precio del turno y franjas
 * promocionadas". Lo usan la agenda, Mis turnos y la portada. Todo texto de la API va con el().
 */
import { api } from './api.js';
import { el } from './ui.js';

export const DIAS = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado' };
export const FRANJAS = { MANIANA: 'mañana', TARDE: 'tarde' };

const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
export const dinero = (valor) => pesos.format(Number(valor || 0));
// "2026-12-31" -> "31/12"
const diaMes = (texto) => texto.slice(5, 10).split('-').reverse().join('/');

// GET /api/pacientes/promociones-turnos (público): { precio_consulta, datos }. Si no responde, null.
export async function promocionesDeTurnos() {
  try {
    return await api('/api/pacientes/promociones-turnos');
  } catch {
    return null;
  }
}

// La franja de una fecha y hora: { dia_semana: 1..7, franja: 'MANIANA' | 'TARDE' } (la misma regla
// que Pacientes: mañana es antes de las 13:00). La fecha se lee como día local, sin zona horaria.
export function franjaDe(fecha, hora) {
  const [a, m, d] = fecha.split('-').map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();   // 0 = domingo
  return { dia_semana: dia === 0 ? 7 : dia, franja: hora < '13:00' ? 'MANIANA' : 'TARDE' };
}

// El precio que tendría un turno nuevo en esa fecha y hora (el que va a guardar Pacientes):
// { base, descuento, final, nombre } — descuento y nombre (de la franja) solo si está promocionada.
export function precioPara(promos, fecha, hora) {
  const base = Number(promos?.precio_consulta ?? 0);
  if (!fecha || !hora) return null;
  const { dia_semana, franja } = franjaDe(fecha, hora);
  const promo = (promos?.datos ?? []).find((p) => p.dia_semana === dia_semana && p.franja === franja && p.hasta >= fecha);
  if (!promo) return { base, descuento: null, final: base, nombre: null };
  return { base, descuento: promo.porcentaje, final: Math.round(base * (100 - promo.porcentaje)) / 100, nombre: promo.nombre };
}

// "$ 12.000,00 (20 % off, antes $ 15.000,00)" o "$ 15.000,00".
export function textoPrecio(precio) {
  if (!precio) return '';
  return precio.descuento
    ? `${dinero(precio.final)} (${precio.descuento} % off, antes ${dinero(precio.base)})`
    : dinero(precio.final);
}

// La sección "Turnos con descuento": una línea por franja promocionada. Se oculta si no hay ninguna
// o si la API no responde.
export async function pintarTurnosConDescuento(seccion, lista) {
  const promos = await promocionesDeTurnos();
  const datos = promos?.datos ?? [];
  lista.replaceChildren(...datos.map((p) => {
    const li = el('li', '', { class: 'promo-turno' });
    li.append(
      el('strong', p.nombre),
      ` ${dinero(p.precio_promocion)} `,
      el('span', `${p.porcentaje} % off`, { class: 'insignia insignia-promo' }),
      el('span', ` antes ${dinero(p.precio)}, hasta el ${diaMes(p.hasta)}`, { class: 'ayuda' })
    );
    return li;
  }));
  seccion.hidden = datos.length === 0;
}
