/**
 * contacto-panel.js — Tarjeta "Contactanos" del panel del cliente (paneles/panel-cliente.html).
 *
 * Pone el horario de atención que configuró la veterinaria (GET /api/pacientes/horario, el mismo que
 * usan los turnos). Si no se puede leer, queda el de siempre, que ya está escrito en el HTML.
 */
import { horarioDeAtencion } from './horario.js';

const $horario = document.getElementById('horario-atencion');
if ($horario) {
  const { apertura, cierre } = await horarioDeAtencion();
  $horario.textContent = `De ${apertura} a ${cierre}`;
}
