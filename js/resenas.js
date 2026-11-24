/**
 * resenas.js — La página "Reseñas" (resenas/resenas.html). La ve cualquiera, sin sesión.
 *
 * API (repo Backend, docs/api/contrato-resenas.md):
 *   GET    /api/resenas?orden=recientes&estrellas=5&pagina=1   → { resumen, datos, hay_mas, ... } (de a 3)
 *   DELETE /api/resenas/{id}                                   borrar una propia
 *   PUT    /api/resenas/{id}/respuesta                         responder (veterinaria)
 * Todo texto de la API se inserta con textContent.
 */
import { api } from './api.js';
import { sesion } from './auth.js';
import { confirmar, el } from './ui.js';
import { fecha } from './tienda.js';
import { estrellas, promedioConComa } from './estrellas.js';

const $orden = document.getElementById('orden');
const $filtroEstrellas = document.getElementById('estrellas-filtro');
const $estado = document.getElementById('estado');
const $lista = document.getElementById('lista');
const $verMas = document.getElementById('ver-mas');
const $aviso = document.getElementById('aviso');

let pagina = 1;
let pedidoActual = 0;
let usuario = null;

// Quién mira: la veterinaria responde (y no escribe reseñas); sin sesión o con otro rol, solo se ven.
sesion.then((u) => {
  usuario = u;
  document.getElementById('accion-escribir').hidden = u?.rol === 'VETERINARIO';
}).catch(() => {}).finally(() => cargar());

async function cargar(siguiente = false) {
  const id = ++pedidoActual;
  const paginaPedida = siguiente ? pagina + 1 : 1;
  const q = new URLSearchParams({ orden: $orden.value, pagina: String(paginaPedida) });
  if ($filtroEstrellas.value) q.set('estrellas', $filtroEstrellas.value);
  $verMas.disabled = true;
  if (!siguiente) $estado.textContent = 'Cargando reseñas…';

  try {
    const { resumen, datos = [], hay_mas: hayMas } = await api('/api/resenas?' + q.toString());
    if (id !== pedidoActual) return;
    pagina = paginaPedida;
    mostrarResumen(resumen);
    const items = datos.map(item);
    if (siguiente) $lista.append(...items); else $lista.replaceChildren(...items);
    $verMas.hidden = !hayMas;
    $estado.textContent = $lista.children.length > 0 ? ''
      : $filtroEstrellas.value ? 'No hay reseñas con esa cantidad de estrellas.' : 'Todavía no hay reseñas. ¡Escribí la primera!';
  } catch {
    if (id !== pedidoActual) return;
    $estado.textContent = 'No se pudieron cargar las reseñas. Probá de nuevo en un momento.';
  } finally {
    $verMas.disabled = false;
  }
}

// El promedio, el total y una barra por cantidad de estrellas (como Google).
function mostrarResumen({ total = 0, promedio = null, por_estrellas: porEstrellas = {} } = {}) {
  document.getElementById('resumen').hidden = false;
  document.getElementById('promedio').textContent = promedio === null ? '–' : promedioConComa(promedio);
  document.getElementById('promedio-estrellas').replaceWith(Object.assign(estrellas(promedio ?? 0, 'estrellas estrellas-grandes'), { id: 'promedio-estrellas' }));
  document.getElementById('total').textContent = total === 1 ? '1 opinión' : `${total} opiniones`;

  const barras = [5, 4, 3, 2, 1].map((n) => {
    const cantidad = porEstrellas[String(n)] ?? 0;
    const porcentaje = total === 0 ? 0 : Math.round((cantidad / total) * 100);
    const barra = el('span', '', { class: 'barra' });
    barra.append(el('span', '', { class: 'barra-llena', style: `width: ${porcentaje}%` }));
    const li = el('li', '', { 'aria-label': `${n} estrellas: ${cantidad}` });
    li.append(el('span', String(n), { 'aria-hidden': 'true' }), barra, el('span', String(cantidad), { 'aria-hidden': 'true' }));
    return li;
  });
  document.getElementById('barras').replaceChildren(...barras);
}

