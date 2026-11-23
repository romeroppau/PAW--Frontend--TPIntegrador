/**
 * reportes.js — Panel de reportes (panel/reportes.html)
 *
 * Cinco pestañas (qué promocionar, qué liquidar, promociones publicadas, turnos atendidos, stock y
 * movimientos) y, dentro de stock, tres sub-pestañas. Cada una pide sus datos la primera vez que se
 * abre (las tres primeras, un solo pedido). La pestaña activa viaja en el hash de la URL
 * (#liquidar, #turnos-atendidos, #stock-insumos), así los enlaces de los paneles caen en la correcta.
 * Contrato: docs/api/contrato-reportes.md del repo Reportes. "Publicitar" y las promociones usan la
 * API de Inventario (docs/api/contrato-tienda.md, sección "Promociones").
 * La guardia de rol es solo comodidad de interfaz; la autorización real la hace el backend.
 * Todo texto que viene de la API se inserta con textContent (el() lo hace).
 */

import { api } from './api.js';
import { exigirRol } from './auth.js';
import { confirmar, el, limpiarErrores, mostrarErrores } from './ui.js';
import { textoEstadoInsumo } from './etiquetas.js';

await exigirRol('VETERINARIO');

const PAGINA = 25;       // filas que se muestran de a una vez
// Stock bajo: el límite que configuró la veterinaria (lo dice la API en resumen.limite_stock_bajo).
// Mientras no llega, el de siempre: 10 unidades o menos.
let stockBajo = 10;

const $ = (id) => document.getElementById(id);
const estado = $('estado');

const dinero = (v) => '$' + Number(v || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// "2026-11-28" -> "28/11/2026", sin pasar por Date para evitar corrimientos de zona horaria.
const fecha = (v) => String(v ?? '').split('-').reverse().join('/');
const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const haceDias = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return aISO(d); };

/* ------------------------------------------------------------------ */
/* Pestañas (patrón ARIA: flechas, Inicio y Fin mueven entre pestañas)  */
/* ------------------------------------------------------------------ */

// Devuelve una función que selecciona una pestaña por su data-vista.
function activarPestanas(lista, alCambiar) {
  const tabs = [...lista.querySelectorAll('[role="tab"]')];

  function seleccionar(tab, { foco = false } = {}) {
    for (const t of tabs) {
      const activa = t === tab;
      t.setAttribute('aria-selected', String(activa));
      t.tabIndex = activa ? 0 : -1;
      $(t.getAttribute('aria-controls')).hidden = !activa;
    }
    if (foco) tab.focus();
    alCambiar(tab.dataset.vista);
  }

  lista.addEventListener('click', (ev) => {
    const t = ev.target.closest('[role="tab"]');
    if (t) seleccionar(t);
  });

  lista.addEventListener('keydown', (ev) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let nueva = null;
    if (ev.key === 'ArrowRight') nueva = tabs[(i + 1) % tabs.length];
    else if (ev.key === 'ArrowLeft') nueva = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (ev.key === 'Home') nueva = tabs[0];
    else if (ev.key === 'End') nueva = tabs[tabs.length - 1];
    if (nueva) {
      ev.preventDefault();
      seleccionar(nueva, { foco: true });
    }
  });

  return (vista) => {
    const t = tabs.find((x) => x.dataset.vista === vista);
    if (t) seleccionar(t);
  };
}

/* ------------------------------------------------------------------ */
/* Tablas largas: de a 25 filas con "Mostrar más"                       */
/* ------------------------------------------------------------------ */

// Devuelve una función que recibe la lista completa y la dibuja desde el principio.
// "Mostrar menos" (se crea acá, al lado de "Mostrar más") vuelve a las primeras 25 filas.
function listaPaginada(tbody, botonMas, contador, crearFila) {
  let items = [];
  let visibles = PAGINA;
  const botonMenos = el('button', 'Mostrar menos', { type: 'button', class: 'boton boton-borde', hidden: '' });
  botonMas.after(' ', botonMenos);

  function pintar() {
    tbody.replaceChildren(...items.slice(0, visibles).map(crearFila));
    const resto = items.length - visibles;
    botonMas.hidden = resto <= 0;
    botonMas.textContent = `Mostrar ${Math.min(PAGINA, Math.max(resto, 0))} más`;
    botonMenos.hidden = visibles <= PAGINA;
    contador.textContent = items.length
      ? `Mostrando ${Math.min(visibles, items.length)} de ${items.length}`
      : 'No hay resultados.';
  }

  botonMas.addEventListener('click', () => {
    visibles += PAGINA;
    pintar();
  });

  botonMenos.addEventListener('click', () => {
    visibles = PAGINA;
    pintar();
    // La tabla se achica: se vuelve al principio de la lista para no quedar mirando el pie de página.
    contador.scrollIntoView({ block: 'nearest' });
  });

  return (nuevos) => {
    items = nuevos;
    visibles = PAGINA;
    pintar();
  };
}

