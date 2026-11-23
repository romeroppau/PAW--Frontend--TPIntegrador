/**
 * promo-turnos-portada.js — "Turnos con descuento" de la portada (index.html, al lado del horario).
 *
 * Las franjas que la veterinaria promocionó desde Reportes (GET /api/pacientes/promociones-turnos,
 * público). Sin promociones, o si la API no responde, no se muestra nada.
 */
import { pintarTurnosConDescuento } from './precio-turno.js';

pintarTurnosConDescuento(document.getElementById('promo-turnos'), document.getElementById('lista-promo-turnos'));
