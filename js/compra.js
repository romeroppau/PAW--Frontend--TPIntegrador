/**
 * compra.js — Una compra del comprador (tienda/compra.html?numero=V-000101).
 *
 * API (repo Inventario, docs/api/contrato-tienda.md):
 *   GET  /api/tienda/compras/{numero}            la compra con sus productos y sus plazos
 *   POST /api/tienda/compras/{numero}/cancelar   arrepentirse antes de pagar
 *
 * Esperando el pago, muestra una cuenta regresiva que parte de segundos_para_pagar (lo cuenta el
 * servidor: así no importa si el reloj de la computadora está adelantado o atrasado). Al llegar a
 * cero vuelve a pedir la compra: el servidor la cancela al consultarla ("al pasar").
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { confirmar, el } from './ui.js';
import { POLITICA, TEXTO_ESTADO, diaConNombre, fechaArgentina, fechaHora, precio, textoDeError } from './tienda.js';

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
const $bloquePolitica = document.getElementById('bloque-politica');

document.getElementById('politica').textContent = POLITICA;

const numero = new URLSearchParams(location.search).get('numero') ?? '';
let reloj = null;          // el setInterval de la cuenta regresiva
let reintentos = 0;        // si el reloj de la compu va adelantado, se vuelve a preguntar unas veces

await exigirRol(['CLIENTE', 'RESCATISTA']);

if (!/^V-\d+$/.test(numero)) {
  mostrarError('No encontramos esa compra. Volvé a Mis compras y elegila de la lista.');
} else {
  cargar();
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
  $bloquePolitica.hidden = !['PENDIENTE_PAGO', 'PAGADA'].includes(compra.estado);
  const avisos = {
    PAGADA: compra.retirar_hasta ? `Ya podés retirarla en el local, hasta el ${diaConNombre(compra.retirar_hasta)} inclusive.` : '',
    ENTREGADA: compra.entregada_en ? `La retiraste el ${fechaHora(compra.entregada_en)}.` : 'Ya la retiraste.',
    CANCELADA: 'Esta compra está cancelada.',
  };
  $aviso.textContent = avisos[compra.estado] ?? '';
  $aviso.hidden = $aviso.textContent === '';

  if (compra.estado === 'PENDIENTE_PAGO' && (compra.pagar_antes_de || Number.isInteger(compra.segundos_para_pagar))) {
    iniciarReloj(limiteParaPagar(compra));
  }
}

// ---------- Cuenta regresiva ----------

function iniciarReloj(limite) {
  const actualizar = () => {
    const resta = Math.max(0, Math.floor((limite.getTime() - Date.now()) / 1000));
    $tiempo.textContent = `${Math.floor(resta / 60)}:${String(resta % 60).padStart(2, '0')}`;
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

// ---------- Arrepentimiento ----------

$cancelar.addEventListener('click', async () => {
  const seguro = await confirmar(`¿Cancelás la compra ${numero}? Los productos vuelven a estar disponibles.`,
    { aceptar: 'Cancelar compra', peligro: true });
  if (!seguro) return;

  $cancelar.disabled = true;
  try {
    dibujar(await api('/api/tienda/compras/' + encodeURIComponent(numero) + '/cancelar', { metodo: 'POST' }));
  } catch (error) {
    mostrarError(textoDeError(error));
    cargar();
  } finally {
    $cancelar.disabled = false;
  }
});

function mostrarError(texto) {
  $estado.textContent = '';
  $error.textContent = texto;
  $error.hidden = texto === '';
}