// Búsqueda por nombre y "solo stock bajo" sobre una lista que se vuelve a dibujar con cada cambio.
function conFiltros(buscar, soloBajo, obtenerTodos, pintar) {
  const aplicar = () => {
    const q = buscar.value.trim().toLowerCase();
    pintar(obtenerTodos().filter((x) =>
      (!q || String(x.nombre).toLowerCase().includes(q)) &&
      (!soloBajo.checked || Number(x.stock) <= stockBajo)
    ));
  };
  buscar.addEventListener('input', aplicar);
  soloBajo.addEventListener('change', aplicar);
  return aplicar;
}

/* ------------------------------------------------------------------ */
/* Filtro por fechas                                                    */
/* ------------------------------------------------------------------ */

// Arma "?desde=..&hasta=.."; devuelve null (y avisa) si el rango es inválido.
function consulta(form, errorId) {
  const error = $(errorId);
  const desde = form.elements.desde.value;
  const hasta = form.elements.hasta.value;
  error.hidden = true;
  if (desde && hasta && desde > hasta) {
    error.textContent = 'La fecha "Desde" no puede ser posterior a "Hasta".';
    error.hidden = false;
    return null;
  }
  const p = new URLSearchParams();
  if (desde) p.set('desde', desde);
  if (hasta) p.set('hasta', hasta);
  const texto = p.toString();
  return texto ? '?' + texto : '';
}

function mostrarError(errorId, e) {
  const error = $(errorId);
  error.textContent = e.estado === 400 ? 'Revisá las fechas del filtro.' : 'No se pudo cargar el reporte.';
  error.hidden = false;
}

/* ------------------------------------------------------------------ */
/* Sugerencias                                                          */
/* ------------------------------------------------------------------ */

async function cargarSugerencias() {
  estado.textContent = 'Cargando…';
  try {
    const datos = await api('/api/reportes/sugerencias');
    const promo = datos.que_promocionar ?? {};
    const sugerida = promo.franja_sugerida;

    $('texto-promocionar').textContent = sugerida?.sugerencia ?? 'Todavía no hay datos para sugerir.';
    franjas = promo.franjas ?? [];
    franjaSugerida = sugerida;
    aPromocionar = promo.a_promocionar ?? [];
    precioConsulta = Number(promo.precio_consulta ?? 0);
    $('precio-consulta').textContent = dinero(precioConsulta);
    await cargarPromoTurnos();

    liquidar = datos.que_liquidar ?? [];
    $('vacio-liquidar').hidden = liquidar.length > 0;
    await cargarPromociones();
    estado.textContent = '';
  } catch {
    estado.textContent = 'No se pudieron cargar las sugerencias.';
    cargadas.delete('sugerencias');   // al volver a la pestaña se reintenta
  }
}

// Una fila de "Qué promocionar". Las 5 franjas con menos turnos (a_promocionar del motor) traen el
// descuento sugerido y "Publicitar", o la promoción que ya tienen.
function filaFranja(f, sugerida) {
  const esSugerida = sugerida && f.dia_semana === sugerida.dia_semana && f.franja === sugerida.franja;
  const candidata = aPromocionar.find((a) => a.dia_semana === f.dia_semana && a.franja === f.franja);
  const tr = el('tr');
  const celdaPromo = el('td', '', { class: 'celda-promo' });
  if (candidata) {
    const vigente = promoTurnos.find((p) => p.dia_semana === candidata.dia_numero && p.franja === candidata.franja_codigo);
    if (vigente) {
      celdaPromo.append(el('span', `${vigente.porcentaje} % hasta el ${fecha(vigente.hasta).slice(0, 5)}`, { class: 'insignia insignia-promo' }));
    } else {
      const nombre = `${f.dia_semana} a la ${f.franja}`;
      const boton = el('button', 'Publicitar', { type: 'button', class: 'boton boton-chico', 'aria-label': `Publicitar ${nombre}` });
      boton.addEventListener('click', () => abrirFranja(candidata, boton));
      celdaPromo.append(boton);
    }
  }
  tr.append(
    el('td', f.dia_semana), el('td', f.franja), el('td', f.cantidad_turnos), el('td', esSugerida ? 'Sugerida' : ''),
    el('td', candidata ? `${candidata.descuento_sugerido} %` : ''), celdaPromo
  );
  return tr;
}

