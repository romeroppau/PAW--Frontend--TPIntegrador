/**
 * configuracion.js — Configuración de la veterinaria (panel/configuracion.html), rol 3, Entrega 5
 *
 * Arma una pestaña por cada "grupo" de la API (Turnos, Avisos a los clientes, Stock y vencimientos,
 * Tienda y Datos de la veterinaria: dirección, teléfono, WhatsApp, email y redes, de tipo TEXTO), con
 * un campo por parámetro: su rango, su unidad, el valor por defecto y quién lo cambió por última vez.
 * Se ve una pestaña por vez y "Guardar cambios" guarda solo esa: manda los que cambiaron
 * (PUT /api/configuracion), se guardan todos o ninguno y los errores vuelven por campo. Si se elige
 * otra pestaña con cambios sin guardar, pregunta si se descartan.
 * Se abre la última pestaña que se usó (o la del enlace: configuracion.html#tienda).
 * "Usar el valor por defecto" pone el de siempre en el campo (se guarda con el resto).
 * Contrato: docs/api/contrato.md de Backend, sección "Configuración". Todo texto de la API va con el().
 */
import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el, limpiarErrores, mostrarErrores, confirmar } from './ui.js';
import { activarPestanas } from './pestanas.js';

await exigirRol('VETERINARIO');

const $ = (id) => document.getElementById(id);
const form = $('form-configuracion');
const estado = $('estado');
const guardado = $('guardado');

// Los parámetros tal como los devolvió el servidor por última vez.
let parametros = [];

// La pestaña abierta: el grupo en minúsculas ("turnos", "tienda", "contacto"…). Se recuerda en este
// navegador (si no se puede, no pasa nada: se abre la primera).
const RECORDAR = 'configuracion-pestana';
const vistaDe = (grupo) => grupo.toLowerCase();
let vistaActual = location.hash.slice(1) || leerRecordada();
let elegirPestana = () => {};

function leerRecordada() {
  try { return localStorage.getItem(RECORDAR) ?? ''; } catch { return ''; }
}
function recordar(vista) {
  try { localStorage.setItem(RECORDAR, vista); } catch { /* sin almacenamiento: no se recuerda */ }
  history.replaceState(null, '', '#' + vista);
}

const deLaPestana = (vista) => parametros.filter((p) => vistaDe(p.grupo) === vista);

// "2026-11-20 10:15:00" → "20/11/2026"
const fecha = (texto) => texto.slice(0, 10).split('-').reverse().join('/');
const textoValor = (p, valor) => {
  if (valor === '') return 'vacío';
  return p.unidad ? `${valor} ${p.unidad}` : String(valor);
};

// Los datos de contacto (TEXTO): el teclado y la validación del navegador según el formato.
const TIPO_DE_TEXTO = { TELEFONO: 'tel', EMAIL: 'email', URL: 'url' };

function entrada(p, id) {
  if (p.tipo === 'HORA') {
    return el('input', '', { id, name: p.clave, type: 'time', min: p.minimo, max: p.maximo, required: '' });
  }
  if (p.tipo === 'TEXTO') {
    const input = el('input', '', { id, name: p.clave, type: TIPO_DE_TEXTO[p.formato] ?? 'text', maxlength: String(p.maximo) });
    if (p.minimo > 0) input.required = true;
    if (p.formato === 'TELEFONO') input.autocomplete = 'tel';
    return input;
  }
  return el('input', '', { id, name: p.clave, type: 'number', min: String(p.minimo), max: String(p.maximo), step: '1', inputmode: 'numeric', required: '' });
}

// "Entre 1 y 30 días. Por defecto: 7 días." (los TEXTO no tienen rango: solo el valor por defecto).
function textoAyuda(p) {
  if (p.tipo === 'TEXTO') {
    return p.defecto === '' ? p.ayuda : `${p.ayuda} Por defecto: ${p.defecto}.`;
  }
  return `${p.ayuda} Entre ${p.minimo} y ${textoValor(p, p.maximo)}. Por defecto: ${textoValor(p, p.defecto)}.`;
}

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
  const input = entrada(p, id);
  if (p.tipo === 'TEXTO') caja.classList.add('parametro-texto');
  input.value = String(p.valor);
  input.setAttribute('aria-describedby', `ayuda-${p.clave} error-${p.clave}`);
  fila.append(input);
  if (p.unidad) fila.append(el('span', p.unidad, { class: 'unidad' }));

  const ayuda = el('p', textoAyuda(p), {
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

// Una pestaña y un panel por grupo, en el orden en que vienen de la API.
function pintar() {
  const lista = el('div', '', { class: 'pestanas', role: 'tablist', 'aria-label': 'Qué querés configurar' });
  const paneles = new Map();
  for (const p of parametros) {
    const vista = vistaDe(p.grupo);
    if (!paneles.has(vista)) {
      lista.append(el('button', p.nombre_grupo, {
        type: 'button', role: 'tab', id: 'tab-' + vista, 'aria-controls': 'panel-' + vista,
        'aria-selected': 'false', tabindex: '-1', 'data-vista': vista,
      }));
      const fieldset = el('fieldset', '', { class: 'grupo-parametros', id: 'panel-' + vista, role: 'tabpanel', 'aria-labelledby': 'tab-' + vista, hidden: '' });
      fieldset.append(el('legend', p.nombre_grupo, { class: 'solo-lectores' }));
      paneles.set(vista, fieldset);
    }
    paneles.get(vista).append(campo(p));
  }
  $('grupos').replaceChildren(lista, ...paneles.values());
  parametros.forEach(actualizarBotonDefecto);

  if (!paneles.has(vistaActual)) vistaActual = paneles.keys().next().value;
  elegirPestana = activarPestanas(lista, alCambiarPestana);
  elegirPestana(vistaActual);
}

// Al elegir otra pestaña: si en la que se deja quedaron cambios sin guardar, se pregunta. "Volver"
// vuelve a esa pestaña; "Descartar" deja los campos como están guardados.
async function alCambiarPestana(vista) {
  if (vista === vistaActual) { recordar(vista); return; }
  const anterior = vistaActual;
  const pendientes = deLaPestana(anterior).filter(cambio);
  if (pendientes.length > 0) {
    const nombre = parametros.find((p) => vistaDe(p.grupo) === anterior).nombre_grupo;
    const descartar = await confirmar(`Cambiaste valores en "${nombre}" y no los guardaste. ¿Los descartás?`, { aceptar: 'Descartar cambios' });
    if (!descartar) { elegirPestana(anterior); return; }
  }
  vistaActual = vista;
  limpiarErrores(form);
  guardado.hidden = true;
  if (pendientes.length > 0) pintar();   // vuelve los campos a lo guardado (y abre la pestaña nueva)
  else recordar(vista);
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

  // Solo la pestaña abierta.
  const valores = Object.fromEntries(deLaPestana(vistaActual).filter(cambio).map((p) => [p.clave, valorDelCampo(p)]));
  if (Object.keys(valores).length === 0) {
    guardado.textContent = 'No cambiaste ningún valor en esta pestaña.';
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

// Vuelve los campos a lo que está guardado (las otras pestañas no tienen cambios: no se puede salir
// de una sin guardar o descartar).
$('descartar').addEventListener('click', () => {
  limpiarErrores(form);
  guardado.hidden = true;
  pintar();
});

// Un enlace a otra pestaña estando ya en la pantalla (configuracion.html#tienda) solo cambia el "#".
window.addEventListener('hashchange', () => {
  const vista = location.hash.slice(1);
  if (vista && vista !== vistaActual) elegirPestana(vista);
});

cargar();
