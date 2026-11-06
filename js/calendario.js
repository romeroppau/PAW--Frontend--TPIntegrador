/**
 * calendario.js — Calendario sanitario de una mascota (cliente/calendario.html), rol 3, Entrega 4
 *
 * Se abre con ?mascota=<id>. Sin ese parámetro, el usuario elige la mascota de la lista: el cliente
 * ve las suyas y el veterinario todas (lo decide el backend). Cambiar de mascota trae su calendario
 * con fetch, sin recargar la página.
 *
 * Contrato de la API: docs/api/contrato-calendario.md y contrato-mascotas-turnos.md (repo Pacientes).
 * Seguridad: la guardia de rol la hace guardia-panel.js; la autorización real la hace el backend
 * (404 si la mascota es de otro cliente). Todo texto de la API se inserta con el() (textContent).
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { textoEspecieMascota } from './etiquetas.js';

await exigirRol(['CLIENTE', 'VETERINARIO']);

const API = '/api/pacientes/mascotas';

const select = document.getElementById('mascota');
const estado = document.getElementById('estado');
const seccion = document.getElementById('calendario');

const TIPOS = { VACUNA: 'Vacuna', DESPARASITACION: 'Desparasitación' };

// Texto y color de cada estado (contrato: APLICADO, VENCIDO, PROXIMO, PENDIENTE).
const ESTADOS = {
  APLICADO: { texto: 'Aplicada', clase: 'insignia insignia-atendido' },
  VENCIDO: { texto: 'Vencida', clase: 'insignia insignia-falta' },
  PROXIMO: { texto: 'Próximamente', clase: 'insignia insignia-bajo' },
  PENDIENTE: { texto: 'Pendiente', clase: 'insignia' }
};

// La API manda AAAA-MM-DD: se muestra como 05/11/2026 sin pasar por Date (evita correr el día por la zona horaria).
const fecha = (texto) => texto.split('-').reverse().join('/');

// Cada carga tiene un número: si se cambia de mascota rápido, se ignoran las respuestas viejas.
let pedidoActual = 0;

/* ------------------------------------------------------------------ */
/* Lista de mascotas                                                   */
/* ------------------------------------------------------------------ */

async function cargarMascotas(elegida) {
  try {
    const { mascotas } = await api(API);
    select.append(...mascotas.map((m) => el('option', `${m.nombre} (${textoEspecieMascota(m.especie)})`, { value: m.id })));
    if (mascotas.length === 0) {
      estado.textContent = 'Todavía no hay mascotas cargadas.';
      select.disabled = true;
    }
  } catch {
    estado.textContent = 'No se pudo cargar la lista de mascotas.';
  }

  // Una mascota dada de baja no aparece en la lista, pero su calendario se puede ver igual por la URL.
  if (elegida && ![...select.options].some((o) => o.value === elegida)) {
    select.append(el('option', 'Mascota ' + elegida, { value: elegida }));
  }
  select.value = elegida ?? '';
}

select.addEventListener('change', () => {
  // La URL queda con la mascota, así recargar o compartir el enlace abre la misma.
  history.replaceState(null, '', select.value ? '?mascota=' + select.value : location.pathname);
  if (select.value) {
    cargarCalendario(select.value);
  } else {
    seccion.hidden = true;
  }
});

/* ------------------------------------------------------------------ */
/* Calendario de una mascota                                           */
/* ------------------------------------------------------------------ */

async function cargarCalendario(id) {
  const pedido = ++pedidoActual;
  estado.textContent = 'Cargando…';
  try {
    const r = await api(`${API}/${encodeURIComponent(id)}/calendario-sanitario`);
    if (pedido !== pedidoActual) return;
    pintar(r);
    estado.textContent = '';
  } catch (e) {
    if (pedido !== pedidoActual) return;
    seccion.hidden = true;
    estado.textContent = e.estado === 404 ? 'No se encontró la mascota.' : 'No se pudo cargar el calendario.';
  }
}

function pintar({ mascota, vacunas_al_dia: alDia, eventos }) {
  document.getElementById('titulo-mascota').textContent = `${mascota.nombre} · ${textoEspecieMascota(mascota.especie)}`;
  document.getElementById('leyenda-tabla').textContent = 'Calendario sanitario de ' + mascota.nombre;
  document.getElementById('enlace-historial').href = '/cliente/historial.html?mascota=' + mascota.id;

  const aviso = document.getElementById('al-dia');
  aviso.hidden = eventos.length === 0;
  aviso.className = alDia ? 'mensaje mensaje-ok' : 'mensaje mensaje-error';
  aviso.textContent = alDia
    ? 'Tiene las vacunas al día.'
    : 'Tiene vacunas vencidas: pedí un turno de vacunación por WhatsApp.';

  document.getElementById('filas').replaceChildren(...eventos.map(fila));
  document.getElementById('tabla').hidden = eventos.length === 0;
  document.getElementById('vacio').hidden = eventos.length > 0;
  seccion.hidden = false;
}

function fila(evento) {
  const tr = el('tr', '', { 'data-id': evento.id });
  const estadoEvento = ESTADOS[evento.estado] ?? { texto: evento.estado, clase: 'insignia' };

  const celdaEstado = el('td');
  celdaEstado.append(el('span', estadoEvento.texto, { class: estadoEvento.clase }));
  if (evento.fecha_aplicada) {
    celdaEstado.append(el('span', 'el ' + fecha(evento.fecha_aplicada), { class: 'ayuda' }));
  }

  tr.append(el('td', fecha(evento.fecha_programada)), el('td', TIPOS[evento.tipo] ?? evento.tipo), el('td', evento.nombre), celdaEstado);
  return tr;
}

/* ------------------------------------------------------------------ */
/* Inicio                                                              */
/* ------------------------------------------------------------------ */

const pedida = new URLSearchParams(location.search).get('mascota');
const elegida = pedida && /^\d+$/.test(pedida) ? pedida : null;

await cargarMascotas(elegida);
if (elegida) cargarCalendario(elegida);