/* ------------------------------------------------------------------ */
/* Franjas de turnos: "Publicitar" y las publicadas (API de Pacientes)  */
/* ------------------------------------------------------------------ */

let franjas = [];          // las 12 franjas del motor
let franjaSugerida = null;
let aPromocionar = [];     // las 5 con menos turnos, con su descuento sugerido
let precioConsulta = 0;
let promoTurnos = [];      // las franjas en promoción

// Pide las franjas en promoción y vuelve a pintar "Qué promocionar" y la lista de publicadas.
async function cargarPromoTurnos() {
  try {
    ({ datos: promoTurnos = [] } = await api('/api/pacientes/promociones-turnos'));
  } catch {
    promoTurnos = [];
  }
  $('filas-franjas').replaceChildren(...franjas.map((f) => filaFranja(f, franjaSugerida)));
  $('filas-promo-turnos').replaceChildren(...promoTurnos.map(filaPromoTurno));
  $('vacio-promo-turnos').hidden = promoTurnos.length > 0;
  $('tabla-promo-turnos').hidden = promoTurnos.length === 0;
}

function filaPromoTurno(p) {
  const tr = el('tr');
  const terminar = el('button', 'Terminar', { type: 'button', class: 'boton boton-borde boton-chico', 'aria-label': `Terminar la promoción de ${p.nombre}` });
  terminar.addEventListener('click', async () => {
    const si = await confirmar(`¿Terminar la promoción de ${p.nombre}? Los turnos nuevos de esa franja vuelven al precio de siempre; los que ya se sacaron conservan el descuento.`, { aceptar: 'Terminar la promoción', peligro: true });
    if (!si) return;
    terminar.disabled = true;
    try {
      await api(`/api/pacientes/promociones-turnos/${p.id}`, { metodo: 'DELETE' });
      avisarFranjas(`Se terminó la promoción de ${p.nombre}.`);
    } catch (e) {
      if (e?.estado !== 404) avisarFranjas('No se pudo terminar la promoción. Probá de nuevo.');
    }
    await cargarPromoTurnos();
  });
  const accion = el('td');
  accion.append(terminar);
  tr.append(
    el('td', p.nombre), el('td', p.porcentaje + ' %'),
    el('td', `${dinero(p.precio_promocion)} (antes ${dinero(p.precio)})`), el('td', fecha(p.hasta)), accion
  );
  return tr;
}

// Lo que se publicita o se termina se avisa en la pestaña donde se hizo y también en "Promociones
// publicadas" (desde ahí se terminan): así el aviso se ve en la que esté abierta.
const avisoPublicadas = $('aviso-publicadas');
function mostrarAviso(elemento, texto) {
  for (const aviso of [elemento, avisoPublicadas]) {
    aviso.textContent = texto;
    aviso.hidden = false;
  }
}

const avisoFranjas = $('aviso-franjas');
const avisarFranjas = (texto) => mostrarAviso(avisoFranjas, texto);

const dialogoFranja = $('dialogo-franja');
const formFranja = $('form-franja');
let publicitandoFranja = null;   // { franja, boton }

function abrirFranja(franja, boton) {
  publicitandoFranja = { franja, boton };
  for (const campo of ['porcentaje', 'hasta']) {
    $('error-franja-' + campo).textContent = '';
    formFranja.elements[campo].removeAttribute('aria-invalid');
  }
  $('error-franja-general').hidden = true;
  $('franja-texto').textContent = `${franja.dia_semana} a la ${franja.franja}: ${franja.cantidad_turnos} turnos en las últimas 4 semanas. Consulta: ${dinero(precioConsulta)}.`;
  const hasta = formFranja.elements.hasta;
  const enDias = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return aISO(d); };
  hasta.min = enDias(0);
  hasta.max = enDias(90);
  hasta.value = enDias(30);
  formFranja.elements.porcentaje.value = String(franja.descuento_sugerido ?? 10);
  previsualizarFranja();
  dialogoFranja.showModal();
  formFranja.elements.porcentaje.focus();
}

