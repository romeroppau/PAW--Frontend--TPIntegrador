/**
 * pago-simulado.js — Página del pago simulado (tienda/pago-simulado.html?numero=V-000123).
 * Solo en las pruebas: POST /api/tienda/pagos/simulado y vuelve a la compra con status=approved o
 * rejected, como lo hace Mercado Pago. Contrato: repo Inventario, docs/api/contrato-tienda.md.
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { textoDeError } from './tienda.js';

const numero = new URLSearchParams(location.search).get('numero') ?? '';
const $error = document.getElementById('error');
const botones = [document.getElementById('aprobar'), document.getElementById('rechazar')];

document.getElementById('numero').textContent = numero;
await exigirRol(['CLIENTE', 'RESCATISTA']);

async function terminar(resultado) {
  botones.forEach((boton) => { boton.disabled = true; });
  try {
    await api('/api/tienda/pagos/simulado', { metodo: 'POST', cuerpo: { numero, resultado } });
    const status = resultado === 'aprobado' ? 'approved' : 'rejected';
    location.href = '/tienda/compra.html?numero=' + encodeURIComponent(numero) + '&status=' + status;
  } catch (error) {
    botones.forEach((boton) => { boton.disabled = false; });
    $error.textContent = error?.estado === 404
      ? 'El pago simulado solo funciona en las pruebas (en este sitio se paga con Mercado Pago).'
      : textoDeError(error);
    $error.hidden = false;
  }
}

document.getElementById('aprobar').addEventListener('click', () => terminar('aprobado'));
document.getElementById('rechazar').addEventListener('click', () => terminar('rechazado'));