function item(resena) {
  const li = el('li', '', { class: 'resena' });
  const cabecera = el('p', '', { class: 'resena-cabecera' });
  cabecera.append(estrellas(resena.estrellas), el('span', `${resena.autor} · ${fecha(resena.fecha)}`, { class: 'resena-autor' }));
  li.append(cabecera, el('p', resena.texto, { class: 'resena-texto' }));

  const respuesta = el('div', '', { class: 'resena-respuesta' });
  mostrarRespuesta(respuesta, resena);
  li.append(respuesta);

  const acciones = el('p', '', { class: 'resena-acciones' });
  if (resena.propia) {
    const borrar = el('button', 'Borrar', { type: 'button', class: 'boton boton-borde boton-chico', 'aria-label': 'Borrar tu reseña' });
    borrar.addEventListener('click', () => borrarResena(resena, li, borrar));
    acciones.append(borrar);
  }
  if (usuario?.rol === 'VETERINARIO') {
    const responder = el('button', resena.respuesta ? 'Editar respuesta' : 'Responder', { type: 'button', class: 'boton boton-borde boton-chico' });
    responder.addEventListener('click', () => abrirRespuesta(resena, respuesta, responder));
    acciones.append(responder);
  }
  if (acciones.children.length > 0) li.append(acciones);
  return li;
}

function mostrarRespuesta(caja, resena) {
  caja.hidden = !resena.respuesta;
  if (!resena.respuesta) { caja.replaceChildren(); return; }
  caja.replaceChildren(
    el('p', `Respuesta de HuellaVet · ${fecha(resena.respuesta.fecha)}`, { class: 'resena-respuesta-titulo' }),
    el('p', resena.respuesta.texto),
  );
}

async function borrarResena(resena, li, boton) {
  if (!await confirmar('¿Borrás tu reseña? No se puede deshacer.', { aceptar: 'Borrar', peligro: true })) return;
  boton.disabled = true;
  try {
    await api(`/api/resenas/${resena.id}`, { metodo: 'DELETE' });
    li.remove();
    avisar('Borramos tu reseña.', true);
    cargarResumenDeNuevo();
  } catch {
    boton.disabled = false;
    avisar('No se pudo borrar la reseña. Probá de nuevo.', false);
  }
}

// La veterinaria escribe (o corrige) la respuesta debajo de la reseña.
function abrirRespuesta(resena, caja, boton) {
  boton.hidden = true;
  const form = el('form', '', { class: 'form-respuesta', novalidate: '' });
  const idCampo = `respuesta-${resena.id}`;
  const area = el('textarea', '', { id: idCampo, name: 'texto', rows: '3', maxlength: '1000', 'aria-describedby': `error-${idCampo}` });
  area.value = resena.respuesta?.texto ?? '';
  const error = el('span', '', { class: 'campo-error', id: `error-${idCampo}` });
  const guardar = el('button', 'Publicar respuesta', { type: 'submit', class: 'boton boton-chico' });
  const cancelar = el('button', 'Cancelar', { type: 'button', class: 'boton boton-borde boton-chico' });
  const campo = el('div', '', { class: 'campo' });
  campo.append(el('label', 'Tu respuesta', { for: idCampo }), area, error);
  const botones = el('p', '', { class: 'resena-acciones' });
  botones.append(guardar, cancelar);
  form.append(campo, botones);
  caja.hidden = false;
  caja.after(form);
  area.focus();

  const cerrar = () => { form.remove(); boton.hidden = false; mostrarRespuesta(caja, resena); };
  cancelar.addEventListener('click', cerrar);
  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    error.textContent = '';
    if (!area.value.trim()) { error.textContent = 'Escribí la respuesta'; return; }
    guardar.disabled = true;
    try {
      const actualizada = await api(`/api/resenas/${resena.id}/respuesta`, { metodo: 'PUT', cuerpo: { texto: area.value } });
      resena.respuesta = actualizada.respuesta;
      boton.textContent = 'Editar respuesta';
      cerrar();
      avisar('Publicamos tu respuesta.', true);
    } catch (e) {
      error.textContent = e?.datos?.campos?.texto ?? 'No se pudo publicar la respuesta. Probá de nuevo.';
      guardar.disabled = false;
    }
  });
}

async function cargarResumenDeNuevo() {
  try { mostrarResumen((await api('/api/resenas?pagina=1')).resumen); } catch { /* queda el anterior */ }
}

function avisar(texto, ok) {
  $aviso.textContent = texto;
  $aviso.className = 'mensaje ' + (ok ? 'mensaje-ok' : 'mensaje-error');
  $aviso.hidden = false;
}

// Al volver de "Escribir una reseña".
if (new URLSearchParams(location.search).get('publicada') === '1') avisar('¡Gracias! Publicamos tu reseña.', true);

$orden.addEventListener('change', () => cargar());
$filtroEstrellas.addEventListener('change', () => cargar());
$verMas.addEventListener('click', () => cargar(true));
