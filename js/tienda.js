/**
 * tienda.js — Lo común de las pantallas de la tienda (catálogo, carrito, compras y ventas).
 *
 * Contrato de la API: repo Inventario, docs/api/contrato-tienda.md.
 * Las fechas llegan en hora de Argentina, sin zona: "2026-11-18 10:30:00".
 */
import { api } from './api.js';
import { errorDeRango } from './rango-fechas.js';

/** La política de reintegro por defecto (la configura la veterinaria; llega del servidor). */
const REINTEGRO_POR_DEFECTO = { anticipado: 75, ultimo_momento: 50, horas: 48 };

/**
 * Política de cancelación: se muestra en el carrito (antes de pagar) y en la compra.
 * Los días y el reintegro los configura la veterinaria: llegan del servidor
 * (dias_habiles_para_retirar y politica_reintegro).
 */
export function politica(dias = 5, reintegro = REINTEGRO_POR_DEFECTO) {
  return `Tenés ${dias} días hábiles desde la compra para retirar tu pedido en el local. `
    + textoReintegro(reintegro ?? REINTEGRO_POR_DEFECTO)
    + ' Si no lo retirás a tiempo, el pedido se cancela y el importe no se reintegra.';
}

function textoReintegro({ anticipado, ultimo_momento: ultimoMomento, horas }) {
  if (anticipado === 0) return 'Si cancelás un pedido ya pagado, el importe no se reintegra.';
  if (anticipado === ultimoMomento) return `Si cancelás un pedido ya pagado, te devolvemos el ${anticipado} % del importe.`;
  return `Si cancelás un pedido ya pagado con ${horas} horas o más antes del final del último día para retirar, `
    + `te devolvemos el ${anticipado} % del importe; `
    + (ultimoMomento === 0 ? 'si cancelás después, no se reintegra.' : `si cancelás después, el ${ultimoMomento} %.`);
}

/**
 * Cuánto se devuelve si cancela AHORA una compra pagada (politica_reintegro de la compra):
 * { porcentaje, monto }. Se compara con el reloj de la computadora; igual decide el servidor.
 */
export function reintegroAhora(p) {
  const anticipado = Date.now() <= fechaArgentina(p.anticipado_hasta).getTime();
  return anticipado
    ? { porcentaje: p.anticipado, monto: p.monto_anticipado }
    : { porcentaje: p.ultimo_momento, monto: p.monto_ultimo_momento };
}

/** La política de una compra pagada con fechas y montos: "Si lo cancelás hasta el lunes 23/11/2026 a las 23:59…". */
export function reintegroConFechas(p) {
  const montoUltimo = p.monto_ultimo_momento > 0 ? `${precio(p.monto_ultimo_momento)} (el ${p.ultimo_momento} %)` : null;
  const ahora = reintegroAhora(p);
  if (p.anticipado === p.ultimo_momento || ahora.porcentaje !== p.anticipado) {
    return ahora.monto > 0
      ? `Si lo cancelás, los productos vuelven a la tienda y te devolvemos ${precio(ahora.monto)} (el ${ahora.porcentaje} % de lo que pagaste).`
      : 'Si lo cancelás, los productos vuelven a la tienda y el importe no se reintegra.';
  }
  const hasta = `${diaConNombre(p.anticipado_hasta.slice(0, 10))} a las ${p.anticipado_hasta.slice(11, 16)}`;
  return `Si lo cancelás hasta el ${hasta}, te devolvemos ${precio(p.monto_anticipado)} (el ${p.anticipado} %); `
    + (montoUltimo ? `después, ${montoUltimo}.` : 'después, el importe no se reintegra.');
}

/** El reintegro de una compra cancelada por el comprador: "$ 10.875,00 (el 75 %)", o null. */
export function textoDelReintegro(reintegro) {
  if (!reintegro || !(reintegro.monto > 0)) return null;
  return `${precio(reintegro.monto)} (el ${reintegro.porcentaje} %)`;
}

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

/** "2026-12-10" -> "10/12/2026" (todas las fechas, DD/MM/AAAA) */
const diaMes = (texto) => texto.slice(0, 10).split('-').reverse().join('/');

/**
 * El precio de un producto del catálogo, con su promoción si tiene (producto.promocion, ver
 * contrato.md de Inventario): el precio de siempre tachado, el rebajado, el porcentaje y hasta cuándo.
 * Devuelve un <p class="precio"> (más las clases que se pasen). Sin promoción, solo el precio.
 */
export function bloquePrecio(producto, clases = '') {
  const p = document.createElement('p');
  p.className = ('precio ' + clases).trim();
  const promo = producto.promocion;
  if (!promo) {
    p.textContent = producto.precio == null ? 'Precio a consultar' : precio(producto.precio);
    return p;
  }
  p.classList.add('precio-con-promo');
  const antes = document.createElement('del');
  antes.className = 'precio-anterior';
  antes.textContent = precio(producto.precio);
  const ahora = document.createElement('ins');
  ahora.className = 'precio-promo';
  ahora.textContent = precio(promo.precio);
  const insignia = document.createElement('span');
  insignia.className = 'insignia insignia-promo';
  insignia.textContent = `${promo.porcentaje} % off`;
  const hasta = document.createElement('span');
  hasta.className = 'promo-hasta';
  // La promoción es de un lote (26/11): dura hasta su fecha o hasta que se terminan sus unidades.
  hasta.textContent = `Promoción hasta el ${diaMes(promo.hasta)}`
    + (promo.quedan ? ` o hasta agotar ${promo.quedan === 1 ? 'la última unidad' : `las ${promo.quedan} unidades`}` : '');
  // Para los lectores de pantalla, <del> e <ins> no siempre se anuncian: se aclara con texto.
  const leerAntes = document.createElement('span');
  leerAntes.className = 'solo-lectores';
  leerAntes.textContent = 'Antes: ';
  const leerAhora = document.createElement('span');
  leerAhora.className = 'solo-lectores';
  leerAhora.textContent = 'Ahora: ';
  p.append(leerAntes, antes, ' ', leerAhora, ahora, ' ', insignia, hasta);
  return p;
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

/** "2026-11-25" -> "25/11/2026" */
export function fecha(texto) {
  if (!texto) return '';
  const [a, m, d] = texto.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

/**
 * El filtro Desde / Hasta de las listas por fecha (Mis compras y el historial de Ventas).
 * Devuelve { desde, hasta } para el pedido (vacío = el servidor usa los últimos 30 días),
 * o un texto de error si "desde" es después de "hasta".
 */
export function leerFechas($desde, $hasta) {
  const error = errorDeRango($desde, $hasta);
  if (error) return error;
  return { desde: $desde.value, hasta: $hasta.value };
}

/** "2026-11-25" -> "miércoles 25/11/2026" */
export function diaConNombre(texto) {
  const [a, m, d] = texto.split('-').map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return `${DIAS[dia]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
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

/** El mensaje cuando Mercado Pago rechaza el pago. */
export const PAGO_RECHAZADO = 'El pago fue rechazado. Volvé a intentarlo antes de que termine el tiempo.';

/**
 * Lleva al comprador a pagar la compra (POST /api/tienda/compras/{numero}/pago): a Mercado Pago o,
 * en las pruebas, a la página del pago simulado. Si no se puede, lanza el error de la API.
 */
export async function irAPagar(numero) {
  const { url } = await api('/api/tienda/compras/' + encodeURIComponent(numero) + '/pago', { metodo: 'POST' });
  location.href = url;
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
