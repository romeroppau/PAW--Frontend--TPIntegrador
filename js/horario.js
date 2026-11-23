/**
 * horario.js — El horario de atención que configuró la veterinaria (Entrega 5), para los campos de
 * hora de los turnos (agenda y chequeo de adopción).
 *
 * Datos: GET /api/pacientes/horario → { apertura: "09:00", cierre: "19:00", franjas: [{ apertura, cierre }, …] }
 * (contrato-mascotas-turnos.md del repo Pacientes). franjas tiene una (de corrido) o dos (horario
 * cortado, por ejemplo de 09:00 a 13:00 y de 16:00 a 19:00). Un turno puede empezar dentro de alguna
 * franja, hasta un minuto antes de su cierre. La regla la aplica Pacientes al guardar; acá solo sirve
 * para que el campo no ofrezca horas fuera del día y para explicar el horario.
 */
import { api } from './api.js';

const POR_DEFECTO = { apertura: '08:00', cierre: '20:00', franjas: [{ apertura: '08:00', cierre: '20:00' }] };

// Si no se puede leer (por ejemplo, sin conexión), el de siempre: el servidor igual valida.
export async function horarioDeAtencion() {
  try {
    const { apertura, cierre, franjas } = await api('/api/pacientes/horario');
    if (!apertura || !cierre) return POR_DEFECTO;
    return { apertura, cierre, franjas: franjas?.length ? franjas : [{ apertura, cierre }] };
  } catch {
    return POR_DEFECTO;
  }
}

// "de 09:00 a 13:00 y de 16:00 a 19:00"
export function textoHorario({ apertura, cierre, franjas }) {
  return (franjas ?? [{ apertura, cierre }]).map((f) => `de ${f.apertura} a ${f.cierre}`).join(' y ');
}

// "20:00" → "19:59"
function unMinutoAntes(hora) {
  const [h, m] = hora.split(':').map(Number);
  const total = h * 60 + m - 1;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

// Pone el rango a un <input type="time"> (de la primera apertura al último cierre: el corte del
// mediodía no se puede marcar en el campo, lo avisa la ayuda y lo valida el servidor) y, si se pasa,
// el texto de ayuda que lo explica.
export function aplicarHorario(input, horario, ayuda = null) {
  input.min = horario.apertura;
  input.max = unMinutoAntes(horario.cierre);
  if (ayuda) ayuda.textContent = `Horario de atención: ${textoHorario(horario)}.`;
}
