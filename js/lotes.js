/**
 * lotes.js — Los lotes de un producto o de un insumo (panel de la veterinaria, 26/11).
 *
 * Lo usan panel.js (Productos) y insumos.js (Insumos): debajo de la fila, "Lotes" muestra cada lote
 * (L1, L2, L3… y el número del fabricante si tiene), su vencimiento y su stock, con "Retirar" de ese
 * lote, y el formulario para cargar stock en un lote que ya existe o en uno nuevo.
 *
 * Contrato: docs/api/contrato.md y contrato-insumos.md del repo Inventario, sección "Lotes".
 * - Si el producto o insumo vence (vence: true), cada lote nuevo lleva su fecha de vencimiento; si no
 *   vence, no muestra lotes (su stock va a un único lote sin vencimiento).
 * - Los errores se muestran con el estilo del sitio (no con los globos del navegador): los formularios
 *   llevan novalidate y se validan acá antes de mandarlos.
 *
 * Todo texto que viene de la API se inserta con el() (textContent), nunca con innerHTML.
 */
import { api } from './api.js';
import { el } from './ui.js';
import { fecha, hoyArgentina } from './tienda.js';

// Lo mismo que acepta la API por carga o retiro.
const CANTIDAD_MAXIMA = 100000;

/** "L3" o "L3 (FL-2612)": el nombre que arma la API (o, si no vino, con el número). */
export const nombreLote = (lote) => lote.nombre ?? ('L' + lote.numero);

/** "L3, que vence el 12/03/2027", "L2 (FL-2612), que vence el 16/12/2026" o "L1, que no vence". */
export const textoLote = (lote) =>
  `${nombreLote(lote)}, que ${lote.vencimiento ? 'vence el ' + fecha(lote.vencimiento) : 'no vence'}`;

/** "1 unidad" o "5 unidades". */
export const unidades = (n) => `${n} unidad${n === 1 ? '' : 'es'}`;

/**
 * Valida la cantidad de un casillero (carga o retiro) y devuelve el número, o un texto con el error.
 * @param {HTMLInputElement} input
 * @param {number} [maximo] Para retirar de un lote: lo que tiene.
 * @returns {number|string}
 */
export function leerCantidad(input, maximo = CANTIDAD_MAXIMA) {
  const texto = input.value.trim();
  const n = Number(texto);
  if (texto === '') return 'Escribí la cantidad.';
  if (!Number.isInteger(n) || n < 1) return 'La cantidad tiene que ser un número entero mayor o igual a 1.';
  if (n > maximo) {
    return maximo < CANTIDAD_MAXIMA ? `El lote tiene ${unidades(maximo)}: no se puede retirar más.` : 'La cantidad puede ser como mucho 100.000.';
  }
  return n;
}

/**
 * Muestra (o borra, con texto vacío) un error en su lugar y marca el control como inválido.
 * @param {HTMLElement} destino El elemento del mensaje (role="alert").
 * @param {string} texto
 * @param {HTMLElement} [control] El control que tiene el error.
 */
export function marcarError(destino, texto, control) {
  destino.textContent = texto;
  if (control) {
    if (texto) control.setAttribute('aria-invalid', 'true');
    else control.removeAttribute('aria-invalid');
  }
}

/** El mensaje de un error de la API: el del primer campo, el general o el de reemplazo; con lo que hay si vino. */
export function mensajeDeError(e, falla) {
  const campos = e.datos?.campos ?? {};
  const hay = e.datos?.stock !== undefined ? ` (hay ${e.datos.stock})` : '';
  return String(Object.values(campos)[0] ?? e.datos?.error ?? falla).replace(/\.$/, '') + hay + '.';
}

/**
 * El panel de los lotes de un producto o insumo.
 * @param {object} item El producto o insumo (con id, nombre, vence y lotes).
 * @param {object} opciones
 * @param {string} opciones.base   La ruta de la API ('/api/inventario/productos' o '/api/inventario/insumos').
 * @param {string} opciones.que    'producto' o 'insumo', para los textos.
 * @param {(aviso: {texto: string, lote: number}) => void} opciones.alCambiar
 *        Después de cargar o retirar: recarga la lista y vuelve a abrir este panel con el aviso.
 * @param {number|string} [opciones.cantidad] La cantidad escrita en la fila, para cargarla.
 * @param {{texto: string, lote: number}} [opciones.aviso] Lo que se acaba de hacer: se muestra arriba
 *        y se resalta el lote.
 * @returns {HTMLElement}
 */
