/**
 * compras.js — Pantalla "Mis compras" (tienda/compras.html): GET /api/tienda/compras.
 * Contrato: repo Inventario, docs/api/contrato-tienda.md.
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { TEXTO_ESTADO, diaConNombre, fechaHora, precio, textoDeError } from './tienda.js';

const $estado = document.getElementById('estado');
const $vacio = document.getElementById('vacio');
const $tabla = document.getElementById('tabla');
const $filas = document.getElementById('filas');

await exigirRol(['CLIENTE', 'RESCATISTA']);

try {
  const { datos: compras = [] } = await api('/api/tienda/compras');
  $estado.textContent = '';
  $vacio.hidden = compras.length > 0;
  $tabla.hidden = compras.length === 0;
  $filas.replaceChildren(...compras.map(crearFila));
} catch (error) {
  $estado.textContent = textoDeError(error);
}

function crearFila(compra) {
  const fila = el('tr');
  const numero = el('td');
  numero.append(el('a', compra.numero, { href: '/tienda/compra.html?numero=' + encodeURIComponent(compra.numero) }));
  fila.append(
    numero,
    el('td', fechaHora(compra.fecha)),
    el('td', precio(compra.total)),
    el('td', TEXTO_ESTADO[compra.estado] ?? compra.estado, { class: 'estado-compra estado-' + compra.estado.toLowerCase() }),
    el('td', plazo(compra)),
  );
  return fila;
}

// Lo que tiene que hacer el comprador y hasta cuándo.
function plazo(compra) {
  if (compra.estado === 'PENDIENTE_PAGO' && compra.pagar_antes_de) {
    return `Pagá antes de las ${compra.pagar_antes_de.slice(11, 16)}`;
  }
  if (compra.estado === 'PAGADA' && compra.retirar_hasta) {
    return `Retirala hasta el ${diaConNombre(compra.retirar_hasta)}`;
  }
  return '';
}
