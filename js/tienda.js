/**
 * tienda.js — Lo común de las pantallas de la tienda (catálogo, carrito, compras y ventas).
 *
 * Contrato de la API: repo Inventario, docs/api/contrato-tienda.md.
 * Las fechas llegan en hora de Argentina, sin zona: "2026-11-18 10:30:00".
 */
import { api } from './api.js';

/** Política de cancelación: se muestra en el carrito (antes de pagar) y en la compra. */
export const POLITICA = 'Tenés 5 días hábiles desde la compra para retirar tu pedido en el local. '
  + 'Si no lo retirás en ese plazo, el pedido se cancela y el importe no se reintegra. '
  + 'Si cancelás un pedido ya pagado, el importe tampoco se reintegra.';

/** Texto de cada estado de una compra (el código no se muestra). */
export const TEXTO_ESTADO = {
  PENDIENTE_PAGO: 'Esperando el pago',
  PAGADA: 'Lista para retirar',
  ENTREGADA: 'Entregada',
  CANCELADA: 'Cancelada',
};

/** Por qué se canceló una compra (motivo_cancelacion), para la veterinaria. */
export const TEXTO_MOTIVO = {
  COMPRADOR: 'La canceló el comprador',
  SIN_PAGO: 'No se pagó a tiempo',
  VENCIDA: 'Venció el plazo de retiro',
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** 15999.9 -> "$ 15.999,90" */
export function precio(valor) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(valor));
}

/** "2026-11-18 10:30:00" (hora de Argentina) -> Date. */
export function fechaArgentina(texto) {
  return new Date(texto.replace(' ', 'T') + '-03:00');
}

/** "2026-11-18 10:30:00" -> "18/11/2026 10:30" */
export function fechaHora(texto) {
  if (!texto) return '';
  const [fecha, hora] = texto.split(' ');
  const [a, m, d] = fecha.split('-');
  return `${d}/${m}/${a} ${hora.slice(0, 5)}`;
}

/** "2026-11-25" -> "miércoles 25/11" */
export function diaConNombre(texto) {
  const [a, m, d] = texto.split('-').map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS[dia]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
}

/** Hoy en Argentina, como "2026-11-18" (para comparar con retirar_hasta). */
export function hoyArgentina() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Unidades de un carrito (la suma de las cantidades). */
export function unidades(carrito) {
  return (carrito.items ?? []).reduce((suma, item) => suma + item.cantidad, 0);
}

/** Avisa al menú (auth.js) que cambió el carrito, para actualizar "Carrito (N)". */
export function avisarCarrito(carrito) {
  document.dispatchEvent(new CustomEvent('carrito:cantidad', { detail: unidades(carrito) }));
}

/** Lleva a iniciar sesión y, después de entrar, de vuelta a esta misma página. */
export function irALogin() {
  location.href = '/login/login.html?volver=' + encodeURIComponent(location.pathname + location.search);
}

/**
 * Agrega un producto al carrito (POST /api/tienda/carrito/items).
 * Devuelve el texto para mostrar: lo que pasó, o por qué no se pudo.
 */
export async function agregarAlCarrito(producto, cantidad) {
  try {
    const carrito = await api('/api/tienda/carrito/items', {
      metodo: 'POST',
      cuerpo: { producto_id: Number(producto.id), cantidad },
    });
    avisarCarrito(carrito);
    return { ok: true, texto: `Agregaste ${producto.nombre} al carrito.` };
  } catch (error) {
    return { ok: false, texto: textoDeError(error, producto.nombre) };
  }
}

/** El mensaje para la persona según el error de la API del carrito. */
export function textoDeError(error, nombre = 'el producto') {
  const datos = error?.datos ?? {};
  if (error?.estado === 409 && Number.isInteger(datos.stock)) {
    return datos.stock === 0
      ? `No queda stock de ${nombre}.`
      : `No hay tanto stock de ${nombre}: quedan ${datos.stock} en total (contando las que ya tenés en el carrito).`;
  }
  if (error?.estado === 404) return `${nombre} ya no está a la venta.`;
  if (error?.estado === 401) return 'Tu sesión venció. Volvé a iniciar sesión.';
  if (datos.error) return datos.error;
  return 'No se pudo conectar con el servidor. Probá de nuevo en un momento.';
}
