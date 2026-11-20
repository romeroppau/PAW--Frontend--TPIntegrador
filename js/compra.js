/**
 * compra.js — Una compra del comprador (tienda/compra.html?numero=V-000101).
 *
 * API (repo Inventario, docs/api/contrato-tienda.md):
 *   GET  /api/tienda/compras/{numero}            la compra con sus productos y sus plazos
 *   POST /api/tienda/compras/{numero}/cancelar   cancelarla: antes de pagar, o ya pagada (sin devolución)
 *   POST /api/tienda/compras/{numero}/pago       a dónde ir a pagar (Mercado Pago o, en pruebas, el simulado)
 *   POST /api/tienda/compras/{numero}/pago/confirmar   al volver de Mercado Pago, con su payment_id
 *
 * Al volver de Mercado Pago la dirección trae ?payment_id=…&status=approved|rejected: se le pide al
 * servidor que confirme ese pago (él se lo pregunta a Mercado Pago) y se muestra cómo quedó.
 *
 * Esperando el pago, muestra una cuenta regresiva que parte de segundos_para_pagar (lo cuenta el
 * servidor: así no importa si el reloj de la computadora está adelantado o atrasado). Al llegar a
 * cero vuelve a pedir la compra: el servidor la cancela al consultarla ("al pasar").
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { confirmar, el } from './ui.js';
import { PAGO_RECHAZADO, POLITICA, TEXTO_ESTADO, diaConNombre, fechaArgentina, fechaHora, irAPagar, precio, textoDeError } from './tienda.js';

// Cuándo vence, en la hora de esta computadora: ahora + lo que dice el servidor que falta.
// Si la API no mandara segundos_para_pagar, se usa pagar_antes_de.
function limiteParaPagar(compra) {
  return Number.isInteger(compra.segundos_para_pagar)
    ? new Date(Date.now() + compra.segundos_para_pagar * 1000)
    : fechaArgentina(compra.pagar_antes_de);
}

const $estado = document.getElementById('estado');
const $error = document.getElementById('error');
const $compra = document.getElementById('compra');
const $pendiente = document.getElementById('pendiente');
const $tiempo = document.getElementById('tiempo');
const $aviso = document.getElementById('aviso');
const $cancelar = document.getElementById('cancelar');
const $pagada = document.getElementById('pagada');
const $cancelarPedido = document.getElementById('cancelar-pedido');
const $bloquePolitica = document.getElementById('bloque-politica');
const $pagar = document.getElementById('pagar');
const $resultadoPago = document.getElementById('resultado-pago');

document.getElementById('politica').textContent = POLITICA;

const parametros = new URLSearchParams(location.search);
const numero = parametros.get('numero') ?? '';
// Lo que agregó Mercado Pago (o el pago simulado) a la dirección al volver.
const pagoId = parametros.get('payment_id') ?? '';
const estadoPago = parametros.get('status') ?? parametros.get('collection_status') ?? '';
let reloj = null;          // el setInterval de la cuenta regresiva
let reintentos = 0;        // si el reloj de la compu va adelantado, se vuelve a preguntar unas veces

await exigirRol(['CLIENTE', 'RESCATISTA']);

if (!/^V-\d+$/.test(numero)) {
  mostrarError('No encontramos esa compra. Volvé a Mis compras y elegila de la lista.');
} else if (/^\d+$/.test(pagoId)) {
  volverDeMercadoPago();
} else {
  cargar();
  if (estadoPago === 'rejected') mostrarResultadoPago(PAGO_RECHAZADO, false);
  if (parametros.get('pago') === 'no_disponible') {
    mostrarResultadoPago('No pudimos llevarte a Mercado Pago. Probá con "Pagar con Mercado Pago" antes de que termine el tiempo.', false);
  }
}

// ---------- Vuelta de Mercado Pago ----------

// Se le pide al servidor que confirme el pago. Después se saca payment_id de la dirección: si se
// recarga la página, no se vuelve a confirmar (igual no se repetiría: el pago es único).
async function volverDeMercadoPago() {
  history.replaceState(null, '', '/tienda/compra.html?numero=' + encodeURIComponent(numero));
  try {
    const compra = await api('/api/tienda/compras/' + encodeURIComponent(numero) + '/pago/confirmar',
      { metodo: 'POST', cuerpo: { payment_id: pagoId } });
    dibujar(compra);
    if (compra.estado === 'PAGADA') {
      mostrarResultadoPago('¡Listo! Tu pago se acreditó y el pedido está listo para retirar.', true);
    } else if (estadoPago === 'rejected') {
      mostrarResultadoPago(PAGO_RECHAZADO, false);
    }
  } catch (error) {
    // Si no se pudo confirmar ahora, se muestra la compra como está: el aviso de Mercado Pago la actualiza.
    cargar();
    mostrarResultadoPago('Estamos confirmando tu pago con Mercado Pago. Actualizá la página en unos minutos.', false);
  }
}

function mostrarResultadoPago(texto, ok) {
  $resultadoPago.textContent = texto;
  $resultadoPago.className = 'mensaje ' + (ok ? 'mensaje-ok' : 'mensaje-error');
  $resultadoPago.hidden = false;
}

async function cargar() {
  try {
    dibujar(await api('/api/tienda/compras/' + encodeURIComponent(numero)));
  } catch (error) {
    mostrarError(error?.estado === 404 ? 'No encontramos esa compra.' : textoDeError(error));
  }
}

function dibujar(compra) {
  $estado.textContent = '';
  $compra.hidden = false;
  document.title = `Compra ${compra.numero} | HuellaVet`;
  document.getElementById('titulo').textContent = `Compra ${compra.numero}`;
  const $estadoCompra = document.getElementById('estado-compra');
  $estadoCompra.textContent = TEXTO_ESTADO[compra.estado] ?? compra.estado;
  $estadoCompra.className = 'estado-compra estado-' + compra.estado.toLowerCase();
  document.getElementById('fecha').textContent = fechaHora(compra.fecha);

  document.getElementById('filas').replaceChildren(...(compra.items ?? []).map((item) => {
    const fila = el('tr');
    fila.append(el('td', item.nombre), el('td', precio(item.precio_unitario)), el('td', item.cantidad), el('td', precio(item.subtotal)));
    return fila;
  }));
  document.getElementById('total').textContent = precio(compra.total);

  // Lo que corresponde a cada estado.
  detenerReloj();
  $pendiente.hidden = compra.estado !== 'PENDIENTE_PAGO';
  $pagada.hidden = compra.estado !== 'PAGADA';
  $bloquePolitica.hidden = !['PENDIENTE_PAGO', 'PAGADA'].includes(compra.estado);
  const avisos = {
    PAGADA: (compra.operacion_mp ? `Pagaste con Mercado Pago · operación N° ${compra.operacion_mp}. ` : '')
      + (compra.retirar_hasta ? `Ya podés retirarla en el local, hasta el ${diaConNombre(compra.retirar_hasta)} inclusive.` : ''),
    ENTREGADA: compra.entregada_en ? `La retiraste el ${fechaHora(compra.entregada_en)}.` : 'Ya la retiraste.',
    CANCELADA: {
      COMPRADOR: 'Cancelaste esta compra.',
      SIN_PAGO: 'Esta compra se canceló porque no se pagó a tiempo.',
      VENCIDA: 'Esta compra se canceló porque venció el plazo de retiro. El importe no se reintegra.',
    }[compra.motivo_cancelacion] ?? 'Esta compra está cancelada.',
  };
  $aviso.textContent = avisos[compra.estado] ?? '';
  $aviso.hidden = $aviso.textContent === '';

  if (compra.estado === 'PENDIENTE_PAGO' && (compra.pagar_antes_de || Number.isInteger(compra.segundos_para_pagar))) {
    iniciarReloj(limiteParaPagar(compra));
  }
}

// ---------- Cuenta regresiva ----------

// El link de Mercado Pago vence 1 minuto antes que la compra (así un pago que empezó a tiempo tiene
// ese minuto para terminar). En el último minuto ya no se puede empezar a pagar.
const SEGUNDOS_DE_MARGEN_DEL_LINK = 60;

function iniciarReloj(limite) {
  $pagar.disabled = false;
  const actualizar = () => {
    const resta = Math.max(0, Math.floor((limite.getTime() - Date.now()) / 1000));
    $tiempo.textContent = `${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, '0')}`;
    if (resta <= SEGUNDOS_DE_MARGEN_DEL_LINK && !$pagar.disabled) {
      $pagar.disabled = true;
      mostrarResultadoPago('Ya no queda tiempo para pagar esta compra.', false);
    }
    if (resta === 0) vencio();
  };
  actualizar();
  reloj = setInterval(actualizar, 1000);
}

function detenerReloj() {
  clearInterval(reloj);
  reloj = null;
}

// Se terminó el tiempo: se vuelve a pedir la compra, que el servidor ya cancela al consultarla.
// Si todavía no (el reloj de la computadora va un poco adelantado), se pregunta otra vez en 5 segundos.
async function vencio() {
  detenerReloj();
  try {
    const compra = await api('/api/tienda/compras/' + encodeURIComponent(numero));
    if (compra.estado === 'PENDIENTE_PAGO' && reintentos < 6) {
      reintentos++;
      setTimeout(vencio, 5000);
      return;
    }
    dibujar(compra);
    if (compra.estado === 'CANCELADA') {
      $aviso.textContent = 'Se terminó el tiempo para pagar y la compra se canceló. Los productos volvieron a estar disponibles.';
    }
  } catch (error) {
    mostrarError(textoDeError(error));
  }
}

// ---------- Pagar ----------

$pagar.addEventListener('click', async () => {
  $pagar.disabled = true;
  try {
    await irAPagar(numero);
  } catch (error) {
    $pagar.disabled = false;
    // 409: el servidor dice por qué (ya no espera el pago, o ya no queda tiempo para pagar).
    mostrarResultadoPago(error?.estado === 409 ? (error.datos?.error ?? 'Esta compra ya no está esperando el pago.') : textoDeError(error), false);
    cargar();
  }
});

// ---------- Cancelar ----------
// Antes de pagar (arrepentimiento) o ya pagada, mientras está para retirar: el importe no se reintegra.

$cancelar.addEventListener('click', () => cancelar($cancelar,
  `¿Cancelás la compra ${numero}? Los productos vuelven a estar disponibles.`, 'Cancelar compra'));

$cancelarPedido.addEventListener('click', () => cancelar($cancelarPedido,
  `¿Cancelás el pedido ${numero}? Los productos vuelven a la tienda y el importe no se reintegra.`, 'Cancelar pedido'));

async function cancelar(boton, pregunta, aceptar) {
  const seguro = await confirmar(pregunta, { aceptar, peligro: true });
  if (!seguro) return;

  boton.disabled = true;
  try {
    dibujar(await api('/api/tienda/compras/' + encodeURIComponent(numero) + '/cancelar', { metodo: 'POST' }));
  } catch (error) {
    mostrarError(textoDeError(error));
    cargar();
  } finally {
    boton.disabled = false;
  }
}

function mostrarError(texto) {
  $estado.textContent = '';
  $error.textContent = texto;
  $error.hidden = texto === '';
}
