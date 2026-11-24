/**
 * contacto-panel.js — Tarjeta "Contactanos" del panel del cliente (paneles/panel-cliente.html).
 *
 * Pone el horario de atención que configuró la veterinaria (GET /api/pacientes/horario, el mismo que
 * usan los turnos). Si no se puede leer, queda el de siempre, que ya está escrito en el HTML.
 */
import { horarioDeAtencion, textoHorario } from './horario.js';

const $horario = document.getElementById('horario-atencion');
if ($horario) {
  const texto = textoHorario(await horarioDeAtencion());   // "de 09:00 a 13:00 y de 16:00 a 19:00"
  $horario.textContent = texto.charAt(0).toUpperCase() + texto.slice(1);
}
