// La campana (Entrega 5): muestra los avisos SIN LEER, los 10 más nuevos (lo decide la API). Al
// marcarlos como leídos desaparecen de acá y quedan en "Mis notificaciones" (cuenta/notificaciones.html),
// que se abre con "Ver todas". Si esa página marca avisos, avisa con el evento "notificaciones-cambiaron"
// y la campana se actualiza enseguida.
//
// Se actualiza sola cada 10 segundos mientras la pestaña está a la vista (con la pestaña en segundo
// plano no consulta), y además enseguida al abrir la campana y al volver a la pestaña. Cuando llega un
// aviso nuevo, el número de la campana late un momento.
import { api } from './api.js';
import { sesion } from './auth.js';
import { el } from './ui.js';

const INTERVALO_MS = 10000;
let boton, contador, panel, lista, timer;
let noLeidasAntes = null;   // para notar cuándo llega un aviso nuevo
let consultando = false;    // para no pedir dos veces a la vez

// "2026-11-20 16:36:00" (hora de Argentina) -> "20/11/2026 16:36": día/mes/año, como en todo el sitio.
function fechaHora(texto) {
  const [dia, hora = ''] = String(texto ?? '').split(' ');
  const [a, m, d] = dia.split('-');
  return d ? `${d}/${m}/${a} ${hora.slice(0, 5)}`.trim() : String(texto ?? '');
}

function pintar(datos) {
  const n = datos.no_leidas;
  if (noLeidasAntes !== null && n > noLeidasAntes) avisarNovedad();
  noLeidasAntes = n;
  contador.textContent = n > 99 ? '99+' : String(n);
  contador.hidden = n === 0;
  boton.setAttribute('aria-label', n ? `Notificaciones, ${n} sin leer` : 'Notificaciones');

  lista.replaceChildren();
  if (datos.datos.length === 0) {
    lista.append(el('li', 'No tenés notificaciones nuevas.', { class: 'campana-vacio' }));
    return;
  }
  for (const aviso of datos.datos) {
    const li = el('li', '', { class: aviso.leida ? 'campana-item' : 'campana-item campana-item-nueva' });
    li.append(el('p', aviso.mensaje), el('small', fechaHora(aviso.fecha)));   // texto, nunca HTML
    if (!aviso.leida) {
      const b = el('button', 'Marcar como leída', { type: 'button', class: 'boton boton-borde' });
      b.addEventListener('click', () => marcarLeida(aviso.id));
      li.append(b);
    }
    lista.append(li);
  }
}

// El número late (css/notificaciones.css, .campana-latido); se quita la clase para poder repetirlo.
function avisarNovedad() {
  contador.classList.remove('campana-latido');
  void contador.offsetWidth;            // reinicia la animación
  contador.classList.add('campana-latido');
}

async function cargar() {
  if (consultando) return;
  consultando = true;
  try { pintar(await api('/api/notificaciones')); }
  catch (e) { if (e.estado === 401) { detener(); document.querySelector('.campana')?.remove(); } }
  finally { consultando = false; }
}

function detener() {
  clearInterval(timer);
  timer = null;
}

// Consulta ya y después cada INTERVALO_MS, solo con la pestaña a la vista.
function seguir() {
  detener();
  if (document.hidden) return;
  cargar();
  timer = setInterval(cargar, INTERVALO_MS);
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
      <p class="campana-pie"><a href="/cuenta/notificaciones.html">Ver todas</a></p>
    </div>`;                              // HTML fijo, sin datos de usuarios
  zona.prepend(caja);

  boton = caja.querySelector('.campana-boton');
  contador = caja.querySelector('.campana-contador');
  panel = caja.querySelector('.campana-panel');
  lista = caja.querySelector('.campana-lista');

  boton.addEventListener('click', () => {
    const abrir = panel.hidden;
    alternar(abrir);
    if (abrir) cargar();                  // al abrirla, lo más nuevo
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) { alternar(false); boton.focus(); }
  });
  document.addEventListener('click', (e) => { if (!caja.contains(e.target)) alternar(false); });

  window.addEventListener('notificaciones-cambiaron', cargar);

  // Al volver a la pestaña (o a la ventana) se pone al día enseguida.
  document.addEventListener('visibilitychange', seguir);
  window.addEventListener('focus', () => { if (!document.hidden) cargar(); });

  seguir();
}