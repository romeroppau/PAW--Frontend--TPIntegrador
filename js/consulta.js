/**
 * consulta.js — Ficha de la consulta del veterinario (panel/consulta.html)
 *
 * Se abre con ?id=<consulta>, o con ?turno=<turno> para iniciar la atención de ese turno.
 * Contrato: docs/api/contrato-consultas.md del repo Pacientes.
 *
 * Seguridad: la guardia de acceso es solo comodidad de interfaz; la autorización real
 * la hace el backend. Todo texto que viene de la API se inserta con textContent (el() lo hace).
 */

import { api } from './api.js';
import { exigirRol } from './auth.js';
import { el, limpiarErrores, mostrarErrores } from './ui.js';
import { textoEstadoConsulta, textoEstadoFactura } from './etiquetas.js';

await exigirRol('VETERINARIO');

const API = '/api/pacientes';
const params = new URLSearchParams(location.search);

const estado = document.getElementById('estado');
const ficha = document.getElementById('ficha');
const form = document.getElementById('form-consulta');
const botonFinalizar = document.getElementById('finalizar');

// Los dos tipos de ítem comparten pantalla y lógica; cambian las rutas y los campos.
const TIPOS = {
  insumos: { campoId: 'insumo_id', campoPrecio: 'costo_unitario', origen: '/api/inventario/insumos' },
  productos: { campoId: 'producto_id', campoPrecio: 'precio_unitario', origen: '/api/inventario/productos' }
};

// Consulta actual, tal como la devolvió el servidor por última vez.
let consulta = null;

