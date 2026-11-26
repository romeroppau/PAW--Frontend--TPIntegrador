/**
 * movimientos-inventario.js — Lo común de "Productos → Movimientos" (panel/productos-movimientos.html)
 * e "Insumos → Movimientos" (panel/insumo-movimientos.html).
 *
 * Cada pantalla tiene un selector del ítem, un filtro de fechas (arranca en los últimos 30 días) y una
 * tabla: fecha, ítem, tipo, motivo, cantidad y quién lo registró. El motivo lleva a donde se originó el
 * movimiento: "Usado en una consulta" a esa consulta (consulta_id) y "Venta" a la factura de la compra
 * web (compra). Contratos: docs/api/contrato.md y contrato-insumos.md del repo Inventario.
 * Todo texto de la API va con el() (textContent).
 */
import { api } from './api.js';
import { diaArgentina, errorDeRango, limitarAHoy } from './rango-fechas.js';
import { el } from './ui.js';

export const TIPOS = { ENTRADA: 'Entrada', SALIDA: 'Salida', AJUSTE: 'Ajuste' };
export const MOTIVOS = {
  CARGA_VETERINARIO: 'Carga de stock',
  CONSULTA: 'Usado en una consulta',
  VENTA: 'Venta',
  VENTA_CANCELADA: 'Venta cancelada (vuelve el stock)',
  AJUSTE: 'Retiro manual (sin consulta)',
};

// "2026-11-06 15:30:00" -> "06/11/2026 15:30"
export function fechaHora(texto) {
  const [dia, hora = ''] = String(texto ?? '').split(' ');
  return `${dia.split('-').reverse().join('/')} ${hora.slice(0, 5)}`.trim();
}

// El motivo, con el enlace a su origen si lo tiene.
export function celdaMotivo(m, nombreItem) {
  const td = el('td');
  const texto = MOTIVOS[m.motivo] ?? m.motivo;
  if (m.consulta_id) {
    td.append(el('a', texto, {
      href: '/panel/consulta.html?id=' + encodeURIComponent(m.consulta_id),
      'aria-label': `${texto}: ver la consulta donde se usó ${nombreItem}`
    }));
  } else if (m.compra) {
    td.append(el('a', texto, {
      href: '/tienda/factura.html?numero=' + encodeURIComponent(m.compra),
      'aria-label': `${texto}: ver la factura de la compra ${m.compra}`
    }));
    td.append(el('span', m.compra, { class: 'ayuda' }));
  } else {
    td.textContent = texto;
  }
  return td;
}

// La fila de un movimiento. campoItem: 'producto' o 'insumo' (el nombre que trae la API).
export function filaMovimiento(m, campoItem) {
  const tr = el('tr');
  const nombre = m[campoItem] ?? '—';
  tr.append(
    el('td', fechaHora(m.fecha)),
    el('td', nombre),
    el('td', TIPOS[m.tipo] ?? m.tipo),
    celdaMotivo(m, nombre),
    el('td', m.cantidad),
    el('td', m.usuario ?? '—')
  );
  return tr;
}

const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Arma la pantalla: el selector del ítem (con la lista de urlItems), el filtro de fechas y la tabla.
 * urlMovimientos(item, desde, hasta) devuelve la URL de la API. parametroItem es el nombre en la
 * dirección de la página (?producto= o ?id=), para que recargar o compartir el enlace abra lo mismo.
 */
export async function pantallaMovimientos({ urlItems, urlMovimientos, campoItem, parametroItem, textoVacio }) {
  const selector = document.getElementById('item');
  const form = document.getElementById('filtro-fechas');
  const filas = document.getElementById('filas');
  const estado = document.getElementById('estado');
  const error = document.getElementById('error-fechas');

  // Arranca en los últimos 30 días (se pueden borrar las fechas para ver todo), contados en hora de Argentina.
  form.elements.desde.value = diaArgentina(-30);
  form.elements.hasta.value = diaArgentina(0);
  limitarAHoy(form.elements.desde, form.elements.hasta);   // los movimientos ya pasaron: nada posterior a hoy

  let pedido = 0;
  async function mostrar() {
    const desde = form.elements.desde.value;
    const hasta = form.elements.hasta.value;
    error.hidden = true;
    const problema = errorDeRango(form.elements.desde, form.elements.hasta);
    if (problema) {
      error.textContent = problema;
      error.hidden = false;
      return;
    }
    const id = ++pedido;
    estado.textContent = 'Cargando…';
    try {
      const { datos } = await api(urlMovimientos(selector.value, desde, hasta));
      if (id !== pedido) return;
      filas.replaceChildren(...datos.map((m) => filaMovimiento(m, campoItem)));
      estado.textContent = datos.length ? `${datos.length} movimientos.` : textoVacio;
    } catch {
      if (id !== pedido) return;
      filas.replaceChildren();
      estado.textContent = 'No se pudieron cargar los movimientos.';
    }
  }

  // El selector: todos los ítems (los dados de baja también tienen historial).
  try {
    const { datos } = await api(urlItems);
    selector.append(...datos.map((i) => el('option', i.activo === false ? i.nombre + ' (de baja)' : i.nombre, { value: i.id })));
  } catch {
    estado.textContent = 'No se pudo cargar la lista.';
    return;
  }
  const pedido0 = new URLSearchParams(location.search).get(parametroItem);
  if (pedido0) selector.value = pedido0;

  selector.addEventListener('change', () => {
    history.replaceState(null, '', selector.value ? `?${parametroItem}=${selector.value}` : location.pathname);
    mostrar();
  });
  form.addEventListener('submit', (ev) => { ev.preventDefault(); mostrar(); });
  mostrar();
}