function previsualizarFranja() {
  const porcentaje = Number(formFranja.elements.porcentaje.value);
  const valido = Number.isInteger(porcentaje) && porcentaje >= 5 && porcentaje <= 90;
  $('franja-precio').textContent = valido
    ? `La consulta en esa franja: ${dinero(Math.round(precioConsulta * (100 - porcentaje)) / 100)}`
    : '';
}

formFranja.elements.porcentaje.addEventListener('input', previsualizarFranja);
$('franja-cancelar').addEventListener('click', () => dialogoFranja.close());
dialogoFranja.addEventListener('close', () => { publicitandoFranja?.boton.focus(); });

formFranja.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const { franja } = publicitandoFranja;
  for (const campo of ['porcentaje', 'hasta']) {
    $('error-franja-' + campo).textContent = '';
    formFranja.elements[campo].removeAttribute('aria-invalid');
  }
  $('error-franja-general').hidden = true;
  const porcentaje = formFranja.elements.porcentaje.value.trim();
  const cuerpo = {
    dia_semana: franja.dia_numero,
    franja: franja.franja_codigo,
    porcentaje: /^\d+$/.test(porcentaje) ? Number(porcentaje) : porcentaje,
    hasta: formFranja.elements.hasta.value,
  };
  const enviar = $('franja-enviar');
  enviar.disabled = true;
  try {
    const promo = await api('/api/pacientes/promociones-turnos', { metodo: 'POST', cuerpo });
    dialogoFranja.close();
    avisarFranjas(`Listo: ${promo.nombre} tiene ${promo.porcentaje} % de descuento en la consulta hasta el ${fecha(promo.hasta)}. Los clientes la ven en el sitio.`);
    await cargarPromoTurnos();
  } catch (e) {
    const campos = e?.datos?.campos ?? {};
    for (const [campo, mensaje] of Object.entries(campos)) {
      const destino = $('error-franja-' + campo);
      if (destino) destino.textContent = mensaje;
      formFranja.elements[campo]?.setAttribute('aria-invalid', 'true');
    }
    const general = $('error-franja-general');
    general.textContent = e?.estado === 400 ? 'Revisá los datos marcados.' : (e?.datos?.error ?? 'No se pudo publicitar. Probá de nuevo.');
    general.hidden = false;
    if (e?.estado === 409) await cargarPromoTurnos();
  } finally {
    enviar.disabled = false;
  }
});

// Una fila de "Qué liquidar". La última columna: la promoción vigente del producto, o "Publicitar".
function filaLiquidar(p) {
  const tr = el('tr');
  const promo = promociones.find((x) => x.producto_id === p.producto_id);
  const celda = el('td', '', { class: 'celda-promo' });
  if (promo) {
    celda.append(el('span', `${promo.porcentaje} % hasta el ${fecha(promo.hasta).slice(0, 5)}`, { class: 'insignia insignia-promo' }));
  } else {
    const boton = el('button', 'Publicitar', { type: 'button', class: 'boton boton-chico', 'aria-label': `Publicitar ${p.nombre}` });
    boton.addEventListener('click', () => abrirPublicitar(p, boton));
    celda.append(boton);
  }
  tr.append(
    el('td', p.nombre),
    el('td', fecha(p.fecha_vencimiento)),
    el('td', p.dias_restantes),
    el('td', p.stock),
    el('td', dinero(p.precio)),
    el('td', p.descuento_sugerido + ' %'),
    el('td', dinero(p.precio_sugerido)),
    celda
  );
  return tr;
}

/* ------------------------------------------------------------------ */
/* Promociones: "Publicitar" y las publicadas (API de Inventario)       */
/* ------------------------------------------------------------------ */

let liquidar = [];       // las sugerencias de "Qué liquidar"
let promociones = [];    // las promociones vigentes

// Pide las promociones vigentes y vuelve a pintar "Qué liquidar" (para saber qué ya se publicitó)
// y "Promociones publicadas". Si Inventario no responde, las sugerencias se ven igual.
async function cargarPromociones() {
  try {
    ({ datos: promociones = [] } = await api('/api/inventario/promociones'));
  } catch {
    promociones = [];
  }
  $('filas-liquidar').replaceChildren(...liquidar.map(filaLiquidar));
  $('filas-promociones').replaceChildren(...promociones.map(filaPromocion));
  $('vacio-promociones').hidden = promociones.length > 0;
  $('tabla-promociones').hidden = promociones.length === 0;
}

