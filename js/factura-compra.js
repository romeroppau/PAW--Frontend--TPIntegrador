/**
 * factura-compra.js — Factura de una compra de la tienda (tienda/factura.html?numero=V-000123).
 *
 * API: GET /api/tienda/compras/{numero}/factura (repo Inventario, docs/api/contrato-tienda.md).
 * Solo tienen factura las compras pagadas (aunque después se hayan cancelado): si no tiene, o es
 * de otro comprador, el servidor responde 404. Todo texto de la API se inserta con textContent.
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { TEXTO_MOTIVO, diaConNombre, fechaHora, precio } from './tienda.js';

// En la factura, el estado se dice desde el pago (no "Esperando el pago": una factura ya está paga).
const TEXTO_ESTADO_FACTURA = {
  PAGADA: 'Pagada · para retirar',
  ENTREGADA: 'Pagada · entregada',
  CANCELADA: 'Cancelada',
};

const $estado = document.getElementById('estado');
const numero = new URLSearchParams(location.search).get('numero');
const poner = (id, texto) => { document.getElementById(id).textContent = texto; };

const usuario = await exigirRol(['CLIENTE', 'RESCATISTA', 'VETERINARIO']);

// "Volver": la veterinaria vuelve a Ventas; el comprador, a la compra.
const $volver = document.getElementById('volver');
if (usuario.rol === 'VETERINARIO') {
  $volver.href = '/panel/ventas.html';
  $volver.textContent = '← Ventas de la tienda';
} else if (numero) {
  $volver.href = '/tienda/compra.html?numero=' + encodeURIComponent(numero);
  $volver.textContent = '← Volver a la compra';
}

if (!numero) {
  $estado.textContent = 'Falta indicar la compra.';
} else {
  $estado.textContent = 'Cargando…';
  try {
    mostrar(await api(`/api/tienda/compras/${encodeURIComponent(numero)}/factura`));
    $estado.textContent = '';
  } catch (error) {
    $estado.textContent = error?.estado === 404
      ? 'Esta compra no tiene factura: solo las compras pagadas tienen factura.'
      : 'No se pudo cargar la factura.';
  }
}

function mostrar(f) {
  document.title = `Factura ${f.numero} | HuellaVet`;
  poner('titulo', `Factura ${f.numero}`);
  const $estadoFactura = document.getElementById('estado-factura');
  $estadoFactura.textContent = TEXTO_ESTADO_FACTURA[f.estado] ?? f.estado;
  $estadoFactura.className = 'estado-compra estado-' + f.estado.toLowerCase();

  document.getElementById('para-retirar').hidden = f.estado !== 'PAGADA';
  poner('numero-pedido', f.numero);

  poner('fecha', fechaHora(f.fecha));
  poner('comprador', f.comprador?.nombre ?? '—');
  poner('medio-pago', `${f.pago?.medio ?? 'Mercado Pago'}${f.pago?.operacion ? ' · operación N° ' + f.pago.operacion : ''}`);

  // El último dato depende de cómo está: hasta cuándo retirarla, cuándo se entregó o por qué se canceló.
  if (f.estado === 'PAGADA') {
    poner('titulo-dato-estado', 'Retirar hasta');
    poner('dato-estado-valor', f.retirar_hasta ? `${diaConNombre(f.retirar_hasta)} inclusive` : '—');
  } else if (f.estado === 'ENTREGADA') {
    poner('titulo-dato-estado', 'Entregada');
    poner('dato-estado-valor', fechaHora(f.entregada_en) + (f.entregada_por ? `, por ${f.entregada_por}` : ''));
  } else {
    poner('titulo-dato-estado', 'Cancelada');
    poner('dato-estado-valor', [fechaHora(f.cancelada_en), TEXTO_MOTIVO[f.motivo_cancelacion]].filter(Boolean).join(' · ') || '—');
  }

  document.getElementById('filas').replaceChildren(...(f.items ?? []).map((item) => {
    const fila = el('tr');
    fila.append(
      el('td', item.nombre),
      el('td', item.cantidad, { class: 'numero' }),
      el('td', precio(item.precio_unitario), { class: 'numero' }),
      el('td', precio(item.subtotal), { class: 'numero' }),
    );
    return fila;
  }));
  poner('total', precio(f.total));

  document.getElementById('factura').hidden = false;
}

document.getElementById('imprimir').addEventListener('click', () => window.print());
