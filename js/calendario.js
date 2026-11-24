/**
 * calendario.js — Calendario sanitario de una mascota (cliente/calendario.html), rol 3, Entrega 4
 *
 * Se abre con ?mascota=<id>. Sin ese parámetro, el usuario elige la mascota de la lista: el cliente
 * ve las suyas y el veterinario todas (lo decide el backend). Cambiar de mascota trae su calendario
 * con fetch, sin recargar la página.
 *
 * Entrega 5: la lista trae solo las mascotas con vacunas o desparasitaciones registradas
 * (con_calendario=1). La veterinaria ve el dueño en cada opción y arriba del calendario (con enlace a
 * su ficha), y tiene un buscador por mascota o dueño que vuelve a pedir la lista (buscar=).
 *
 * Contrato de la API: docs/api/contrato-calendario.md y contrato-mascotas-turnos.md (repo Pacientes).
 * Seguridad: la guardia de rol la hace guardia-panel.js; la autorización real la hace el backend
 * (404 si la mascota es de otro cliente). Todo texto de la API se inserta con el() (textContent).
 */
import { api, debounce } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { textoEspecieMascota } from './etiquetas.js';
import { enlaceDuenio } from './personas.js';

const usuario = await exigirRol(['CLIENTE', 'VETERINARIO']);
const esVeterinario = usuario.rol === 'VETERINARIO';

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

// "Bobby (Gato)"; para la veterinaria, con el dueño: "Bobby (Gato) · Ana Pérez".
function textoOpcion(m) {
  const texto = `${m.nombre} (${textoEspecieMascota(m.especie)})`;
  return esVeterinario && m.duenio?.nombre ? `${texto} · ${m.duenio.nombre}` : texto;
}

let pedidoLista = 0;

// buscar: lo escrito en el buscador de la veterinaria (vacío = todas).
async function cargarMascotas(elegida, buscar = '') {
  const pedido = ++pedidoLista;
  const primera = select.options[0];
  try {
    const parametros = new URLSearchParams({ con_calendario: '1' });
    if (buscar) parametros.set('buscar', buscar);
    const { mascotas } = await api(`${API}?${parametros}`);
    if (pedido !== pedidoLista) return;
    select.replaceChildren(primera, ...mascotas.map((m) => el('option', textoOpcion(m), { value: m.id })));
    select.disabled = mascotas.length === 0 && !buscar;
    if (mascotas.length === 0) {
      estado.textContent = buscar ? `Ninguna mascota con calendario coincide con "${buscar}".`
        : 'Todavía no hay mascotas con vacunas o desparasitaciones registradas.';
    } else if (!select.value || buscar) {
      estado.textContent = buscar ? `${mascotas.length} mascotas coinciden.` : '';
    }
  } catch {
    if (pedido !== pedidoLista) return;
    estado.textContent = 'No se pudo cargar la lista de mascotas.';
  }

  // Una mascota que no está en la lista (dada de baja, o sin calendario) se puede ver igual por la URL.
  if (elegida && ![...select.options].some((o) => o.value === elegida)) {
    select.append(el('option', 'Mascota ' + elegida, { value: elegida }));
  }
  select.value = elegida ?? '';
}

// El buscador (solo la veterinaria): pide la lista de nuevo mientras escribe, sin perder la elegida.
if (esVeterinario) {
  const buscar = document.getElementById('buscar');
  document.getElementById('campo-buscar').hidden = false;
  buscar.addEventListener('input', debounce(() => {
    cargarMascotas(select.value || null, buscar.value.trim().slice(0, 80));
  }, 300));
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

  // La veterinaria ve de quién es, con enlace a la ficha del cliente.
  const duenio = document.getElementById('duenio');
  duenio.hidden = !(esVeterinario && mascota.duenio);
  if (!duenio.hidden) document.getElementById('duenio-enlace').replaceChildren(enlaceDuenio(mascota.duenio));

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