function filaPromocion(promo) {
  const tr = el('tr');
  const nombre = el('td', promo.nombre);
  if (!promo.a_la_venta) nombre.append(' ', el('span', '(no está a la venta)', { class: 'marca-baja' }));
  const terminar = el('button', 'Terminar', { type: 'button', class: 'boton boton-borde boton-chico', 'aria-label': `Terminar la promoción de ${promo.nombre}` });
  terminar.addEventListener('click', () => terminarPromocion(promo, terminar));
  const accion = el('td');
  accion.append(terminar);
  tr.append(
    nombre,
    el('td', promo.porcentaje + ' %'),
    el('td', `${dinero(promo.precio_promocion)} (antes ${dinero(promo.precio)})`),
    el('td', fecha(promo.hasta)),
    el('td', promo.stock),
    el('td', promo.creada_por ?? '—'),
    accion
  );
  return tr;
}

async function terminarPromocion(promo, boton) {
  const si = await confirmar(`¿Terminar la promoción de "${promo.nombre}"? Deja de verse en la tienda y vuelve al precio de siempre.`, { aceptar: 'Terminar la promoción', peligro: true });
  if (!si) return;
  boton.disabled = true;
  try {
    await api(`/api/inventario/promociones/${promo.id}`, { metodo: 'DELETE' });
    avisar(`Se terminó la promoción de "${promo.nombre}".`);
  } catch (e) {
    // 404: ya había terminado (otra pestaña, o pasó su fecha). Igual se actualiza la lista.
    if (e?.estado !== 404) avisar('No se pudo terminar la promoción. Probá de nuevo.');
  }
  await cargarPromociones();
}

const avisoPromo = $('aviso-promociones');
const avisar = (texto) => mostrarAviso(avisoPromo, texto);

const dialogo = $('dialogo-publicitar');
const formPublicitar = $('form-publicitar');
let publicitando = null;   // { producto, boton } de la fila que abrió el cuadro

// Hasta cuándo puede durar: el vencimiento del producto o, si es más lejos, 90 días desde hoy.
function hastaMaximo(p) {
  const maximo = (() => { const d = new Date(); d.setDate(d.getDate() + 90); return aISO(d); })();
  return p.fecha_vencimiento && p.fecha_vencimiento < maximo ? p.fecha_vencimiento : maximo;
}

function abrirPublicitar(p, boton) {
  publicitando = { producto: p, boton };
  limpiarErrores(formPublicitar);
  $('publicitar-producto').textContent = `${p.nombre}: ${dinero(p.precio)}, quedan ${p.stock}. Vence el ${fecha(p.fecha_vencimiento)}.`;
  const hasta = formPublicitar.elements.hasta;
  hasta.min = aISO(new Date());
  hasta.max = hastaMaximo(p);
  hasta.value = hasta.max;
  $('ayuda-hasta').textContent = `Por defecto, hasta el día que vence. Como mucho el ${fecha(hasta.max)}.`;
  formPublicitar.elements.porcentaje.value = String(p.descuento_sugerido ?? 15);
  previsualizar();
  dialogo.showModal();
  formPublicitar.elements.porcentaje.focus();
}

// "Precio en la tienda: $ 4.550,00" mientras se elige el porcentaje (la cuenta final la hace Inventario).
function previsualizar() {
  const porcentaje = Number(formPublicitar.elements.porcentaje.value);
  const valido = Number.isInteger(porcentaje) && porcentaje >= 5 && porcentaje <= 90;
  $('publicitar-precio').textContent = valido && publicitando
    ? `Precio en la tienda: ${dinero(Math.round(publicitando.producto.precio * (100 - porcentaje)) / 100)}`
    : '';
}

formPublicitar.elements.porcentaje.addEventListener('input', previsualizar);
$('publicitar-cancelar').addEventListener('click', () => dialogo.close());
dialogo.addEventListener('close', () => { publicitando?.boton.focus(); });

