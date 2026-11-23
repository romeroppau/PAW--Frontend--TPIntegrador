/**
 * mascota-datos.js — Lo común para mostrar una mascota (la lista de mascotas y su ficha).
 */
import { el } from './ui.js';

/** 30 -> "2 años y 6 meses"; null -> "—". */
export function edad(meses) {
  if (meses === null || meses === undefined) return '—';
  if (meses < 1) return 'Menos de 1 mes';
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  const textoMeses = resto === 1 ? '1 mes' : `${resto} meses`;
  if (anios === 0) return textoMeses;
  const textoAnios = anios === 1 ? '1 año' : `${anios} años`;
  return resto === 0 ? textoAnios : `${textoAnios} y ${textoMeses}`;
}

/** El enlace a la ficha de una mascota (desde Mascotas, la Agenda y la ficha del cliente). */
export function enlaceMascota(mascota, contenido = null) {
  const enlace = el('a', contenido === null ? mascota.nombre : '', {
    href: '/cliente/mascota.html?id=' + encodeURIComponent(mascota.id),
    'aria-label': 'Ver la ficha de ' + mascota.nombre,
  });
  if (contenido !== null) enlace.append(contenido);
  return enlace;
}
