/**
 * horario.js — El horario de atención que configuró la veterinaria (Entrega 5), para los campos de
 * hora de los turnos (agenda y chequeo de adopción).
 *
 * Datos: GET /api/pacientes/horario → { apertura: "08:00", cierre: "20:00" } (contrato-mascotas-turnos.md
 * del repo Pacientes). Un turno puede empezar desde la apertura y hasta un minuto antes del cierre.
 * La regla la aplica Pacientes al guardar; acá solo sirve para que el campo no ofrezca horas inválidas.
 */
import { api } from './api.js';

const POR_DEFECTO = { apertura: '08:00', cierre: '20:00' };

// Si no se puede leer (por ejemplo, sin conexión), el de siempre: el servidor igual valida.
export async function horarioDeAtencion() {
  try {
    const { apertura, cierre } = await api('/api/pacientes/horario');
    return apertura && cierre ? { apertura, cierre } : POR_DEFECTO;
  } catch {
    return POR_DEFECTO;
  }
}

// "20:00" → "19:59"
function unMinutoAntes(hora) {
  const [h, m] = hora.split(':').map(Number);
  const total = h * 60 + m - 1;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Pone el rango a un <input type="time"> y, si se pasa, el texto de ayuda que lo explica.
export function aplicarHorario(input, { apertura, cierre }, ayuda = null) {
  input.min = apertura;
  input.max = unMinutoAntes(cierre);
  if (ayuda) ayuda.textContent = `Horario de atención: de ${apertura} a ${cierre}.`;
}