formPublicitar.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  limpiarErrores(formPublicitar);
  const { producto } = publicitando;
  const porcentaje = formPublicitar.elements.porcentaje.value.trim();
  const cuerpo = {
    producto_id: producto.producto_id,
    porcentaje: /^\d+$/.test(porcentaje) ? Number(porcentaje) : porcentaje,
    hasta: formPublicitar.elements.hasta.value,
  };
  const enviar = $('publicitar-enviar');
  enviar.disabled = true;
  try {
    const promo = await api('/api/inventario/promociones', { metodo: 'POST', cuerpo });
    dialogo.close();
    avisar(`Listo: "${producto.nombre}" ya está en las promociones de la tienda, con ${promo.porcentaje} % hasta el ${fecha(promo.hasta)}.`);
    await cargarPromociones();
  } catch (e) {
    if (e?.estado === 400) {
      mostrarErrores(formPublicitar, e.datos?.campos ?? {}, 'Revisá los datos marcados.');
      formPublicitar.querySelector('[aria-invalid="true"]')?.focus();
    } else if (e?.estado === 409 || e?.estado === 404) {
      mostrarErrores(formPublicitar, {}, e.datos?.error ?? 'No se pudo publicitar.');
      await cargarPromociones();
    } else {
      mostrarErrores(formPublicitar, {}, 'No se pudo publicitar. Probá de nuevo.');
    }
  } finally {
    enviar.disabled = false;
  }
});

/* ------------------------------------------------------------------ */
/* Turnos atendidos                                                     */
/* ------------------------------------------------------------------ */

const formTurnos = $('filtro-turnos');

function filaTurno(t) {
  const tr = el('tr');
  // El número de factura lleva a la factura (la vista v_turnos_atendidos trae consulta_id).
  const factura = el('td');
  if (t.factura_numero && t.consulta_id) {
    factura.append(el('a', t.factura_numero, {
      href: '/cliente/factura.html?consulta=' + t.consulta_id, 'aria-label': `Ver la factura ${t.factura_numero}`
    }));
  } else {
    factura.textContent = t.factura_numero ?? '—';
  }
  tr.append(
    el('td', fecha(t.fecha)),
    el('td', t.mascota_nombre),
    el('td', t.motivo),
    el('td', t.diagnostico || '—'),
    el('td', t.cantidad_insumos),
    el('td', t.cantidad_productos),
    factura,
    el('td', dinero(t.total))
  );
  return tr;
}

const pintarTurnos = listaPaginada($('filas-turnos'), $('mas-turnos'), $('cont-turnos'), filaTurno);

async function cargarTurnos() {
  const q = consulta(formTurnos, 'error-turnos');
  if (q === null) return;
  try {
    const r = await api('/api/reportes/turnos-atendidos' + q);
    const turnos = (r.turnos ?? []).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    pintarTurnos(turnos);
    $('resumen-turnos').textContent =
      `${r.resumen?.cantidad_turnos ?? turnos.length} turnos · total facturado ${dinero(r.resumen?.total_facturado)}`;
  } catch (e) {
    mostrarError('error-turnos', e);
  }
}

formTurnos.addEventListener('submit', (ev) => { ev.preventDefault(); cargarTurnos(); });

/* ------------------------------------------------------------------ */
/* Stock y movimientos                                                  */
/* ------------------------------------------------------------------ */

const formMov = $('filtro-movimientos');
let productos = [];
let insumos = [];

function avisoStock(stock) {
  if (Number(stock) === 0) return 'Sin stock';
  return Number(stock) <= stockBajo ? 'Stock bajo' : '';
}

function filaProducto(p) {
  const tr = el('tr');
  tr.append(el('td', p.nombre), el('td', p.stock), el('td', p.fecha_vencimiento ? fecha(p.fecha_vencimiento) : '—'), el('td', avisoStock(p.stock)));
  return tr;
}

function filaInsumo(i) {
  const tr = el('tr');
  tr.append(el('td', i.nombre), el('td', textoEstadoInsumo(i.estado)), el('td', i.stock), el('td', avisoStock(i.stock)));
  return tr;
}

// El movimiento solo trae el id del ítem: el nombre se busca en las listas de stock.
function filaMovimiento(m) {
  const nombre = m.producto_id
    ? productos.find((p) => Number(p.id) === Number(m.producto_id))?.nombre ?? 'Producto ' + m.producto_id
    : insumos.find((i) => Number(i.id) === Number(m.insumo_id))?.nombre ?? 'Insumo ' + m.insumo_id;
  const f = String(m.fecha ?? '');
  const tr = el('tr');
  tr.append(
    el('td', fecha(f.slice(0, 10)) + ' ' + f.slice(11, 16)),
    el('td', m.tipo),
    el('td', m.motivo),
    el('td', nombre),
    el('td', m.cantidad)
  );
  return tr;
}

