/**
 * horario-portada.js — El horario de atención de la portada (index.html, "¿Dónde nos encontramos?").
 *
 * Son las horas que configura la veterinaria (GET /api/pacientes/horario, público), las mismas que
 * usan los turnos y "Contactanos" de los paneles. Si no se pueden leer, quedan las del HTML.
 */
import { horarioDeAtencion } from './horario.js';

const { apertura, cierre } = await horarioDeAtencion();
document.getElementById('hora-apertura').textContent = apertura;
document.getElementById('hora-cierre').textContent = cierre;