export function panelLotes(item, { base, que, alCambiar, cantidad, aviso }) {
  const caja = el('div', '', { class: 'lotes' });
  const lotes = item.lotes ?? [];
  const error = el('p', '', { class: 'campo-error', role: 'alert' });

  // Lo que se acaba de hacer, en un recuadro verde (role="status": el lector de pantalla lo lee).
  if (aviso) {
    caja.append(el('p', aviso.texto, { class: 'mensaje mensaje-ok', role: 'status', tabindex: '-1', 'data-aviso': '' }));
  }

  // Manda el pedido; si sale bien, avisa qué se hizo (alCambiar recarga y vuelve a abrir este panel).
  const enviar = async (ruta, cuerpo, falla, texto, boton) => {
    error.textContent = '';
    boton.disabled = true;
    try {
      const r = await api(`${base}/${item.id}/${ruta}`, { metodo: 'POST', cuerpo });
      const lote = r.lote ?? lotes.find((l) => l.id === cuerpo.lote_id);
      alCambiar({ texto: texto(r, lote), lote: lote?.id });
    } catch (e) {
      error.textContent = mensajeDeError(e, falla);
      boton.disabled = false;
    }
  };

  // La tabla de los lotes (el que vence primero arriba, como sale de la API).
  if (lotes.length) {
    const tabla = el('table', '', { class: 'tabla-lotes' });
    tabla.append(el('caption', `Lotes de ${item.nombre} (${que === 'insumo' ? 'se usa' : 'se vende'} primero el que vence antes)`));
    const cabeza = el('thead');
    const filaCabeza = el('tr');
    for (const t of ['Lote', 'Vence', 'Stock', 'Retirar']) filaCabeza.append(el('th', t, { scope: 'col' }));
    cabeza.append(filaCabeza);
    const cuerpo = el('tbody');
    for (const lote of lotes) {
      const tr = el('tr', '', lote.id === aviso?.lote ? { class: 'lote-resaltado' } : {});
      const vence = el('td', lote.vencimiento ? fecha(lote.vencimiento) : 'No vence');
      if (lote.vencido) vence.append(' ', el('strong', que === 'insumo' ? 'Vencido: no se usa' : 'Vencido: no se vende'));
      const celdaRetirar = el('td');
      if (lote.stock > 0) celdaRetirar.append(formRetirar(lote));
      tr.append(el('th', nombreLote(lote), { scope: 'row' }), vence, el('td', lote.stock), celdaRetirar);
      cuerpo.append(tr);
    }
    tabla.append(cabeza, cuerpo);
    caja.append(tabla);
  } else {
    caja.append(el('p', 'Todavía no tiene lotes: cargá el primero.'));
  }

  // Retirar de un lote: lo que tiene como máximo.
  function formRetirar(lote) {
    const form = el('form', '', { class: 'form-stock', novalidate: '' });
    const cant = el('input', '', { type: 'number', min: '1', max: String(lote.stock), step: '1', inputmode: 'numeric',
      'aria-label': `Cantidad a retirar del lote ${nombreLote(lote)}` });
    const boton = el('button', 'Retirar', { type: 'submit', class: 'boton boton-borde boton-chico',
      'aria-label': `Retirar del lote ${nombreLote(lote)} de ${item.nombre}` });
    form.append(cant, boton);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const n = leerCantidad(cant, lote.stock);
      if (typeof n === 'string') { marcarError(error, n, cant); cant.focus(); return; }
      marcarError(error, '', cant);
      enviar('retiro', { cantidad: n, lote_id: lote.id }, 'No se pudo retirar el stock',
        (r) => `Se ${n === 1 ? 'retiró 1 unidad' : `retiraron ${n} unidades`} del lote ${nombreLote(lote)}. `
          + `Quedan ${lote.stock - n} en el lote y ${r.stock} en total.`, boton);
    });
    return form;
  }

  // Cargar stock: en un lote sin vencer que ya existe o en uno nuevo (el número que sigue: L4, L5…).
  const form = el('form', '', { class: 'form-lote', novalidate: '' });
  const sufijo = `-${que}-${item.id}`;
  const opciones = lotes.filter((l) => !l.vencido && (l.vencimiento !== null) === item.vence)
    .map((l) => el('option', `${textoLote(l)}: hay ${l.stock}`, { value: String(l.id) }));
  const elegir = el('select', '', { id: 'lote' + sufijo, name: 'lote_id' });
  elegir.append(...opciones, el('option', 'Lote nuevo', { value: 'nuevo' }));
  if (!opciones.length) elegir.value = 'nuevo';
  const cant = el('input', '', { id: 'cantidad-lote' + sufijo, type: 'number', min: '1', step: '1', inputmode: 'numeric', 'data-foco': '' });
  if (cantidad) cant.value = cantidad;
  const vence = el('input', '', { id: 'vence-lote' + sufijo, type: 'date', min: hoyArgentina() });
  const codigo = el('input', '', { id: 'codigo-lote' + sufijo, type: 'text', maxlength: '40', autocomplete: 'off' });
  const nuevo = el('div', '', { class: 'acciones' });
  nuevo.append(campo('Vence el', vence), campo('Número de lote del fabricante (opcional)', codigo));
  const mostrarNuevo = () => { nuevo.hidden = elegir.value !== 'nuevo'; };
  elegir.addEventListener('change', mostrarNuevo);
  mostrarNuevo();

  const boton = el('button', 'Cargar', { type: 'submit', class: 'boton boton-chico', 'aria-label': `Cargar stock en un lote de ${item.nombre}` });
  const fila = el('div', '', { class: 'acciones' });
  fila.append(campo('Cantidad a cargar', cant), campo('En qué lote', elegir), boton);
  form.append(fila, nuevo);
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    for (const c of [cant, vence]) marcarError(error, '', c);
    const n = leerCantidad(cant);
    if (typeof n === 'string') { marcarError(error, n, cant); cant.focus(); return; }
    const cuerpo = { cantidad: n };
    if (elegir.value === 'nuevo') {
      // Si vence, la fecha es obligatoria y no puede ser anterior a hoy (lo controla también la API).
      if (!vence.value) { marcarError(error, 'Poné la fecha de vencimiento del lote nuevo.', vence); vence.focus(); return; }
      if (vence.value < hoyArgentina()) { marcarError(error, 'La fecha de vencimiento no puede ser anterior a hoy.', vence); vence.focus(); return; }
      cuerpo.lote = { codigo: codigo.value.trim() || null, vencimiento: vence.value };
    } else {
      cuerpo.lote_id = Number(elegir.value);
    }
    enviar('stock', cuerpo, 'No se pudo cargar el stock', (r, lote) => (cuerpo.lote
      ? `Se creó el lote ${textoLote(lote)}, con ${unidades(n)}.`
      : `Se ${n === 1 ? 'cargó 1 unidad' : `cargaron ${n} unidades`} en el lote ${textoLote(lote)}. Ahora el lote tiene ${lote.stock}.`)
      + ` ${item.nombre} tiene ${r.stock} en total.`, boton);
  });

  caja.append(el('h3', 'Cargar stock'), form, error);
  return caja;
}

