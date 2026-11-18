import { api } from './api.js';
import { sesion } from './auth.js';
import { el } from './ui.js';

const INTERVALO_MS = 60000;
let boton, contador, panel, lista, timer;

function pintar(datos) {
  const n = datos.no_leidas;
  contador.textContent = n > 99 ? '99+' : String(n);
  contador.hidden = n === 0;
  boton.setAttribute('aria-label', n ? `Notificaciones, ${n} sin leer` : 'Notificaciones');

  lista.replaceChildren();
  if (datos.datos.length === 0) {
    lista.append(el('li', 'No tenés notificaciones.', { class: 'campana-vacio' }));
    return;
  }
  for (const aviso of datos.datos) {
    const li = el('li', '', { class: aviso.leida ? 'campana-item' : 'campana-item campana-item-nueva' });
    li.append(el('p', aviso.mensaje), el('small', aviso.fecha.slice(0, 16)));   // texto, nunca HTML
    if (!aviso.leida) {
      const b = el('button', 'Marcar como leída', { type: 'button', class: 'boton boton-borde' });
      b.addEventListener('click', () => marcarLeida(aviso.id));
      li.append(b);
    }
    lista.append(li);
  }
}

async function cargar() {
  try { pintar(await api('/api/notificaciones')); }
  catch (e) { if (e.estado === 401) { clearInterval(timer); document.querySelector('.campana')?.remove(); } }
}

async function marcarLeida(id) {
  try {
    await api(`/api/notificaciones/${id}/leida`, { metodo: 'POST' });
    await cargar();                       // la lista y el contador se actualizan sin recargar
  } catch { /* si falla, el aviso sigue sin leer */ }
}

function alternar(abrir) {
  panel.hidden = !abrir;
  boton.setAttribute('aria-expanded', String(abrir));
}

const usuario = await sesion;
const zona = document.getElementById('sesion');

if (usuario && zona) {
  const caja = el('div', '', { class: 'campana' });
  caja.innerHTML = `
    <button type="button" class="campana-boton" aria-expanded="false" aria-controls="campana-panel" aria-label="Notificaciones">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 3a6 6 0 0 0-6 6v4l-2 3h16l-2-3V9a6 6 0 0 0-6-6zm-2 15a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      <span class="campana-contador" aria-live="polite" hidden>0</span>
    </button>
    <div class="campana-panel" id="campana-panel" hidden>
      <h2 class="campana-titulo">Notificaciones</h2>
      <ul class="campana-lista"></ul>
    </div>`;                              // HTML fijo, sin datos de usuarios
  zona.prepend(caja);

  boton = caja.querySelector('.campana-boton');
  contador = caja.querySelector('.campana-contador');
  panel = caja.querySelector('.campana-panel');
  lista = caja.querySelector('.campana-lista');

  boton.addEventListener('click', () => alternar(panel.hidden));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) { alternar(false); boton.focus(); }
  });
  document.addEventListener('click', (e) => { if (!caja.contains(e.target)) alternar(false); });

  await cargar();
  timer = setInterval(cargar, INTERVALO_MS);
}