const pintarProductos = listaPaginada($('filas-stock-productos'), $('mas-productos'), $('cont-productos'), filaProducto);
const pintarInsumos = listaPaginada($('filas-stock-insumos'), $('mas-insumos'), $('cont-insumos'), filaInsumo);
const pintarMovimientos = listaPaginada($('filas-movimientos'), $('mas-movimientos'), $('cont-movimientos'), filaMovimiento);

const aplicarProductos = conFiltros($('buscar-productos'), $('bajo-productos'), () => productos, pintarProductos);
const aplicarInsumos = conFiltros($('buscar-insumos'), $('bajo-insumos'), () => insumos, pintarInsumos);

// Menor stock primero: lo que hay que reponer queda arriba.
const porStock = (a, b) => Number(a.stock) - Number(b.stock) || String(a.nombre).localeCompare(String(b.nombre));

async function cargarStock() {
  const q = consulta(formMov, 'error-movimientos');
  if (q === null) return;
  try {
    const r = await api('/api/reportes/stock' + q);
    stockBajo = Number(r.resumen?.limite_stock_bajo ?? stockBajo);
    document.querySelectorAll('.limite-stock').forEach((s) => { s.textContent = String(stockBajo); });
    productos = (r.productos ?? []).sort(porStock);
    insumos = (r.insumos ?? []).sort(porStock);

    $('resumen-stock').textContent =
      `${r.resumen?.productos_stock_bajo ?? 0} productos y ${r.resumen?.insumos_stock_bajo ?? 0} insumos con stock bajo`;

    aplicarProductos();
    aplicarInsumos();
    pintarMovimientos((r.movimientos ?? []).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))));
  } catch (e) {
    mostrarError('error-movimientos', e);
  }
}

formMov.addEventListener('submit', (ev) => { ev.preventDefault(); cargarStock(); });

/* ------------------------------------------------------------------ */
/* Pestañas activas, carga diferida y hash de la URL                    */
/* ------------------------------------------------------------------ */

const cargadas = new Set();
let vistaActual = 'promocionar';

// Las tres pestañas de sugerencias salen del mismo pedido (GET /api/reportes/sugerencias): se carga una vez.
const CARGA = {
  promocionar: ['sugerencias', cargarSugerencias],
  liquidar: ['sugerencias', cargarSugerencias],
  promociones: ['sugerencias', cargarSugerencias],
  'turnos-atendidos': ['turnos-atendidos', cargarTurnos],
  stock: ['stock', cargarStock],
};
const VISTAS_SIMPLES = ['promocionar', 'liquidar', 'promociones', 'turnos-atendidos'];
let subActual = 'productos';
let iniciando = true;

function cargarVista(vista) {
  const [clave, cargar] = CARGA[vista];
  if (cargadas.has(clave)) return;
  cargadas.add(clave);
  cargar();
}

// Deja la pestaña activa en la URL sin sumar entradas al historial ni mover la página.
function actualizarHash() {
  if (iniciando) return;
  history.replaceState(null, '', '#' + (vistaActual === 'stock' ? 'stock-' + subActual : vistaActual));
}

function desdeHash() {
  const nombre = location.hash.slice(1);
  if (nombre.startsWith('stock')) return { vista: 'stock', sub: nombre.split('-')[1] || 'productos' };
  if (VISTAS_SIMPLES.includes(nombre)) return { vista: nombre, sub: null };
  return { vista: 'promocionar', sub: null };   // también #sugerencias, de los enlaces de antes
}

const elegirPrincipal = activarPestanas($('pestanas'), (vista) => {
  vistaActual = vista;
  actualizarHash();
  cargarVista(vista);
});

const elegirSub = activarPestanas($('pestanas-stock'), (sub) => {
  subActual = sub;
  actualizarHash();
});

function mostrar({ vista, sub }) {
  if (sub) elegirSub(sub);
  elegirPrincipal(vista);
}

window.addEventListener('hashchange', () => mostrar(desdeHash()));

// Los dos filtros de fechas arrancan en los últimos 30 días.
for (const form of [formTurnos, formMov]) {
  form.elements.desde.value = haceDias(30);
  form.elements.hasta.value = aISO(new Date());
}

mostrar(desdeHash());
iniciando = false;
