/**
 * descuentos-turnos.js — "Turnos con descuento" del cliente (cliente/descuentos.html, menú Turnos →
 * "Ver descuentos"). Las franjas que la veterinaria promocionó desde Reportes
 * (GET /api/pacientes/promociones-turnos; js/precio-turno.js arma la lista).
 */
import { pintarTurnosConDescuento } from './precio-turno.js';

const estado = document.getElementById('estado');
const seccion = document.getElementById('promo-turnos');

await pintarTurnosConDescuento(seccion, document.getElementById('lista-promo-turnos'));
estado.textContent = seccion.hidden ? 'Por ahora no hay días ni horarios con descuento.' : '';
