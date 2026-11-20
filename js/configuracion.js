/**
 * configuracion.js — Configuración de la veterinaria (panel/configuracion.html), rol 3, Entrega 5
 *
 * Arma un grupo por cada "grupo" de la API (Turnos, Avisos a los clientes, Stock y vencimientos) con
 * un campo por parámetro: su rango, su unidad, el valor por defecto y quién lo cambió por última vez.
 * Al guardar manda solo los que cambiaron (PUT /api/configuracion); se guardan todos o ninguno, y
 * los errores vuelven por campo. "Usar el valor por defecto" pone el de siempre en el campo (se
 * guarda con el resto).
 * Contrato: docs/api/contrato.md de Backend, sección "Configuración". Todo texto de la API va con el().
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el, limpiarErrores, mostrarErrores } from './ui.js';

await exigirRol('VETERINARIO');

const $ = (id) => document.getElementById(id);
const form = $('form-configuracion');
const estado = $('estado');
const guardado = $('guardado');

// Los parámetros tal como los devolvió el servidor por última vez.
let parametros = [];

// "2026-11-20 10:15:00" → "20/11/2026"
const fecha = (texto) => texto.slice(0, 10).split('-').reverse().join('/');
const textoValor = (p, valor) => (p.unidad ? `${valor} ${p.unidad}` : String(valor));

// El valor del campo, con el tipo que espera la API (número o "HH:MM").
function valorDelCampo(p) {
  const texto = form.elements[p.clave].value.trim();
  if (p.tipo !== 'ENTERO') return texto;
  return /^\d+$/.test(texto) ? Number(texto) : texto;
}

const cambio = (p) => valorDelCampo(p) !== p.valor;

// El botón "Usar el valor por defecto" solo tiene sentido si el campo tiene otro valor.
function actualizarBotonDefecto(p) {
  form.querySelector(`[data-defecto="${p.clave}"]`).hidden = valorDelCampo(p) === p.defecto;
}

function campo(p) {
  const id = 'p-' + p.clave;
  const caja = el('div', '', { class: 'campo parametro' });

  const etiqueta = el('label', p.nombre, { for: id });
  const fila = el('div', '', { class: 'valor-parametro' });
  const input = p.tipo === 'HORA'
    ? el('input', '', { id, name: p.clave, type: 'time', min: p.minimo, max: p.maximo, required: '' })
    : el('input', '', { id, name: p.clave, type: 'number', min: String(p.minimo), max: String(p.maximo), step: '1', inputmode: 'numeric', required: '' });
  input.value = String(p.valor);
  input.setAttribute('aria-describedby', `ayuda-${p.clave} error-${p.clave}`);
  fila.append(input);
  if (p.unidad) fila.append(el('span', p.unidad, { class: 'unidad' }));

  const ayuda = el('p', `${p.ayuda} Entre ${p.minimo} y ${textoValor(p, p.maximo)}. Por defecto: ${textoValor(p, p.defecto)}.`, {
    class: 'campo-ayuda', id: 'ayuda-' + p.clave
  });

  const botonDefecto = el('button', `Usar el valor por defecto (${textoValor(p, p.defecto)})`, {
    type: 'button', class: 'boton boton-borde boton-chico', 'data-defecto': p.clave
  });
  botonDefecto.addEventListener('click', () => {
    input.value = String(p.defecto);
    actualizarBotonDefecto(p);
    input.focus();
  });
  input.addEventListener('input', () => actualizarBotonDefecto(p));

  caja.append(etiqueta, fila, ayuda);
  if (p.modificado) {
    caja.append(el('p', `Cambiado por ${p.actualizado_por} el ${fecha(p.actualizado_en)}.`, { class: 'cambiado' }));
  }
  caja.append(botonDefecto, el('span', '', { class: 'campo-error', id: 'error-' + p.clave }));
  return caja;
}

function pintar() {
  const grupos = new Map();
  for (const p of parametros) {
    if (!grupos.has(p.grupo)) {
      const fieldset = el('fieldset', '', { class: 'grupo-parametros' });
      fieldset.append(el('legend', p.nombre_grupo));
      grupos.set(p.grupo, fieldset);
    }
    grupos.get(p.grupo).append(campo(p));
  }
  $('grupos').replaceChildren(...grupos.values());
  parametros.forEach(actualizarBotonDefecto);
}

async function cargar() {
  try {
    ({ parametros } = await api('/api/configuracion'));
    pintar();
    estado.textContent = '';
    form.hidden = false;
  } catch {
    estado.textContent = 'No se pudo cargar la configuración. Probá de nuevo.';
  }
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  limpiarErrores(form);
  guardado.hidden = true;

  const valores = Object.fromEntries(parametros.filter(cambio).map((p) => [p.clave, valorDelCampo(p)]));
  if (Object.keys(valores).length === 0) {
    guardado.textContent = 'No cambiaste ningún valor.';
    guardado.hidden = false;
    return;
  }

  const boton = $('guardar');
  boton.disabled = true;
  try {
    ({ parametros } = await api('/api/configuracion', { metodo: 'PUT', cuerpo: { valores } }));
    pintar();
    const nombres = parametros.filter((p) => p.clave in valores).map((p) => `"${p.nombre}"`);
    const lista = nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
    guardado.textContent = `Listo: ${nombres.length === 1 ? 'se guardó' : 'se guardaron'} ${lista}. Ya se usa en todo el sistema.`;
    guardado.hidden = false;
  } catch (e) {
    if (e?.estado === 400) {
      mostrarErrores(form, e.datos?.campos ?? {}, 'Revisá los valores marcados: no se guardó ninguno.');
      form.querySelector('[aria-invalid="true"]')?.focus();
    } else {
      mostrarErrores(form, {}, 'No se pudo guardar. Probá de nuevo.');
    }
  } finally {
    boton.disabled = false;
  }
});

// Vuelve los campos a lo que está guardado.
$('descartar').addEventListener('click', () => {
  limpiarErrores(form);
  guardado.hidden = true;
  pintar();
});

cargar();