// Un campo con su etiqueta.
function campo(texto, control) {
  const div = el('div', '', { class: 'campo' });
  div.append(el('label', texto, { for: control.id }), control);
  return div;
}

/**
 * Abre y cierra la fila de los lotes debajo de la fila de un producto o insumo. Devuelve el botón
 * "Lotes (N)" y la función que abre el panel (con la cantidad de la fila o el aviso de lo que se hizo).
 * La fila se agrega al abrirla y se saca al cerrarla: la tabla tiene una fila por ítem mientras no
 * se abre ninguna.
 * @param {HTMLTableRowElement} tr La fila del ítem.
 * @param {object} item
 * @param {number} columnas Cuántas columnas ocupa la fila de los lotes.
 * @param {object} opciones Las de panelLotes (base, que, alCambiar).
 */
export function filaDeLotes(tr, item, columnas, opciones) {
  const idLotes = `lotes-${opciones.que}-${item.id}`;
  const detalle = el('tr', '', { class: 'fila-detalle', id: idLotes });
  const celda = el('td', '', { colspan: String(columnas) });
  detalle.append(celda);
  const boton = el('button', `Lotes (${(item.lotes ?? []).length})`, {
    type: 'button', class: 'boton boton-borde boton-chico', 'aria-expanded': 'false', 'aria-controls': idLotes,
    'aria-label': 'Ver los lotes de ' + item.nombre,
  });
  const abrir = ({ cantidad, aviso } = {}) => {
    if (!detalle.isConnected || cantidad !== undefined || aviso) {
      celda.replaceChildren(panelLotes(item, { ...opciones, cantidad, aviso }));
    }
    if (!detalle.isConnected) {
      tr.after(detalle);
      boton.setAttribute('aria-expanded', 'true');
    }
    if (aviso) {
      const caja = celda.querySelector('[data-aviso]');
      caja?.scrollIntoView({ block: 'center' });
      caja?.focus({ preventScroll: true });
    } else {
      celda.querySelector('[data-foco]')?.focus();
    }
  };
  boton.addEventListener('click', () => {
    if (detalle.isConnected) {
      detalle.remove();
      boton.setAttribute('aria-expanded', 'false');
      return;
    }
    abrir();
  });
  return { boton, abrir };
}
