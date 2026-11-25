/**
 * rango-fechas.js — El filtro "Desde / Hasta" de las listas de cosas que ya pasaron (ventas,
 * compras, movimientos de stock, turnos atendidos): ninguna de las dos fechas puede ser posterior
 * a hoy, y "Desde" no puede ser posterior a "Hasta".
 *
 * Los campos que sí aceptan fechas futuras (un turno, el vencimiento de un producto, el final de
 * una promoción) no usan este módulo.
 */

const ZONA = 'America/Argentina/Buenos_Aires';

/** Hoy en Argentina, como "2026-11-25" (el formato de <input type="date">). */
export const hoyArgentina = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());

/**
 * Pone hoy como máximo en los dos campos: el calendario del navegador no deja elegir días futuros.
 * Además, al elegir una fecha el otro campo se acota ("Hasta" no antes de "Desde").
 */
export function limitarAHoy($desde, $hasta) {
  const hoy = hoyArgentina();
  $desde.max = hoy;
  $hasta.max = hoy;
  const acotar = () => {
    $hasta.min = $desde.value || '';
    $desde.max = $hasta.value && $hasta.value < hoy ? $hasta.value : hoy;
  };
  $desde.addEventListener('change', acotar);
  $hasta.addEventListener('change', acotar);
}

/**
 * Revisa las fechas antes de pedir la lista (escritas a mano, el navegador no las frena):
 * devuelve null si sirven o el mensaje de error.
 */
export function errorDeRango($desde, $hasta) {
  const hoy = hoyArgentina();
  for (const campo of [$desde, $hasta]) {
    if (campo.validity?.badInput) return 'La fecha no es válida.';
    if (campo.value && campo.value > hoy) return 'La fecha no puede ser posterior a hoy.';
  }
  if ($desde.value && $hasta.value && $desde.value > $hasta.value) {
    return 'La fecha "Desde" no puede ser posterior a "Hasta".';
  }
  return null;
}
