/**
 * horario-portada.js — El horario de atención de la portada (index.html, "¿Dónde nos encontramos?").
 *
 * Son las horas que configura la veterinaria (GET /api/pacientes/horario, público), las mismas que
 * usan los turnos y "Contactanos" de los paneles: una franja o dos (horario cortado). Si no se pueden
 * leer, queda lo del HTML.
 */
import { horarioDeAtencion, textoHorario } from './horario.js';

document.getElementById('horario-texto').textContent = textoHorario(await horarioDeAtencion());