// Los importes se calculan en centavos enteros para evitar errores de decimales.
const aCentavos = (v) => Math.round(Number(v || 0) * 100);
const dinero = (c) => '$' + (c / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// La API puede devolver la consulta sola o dentro de { consulta }.
const desenvolver = (r) => r.consulta ?? r;
const cerrada = () => consulta.estado === 'FINALIZADA';

/* ------------------------------------------------------------------ */
/* Carga inicial                                                       */
/* ------------------------------------------------------------------ */

async function iniciar() {
  estado.textContent = 'Cargando…';
  try {
    let id = params.get('id');
    const turno = params.get('turno');

    // Con ?turno= se inicia la atención y se deja la URL con el id de la consulta,
    // para que recargar la página no vuelva a intentar iniciarla.
    if (!id && turno) {
      const r = await api(`${API}/turnos/${encodeURIComponent(turno)}/atencion`, { metodo: 'POST' });
      id = desenvolver(r).id;
      history.replaceState(null, '', '?id=' + encodeURIComponent(id));
    }

    if (!id) {
      estado.textContent = 'Falta indicar la consulta.';
      return;
    }
    consulta = desenvolver(await api(`${API}/consultas/${encodeURIComponent(id)}`));
  } catch (e) {
    estado.textContent = e.estado === 404
      ? 'No se encontró la consulta.'
      : (e.datos?.error ?? 'No se pudo cargar la consulta.');
    return;
  }

  ficha.hidden = false;
  estado.textContent = '';
  pintarDatos();
  pintarItems();
  await cargarCatalogos();
  if (cerrada()) await cargarFactura();
}

/* ------------------------------------------------------------------ */
/* Dibujo de la pantalla                                               */
/* ------------------------------------------------------------------ */

// Diagnóstico, observaciones, valor base y bloqueo de la pantalla si la consulta ya se finalizó.
function pintarDatos() {
  document.getElementById('estado-consulta').textContent = textoEstadoConsulta(consulta.estado);
  form.elements.diagnostico.value = consulta.diagnostico ?? '';
  form.elements.observaciones.value = consulta.observaciones ?? '';
  form.elements.valor_base.value = consulta.valor_base ?? '';

  const bloqueada = cerrada();
  for (const campo of ['diagnostico', 'observaciones', 'valor_base']) {
    form.elements[campo].disabled = bloqueada;
  }
  document.getElementById('guardar').hidden = bloqueada;
  botonFinalizar.hidden = bloqueada;
  for (const tipo of Object.keys(TIPOS)) {
    document.getElementById('agregar-' + tipo).hidden = bloqueada;
  }
}

// Tablas de insumos y productos, y el resumen de importes.
function pintarItems() {
  for (const [tipo, cfg] of Object.entries(TIPOS)) {
    const items = consulta[tipo] ?? [];
    document.getElementById('filas-' + tipo).replaceChildren(...items.map((it) => filaItem(tipo, cfg, it)));
    document.getElementById('vacio-' + tipo).hidden = items.length > 0;
  }
  pintarTotales();
}

function filaItem(tipo, cfg, it) {
  const unitario = aCentavos(it[cfg.campoPrecio]);
  const tr = el('tr');
  tr.append(
    el('td', it.nombre),
    el('td', it.cantidad),
    el('td', dinero(unitario)),
    el('td', dinero(unitario * it.cantidad))
  );

  const acciones = el('td', '', { class: 'acciones' });
  if (!cerrada()) {
    const quitar = el('button', 'Quitar', {
      type: 'button', class: 'boton boton-peligro boton-chico', 'aria-label': 'Quitar ' + it.nombre
    });
    quitar.addEventListener('click', async () => {
      quitar.disabled = true;
      try {
        consulta = desenvolver(await api(`${API}/consultas/${consulta.id}/${tipo}/${it.id}`, { metodo: 'DELETE' }));
        estado.textContent = '';
        pintarItems();
      } catch (e) {
        estado.textContent = e.datos?.error ?? 'No se pudo quitar el ítem.';
        quitar.disabled = false;
      }
    });
    acciones.append(quitar);
  }
  tr.append(acciones);
  return tr;
}

// Total en vivo: usa los ítems de la consulta y el valor base que está escrito en el formulario.
function pintarTotales() {
  const suma = (tipo) => (consulta[tipo] ?? [])
    .reduce((acc, it) => acc + aCentavos(it[TIPOS[tipo].campoPrecio]) * it.cantidad, 0);

  const base = aCentavos(form.elements.valor_base.value);
  const insumos = suma('insumos');
  const productos = suma('productos');

  document.getElementById('r-base').textContent = dinero(base);
  document.getElementById('r-insumos').textContent = dinero(insumos);
  document.getElementById('r-productos').textContent = dinero(productos);
  document.getElementById('r-total').textContent = dinero(base + insumos + productos);
}

form.elements.valor_base.addEventListener('input', pintarTotales);

/* ------------------------------------------------------------------ */
/* Catálogos para elegir insumos y productos                           */
/* ------------------------------------------------------------------ */

async function cargarCatalogos() {
  if (cerrada()) return;

  for (const [tipo, cfg] of Object.entries(TIPOS)) {
    const select = document.getElementById('sel-' + tipo);
    try {
      const r = await api(cfg.origen);
      const activos = (r.datos ?? r.insumos ?? r.productos ?? [])
        .filter((x) => x.activo === undefined || x.activo);
      select.append(...activos.map((x) => el('option', `${x.nombre} (stock: ${x.stock})`, { value: x.id })));
    } catch {
      select.disabled = true;
      estado.textContent = 'No se pudo cargar el listado de ' + tipo + '.';
    }
  }
}

/* ------------------------------------------------------------------ */
/* Agregar ítems                                                       */
/* ------------------------------------------------------------------ */

for (const [tipo, cfg] of Object.entries(TIPOS)) {
  const formItem = document.getElementById('agregar-' + tipo);

  formItem.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const boton = formItem.querySelector('button[type="submit"]');
    boton.disabled = true;                          // evita ítems duplicados por doble clic
    try {
      const cuerpo = {
        [cfg.campoId]: Number(formItem.elements.namedItem('item').value),   // namedItem: "item" a secas es la función item() de la colección, no el <select>
        cantidad: Number(formItem.elements.cantidad.value)
      };
      consulta = desenvolver(await api(`${API}/consultas/${consulta.id}/${tipo}`, { metodo: 'POST', cuerpo }));
      formItem.reset();
      estado.textContent = '';
      pintarItems();
    } catch (e) {
      const campos = Object.values(e.datos?.campos ?? {});
      estado.textContent = campos.length
        ? campos.join(' ')
        : (e.datos?.error ?? 'No se pudo agregar el ítem.');
    } finally {
      boton.disabled = false;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Guardar diagnóstico, observaciones y valor base                     */
/* ------------------------------------------------------------------ */

// PUT con lo que hay en el formulario. Lo usan "Guardar cambios" y "Finalizar consulta".
async function guardar() {
  limpiarErrores(form);
  const valor = form.elements.valor_base.value;
  const cuerpo = {
    diagnostico: form.elements.diagnostico.value,
    observaciones: form.elements.observaciones.value,
    valor_base: valor === '' ? null : Number(valor)
  };
  consulta = desenvolver(await api(`${API}/consultas/${consulta.id}`, { metodo: 'PUT', cuerpo }));
}

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const boton = document.getElementById('guardar');
  boton.disabled = true;
  try {
    await guardar();
    estado.textContent = 'Cambios guardados.';
  } catch (e) {
    mostrarErrores(form, e.datos?.campos, e.datos?.error ?? 'No se pudieron guardar los cambios.');
  } finally {
    boton.disabled = false;
  }
});

/* ------------------------------------------------------------------ */
/* Finalizar la consulta                                               */
/* ------------------------------------------------------------------ */

botonFinalizar.addEventListener('click', async () => {
  if (!confirm('¿Finalizar la consulta? Se genera la factura y se descuenta el stock. No se puede deshacer.')) return;

  botonFinalizar.disabled = true;                   // un segundo clic no manda otro pedido
  estado.textContent = 'Finalizando…';
  try {
    await guardar();                                // el backend valida lo guardado, no lo escrito en pantalla
    const r = await api(`${API}/consultas/${consulta.id}/finalizar`, { metodo: 'POST' });
    consulta = { ...consulta, ...desenvolver(r) };
    pintarDatos();
    pintarItems();
    mostrarFactura(r.factura);
    estado.textContent = 'Consulta finalizada.';
  } catch (e) {
    if (e.estado === 400 && e.datos?.campos) {
      mostrarErrores(form, e.datos.campos, e.datos.error ?? 'Revisá los datos de la consulta.');
      estado.textContent = '';
    } else {
      estado.textContent = mensajeFinalizar(e);
    }
  } finally {
    botonFinalizar.disabled = false;
  }
});

// Traduce el error de "finalizar" a un mensaje; en el 409 de stock indica qué falta.
function mensajeFinalizar(e) {
  if (e.estado === 409 && e.datos?.motivo === 'DADO_DE_BAJA') {
    const bajas = (e.datos.items ?? []).map((i) => nombreItem(i));
    return 'Estos ítems están dados de baja: ' + bajas.join(', ') + '. Quitalos de la consulta para poder finalizar.';
  }
  if (e.estado === 409 && Array.isArray(e.datos?.items)) {
    const faltan = e.datos.items.map((i) => `${nombreItem(i)} (stock disponible: ${i.stock})`);
    return 'No hay stock suficiente de: ' + faltan.join(', ') + '.';
  }
  if (e.estado === 502) {
    return 'Inventario no responde. La consulta sigue abierta: probá de nuevo en un momento.';
  }
  return e.datos?.error ?? 'No se pudo finalizar la consulta.';
}

// Nombre de un ítem que devolvió Inventario ({ tipo, id }), buscado entre los de la consulta.
function nombreItem(i) {
  const esInsumo = i.tipo === 'INSUMO';
  const campo = esInsumo ? 'insumo_id' : 'producto_id';
  const lista = consulta[esInsumo ? 'insumos' : 'productos'] ?? [];
  return lista.find((x) => x[campo] === i.id)?.nombre ?? `${i.tipo} ${i.id}`;
}

function mostrarFactura(f) {
  if (!f) return;
  const p = document.getElementById('factura');
  p.textContent = `Factura ${f.numero} · ${textoEstadoFactura(f.estado)}`;
  p.hidden = false;
}

// Consulta ya finalizada al abrir la página: se muestra su factura.
async function cargarFactura() {
  try {
    const r = await api(`${API}/consultas/${consulta.id}/factura`);
    mostrarFactura(r.factura ?? r);
  } catch {
    estado.textContent = 'No se pudo cargar la factura.';
  }
}

iniciar();