/**
 * consulta.js — Ficha de la consulta del veterinario (panel/consulta.html)
 *
 * Se abre con ?id=<consulta>, o con ?turno=<turno> para iniciar la atención de ese turno.
 * Contrato: docs/api/contrato-consultas.md del repo Pacientes.
 *
 * 25/11: el turno puede tener varios motivos (consulta.motivos) y cada vacuna o desparasitación dice
 * qué se da (consulta.eventos_sanitarios). La consulta tiene que llevar cada dosis en los insumos para finalizar, y si no hay stock se carga acá
 * mismo (POST /api/inventario/insumos/{id}/stock), sin salir de la consulta. Lo mismo con cualquier
 * insumo o producto que falte al finalizar.
 *
 * Seguridad: la guardia de acceso es solo comodidad de interfaz; la autorización real
 * la hace el backend. Todo texto que viene de la API se inserta con textContent (el() lo hace).
 */

import { api } from './api.js';
import { exigirRol } from './auth.js';
import { confirmar, el, limpiarErrores, mostrarErrores } from './ui.js';
import { textoEstadoConsulta, textoEstadoFactura, textoMotivos } from './etiquetas.js';

await exigirRol('VETERINARIO');

const API = '/api/pacientes';
const params = new URLSearchParams(location.search);

// "Volver": a la agenda, salvo que se haya llegado desde los movimientos de productos o de insumos
// ("Usado en una consulta"): entonces vuelve ahí, con los mismos filtros.
const VUELTAS = {
  '/panel/productos-movimientos.html': '← Volver a movimientos',
  '/panel/insumo-movimientos.html': '← Volver a movimientos',
};
try {
  const anterior = new URL(document.referrer);
  const texto = anterior.origin === location.origin ? VUELTAS[anterior.pathname] : null;
  if (texto) {
    const volver = document.getElementById('volver');
    volver.href = anterior.pathname + anterior.search;
    volver.textContent = texto;
  }
} catch {
  // Sin página anterior (se abrió el enlace directo): queda "Volver a la agenda".
}

const estado = document.getElementById('estado');
const ficha = document.getElementById('ficha');
const form = document.getElementById('form-consulta');
const botonFinalizar = document.getElementById('finalizar');

// Los dos tipos de ítem comparten pantalla y lógica; cambian las rutas y los campos.
const TIPOS = {
  insumos: { campoId: 'insumo_id', campoPrecio: 'costo_unitario', origen: '/api/inventario/insumos', singular: 'insumo' },
  productos: { campoId: 'producto_id', campoPrecio: 'precio_unitario', origen: '/api/inventario/productos', singular: 'producto' }
};

// Consulta actual, tal como la devolvió el servidor por última vez.
let consulta = null;

// Ítems que Inventario informó como dados de baja al intentar finalizar ("insumos:103").
const bajas = new Set();

// Los importes se calculan en centavos enteros para evitar errores de decimales.
const aCentavos = (v) => Math.round(Number(v || 0) * 100);
const dinero = (c) => '$' + (c / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// La API puede devolver la consulta sola o dentro de { consulta }.
const desenvolver = (r) => r.consulta ?? r;
const cerrada = () => consulta.estado === 'FINALIZADA';

// Máximo que entra en una factura. La regla la aplica el backend: acá solo sirve para explicar el error.
const TOTAL_MAXIMO_CENTAVOS = 9999999999;

// Muestra un mensaje al lado del botón que lo provocó: la página es larga y un mensaje arriba de todo
// quedaría fuera de la pantalla. Con texto vacío lo oculta.
function avisar(id, texto, tipo = 'error') {
  const caja = document.getElementById(id);
  caja.textContent = texto;
  caja.className = tipo ? 'mensaje mensaje-' + tipo : 'mensaje';
  caja.hidden = texto === '';
  if (texto !== '') caja.scrollIntoView({ block: 'nearest' });   // por si el botón estaba al borde de la pantalla
}

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
  // El valor sale del precio que guardó el turno al sacarse (con el descuento de su franja): no se edita.
  document.getElementById('ayuda-valor-base').textContent = consulta.descuento
    ? `Es el precio del turno con el ${consulta.descuento} % de descuento de su franja (sin descuento: ${dinero(aCentavos(consulta.precio_lista))}). No se cambia.`
    : 'Es el precio del turno (Configuración → Precio de la consulta): no se cambia.';

  const bloqueada = cerrada();
  for (const campo of ['diagnostico', 'observaciones']) {
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
  pintarCalendario();
}

function filaItem(tipo, cfg, it) {
  const unitario = aCentavos(it[cfg.campoPrecio]);
  const tr = el('tr');
  const nombre = el('td', it.nombre);
  if (bajas.has(`${tipo}:${it[cfg.campoId]}`)) {
    nombre.append(' ', el('span', 'Dado de baja', { class: 'marca-baja' }));
  }
  tr.append(
    nombre,
    el('td', it.cantidad),
    el('td', dinero(unitario)),
    el('td', dinero(unitario * it.cantidad))
  );

  // La caja con display:flex va adentro de la celda (una celda flex se sale de la tabla).
  const acciones = el('div', '', { class: 'acciones' });
  if (!cerrada()) {
    const quitar = el('button', 'Quitar', {
      type: 'button', class: 'boton boton-peligro boton-chico', 'aria-label': 'Quitar ' + it.nombre
    });
    quitar.addEventListener('click', async () => {
      quitar.disabled = true;
      try {
        consulta = desenvolver(await api(`${API}/consultas/${consulta.id}/${tipo}/${it.id}`, { metodo: 'DELETE' }));
        avisar('mensaje-' + tipo, '');
        avisar('mensaje-finalizar', '');
        pintarItems();
      } catch (e) {
        avisar('mensaje-' + tipo, e.datos?.error ?? 'No se pudo quitar el ítem.');
        quitar.disabled = false;
      }
    });
    acciones.append(quitar);
  }
  const celda = el('td');
  celda.append(acciones);
  tr.append(celda);
  return tr;
}

// Total en vivo: usa los ítems de la consulta y el valor base que está escrito en el formulario.
let totalActual = 0;
function pintarTotales() {
  const suma = (tipo) => (consulta[tipo] ?? [])
    .reduce((acc, it) => acc + aCentavos(it[TIPOS[tipo].campoPrecio]) * it.cantidad, 0);

  const base = aCentavos(form.elements.valor_base.value);
  const insumos = suma('insumos');
  const productos = suma('productos');
  totalActual = base + insumos + productos;

  document.getElementById('r-base').textContent = dinero(base);
  document.getElementById('r-insumos').textContent = dinero(insumos);
  document.getElementById('r-productos').textContent = dinero(productos);
  document.getElementById('r-total').textContent = dinero(totalActual);
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
      // Se vuelve a llamar después de cargar stock: se arma de cero, sin perder la elegida.
      const elegida = select.value;
      select.replaceChildren(select.options[0], ...activos.map((x) => el('option', `${x.nombre} (stock: ${x.stock})`, { value: x.id })));
      select.value = elegida;
    } catch {
      select.disabled = true;
      estado.textContent = 'No se pudo cargar el listado de ' + tipo + '.';
    }
  }
}

/* ------------------------------------------------------------------ */
/* Vacuna o desparasitación del calendario y carga de stock (25/11)    */
/* ------------------------------------------------------------------ */

// Un formulario chico para cargar stock de un insumo o producto sin salir de la consulta.
// Al cargarlo, se vuelve a pedir la consulta (trae el stock nuevo) y las listas de insumos y productos.
function formCargarStock(tipo, id, nombre, sugerida, idMensaje) {
  const form = el('form', '', { class: 'form-stock', novalidate: '' });
  const cantidad = el('input', '', { type: 'number', min: '1', step: '1', 'aria-label': `Cantidad a cargar de ${nombre}` });
  cantidad.value = String(Math.max(1, sugerida));
  const boton = el('button', 'Cargar stock', { type: 'submit', class: 'boton boton-chico', 'aria-label': `Cargar stock de ${nombre}` });
  form.append(cantidad, boton);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const n = Number(cantidad.value);
    if (!Number.isInteger(n) || n < 1) {
      avisar(idMensaje, 'La cantidad tiene que ser un número entero mayor a 0.');
      return;
    }
    boton.disabled = true;
    try {
      const r = await api(`/api/inventario/${tipo}/${id}/stock`, { metodo: 'POST', cuerpo: { cantidad: n } });
      consulta = desenvolver(await api(`${API}/consultas/${consulta.id}`));
      document.getElementById('cargar-faltantes').replaceChildren();
      pintarItems();
      await cargarCatalogos();
      avisar(idMensaje, `Stock cargado: ${nombre} tiene ${r.stock} ahora.`, 'ok');
    } catch (e) {
      avisar(idMensaje, e.datos?.error ?? 'No se pudo cargar el stock.');
      boton.disabled = false;
    }
  });
  return form;
}

// Qué se da en esta consulta (una o varias vacunas o desparasitaciones) y si cada dosis ya está en los
// insumos. Si no está, cada insumo que sirve (los de esa aplicación) con su stock: "Agregar 1" y, si no
// hay stock, "Cargar stock".
function pintarCalendario() {
  const eventos = consulta.eventos_sanitarios ?? [];
  const bloque = document.getElementById('bloque-calendario');
  bloque.hidden = eventos.length === 0;
  document.getElementById('motivos-consulta').textContent = textoMotivos(consulta);
  if (eventos.length === 0) return;

  const texto = document.getElementById('texto-calendario');
  const lista = document.getElementById('insumos-calendario');
  lista.replaceChildren();
  const nombres = eventos.map((e) => e.nombre).join(', ');

  if (cerrada()) {
    texto.textContent = `Se dio: ${nombres}. Quedó registrado en el calendario de la mascota.`;
    return;
  }
  texto.textContent = `Esta consulta es para: ${nombres}. Cada dosis tiene que estar en los insumos; al finalizar, queda dada en el calendario.`;

  for (const evento of eventos) {
    const caja = el('div', '', { class: 'bloque-dosis' });
    const cargado = (consulta.insumos ?? []).find((i) => i.aplicacion && i.aplicacion === evento.aplicacion);
    if (cargado) {
      caja.append(el('p', `${evento.nombre}: cargada (${cargado.nombre}).`, { class: 'mensaje mensaje-ok' }));
      if (cargado.stock !== undefined && cargado.stock < cargado.cantidad) {
        caja.append(el('p', `No alcanza el stock de ${cargado.nombre}: hay ${cargado.stock}.`),
          formCargarStock('insumos', cargado.insumo_id, cargado.nombre, cargado.cantidad - cargado.stock, 'mensaje-calendario'));
      }
      lista.append(caja);
      continue;
    }

    caja.append(el('p', `${evento.nombre}: falta cargar la dosis.`, { class: 'mensaje mensaje-error' }));
    if (evento.insumos.length === 0) {
      caja.append(el('p', 'No hay ningún insumo activo para darla: dalo de alta (o reactivalo) en Insumos.'));
    }
    for (const insumo of evento.insumos) {
      const fila = el('div', '', { class: 'acciones' });
      fila.append(el('span', `${insumo.nombre} · stock: ${insumo.stock}`));
      if (insumo.stock > 0) {
        const agregar = el('button', 'Agregar 1 a la consulta', { type: 'button', class: 'boton boton-chico', 'aria-label': `Agregar ${insumo.nombre} a la consulta` });
        agregar.addEventListener('click', async () => {
          agregar.disabled = true;
          try {
            consulta = desenvolver(await api(`${API}/consultas/${consulta.id}/insumos`, { metodo: 'POST', cuerpo: { insumo_id: insumo.id, cantidad: 1 } }));
            avisar('mensaje-calendario', '');
            avisar('mensaje-finalizar', '');
            pintarItems();
          } catch (e) {
            avisar('mensaje-calendario', e.datos?.error ?? 'No se pudo agregar el insumo.');
            agregar.disabled = false;
          }
        });
        fila.append(agregar);
      } else {
        fila.append(el('span', 'Sin stock', { class: 'insignia insignia-falta' }), formCargarStock('insumos', insumo.id, insumo.nombre, 1, 'mensaje-calendario'));
      }
      caja.append(fila);
    }
    lista.append(caja);
  }
}

/* ------------------------------------------------------------------ */
/* Agregar ítems                                                       */
/* ------------------------------------------------------------------ */

for (const [tipo, cfg] of Object.entries(TIPOS)) {
  const formItem = document.getElementById('agregar-' + tipo);

  formItem.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!formItem.elements.namedItem('item').value) {
      avisar('mensaje-' + tipo, `Elegí un ${cfg.singular} de la lista.`);
      return;
    }
    const boton = formItem.querySelector('button[type="submit"]');
    boton.disabled = true;                          // evita ítems duplicados por doble clic
    try {
      const cuerpo = {
        [cfg.campoId]: Number(formItem.elements.namedItem('item').value),   // namedItem: "item" a secas es la función item() de la colección, no el <select>
        cantidad: Number(formItem.elements.cantidad.value)
      };
      consulta = desenvolver(await api(`${API}/consultas/${consulta.id}/${tipo}`, { metodo: 'POST', cuerpo }));
      formItem.reset();
      avisar('mensaje-' + tipo, '');
      avisar('mensaje-finalizar', '');
      pintarItems();
    } catch (e) {
      const campos = Object.values(e.datos?.campos ?? {});
      avisar('mensaje-' + tipo, campos.length
        ? campos.join(' ')
        : (e.datos?.error ?? 'No se pudo agregar el ítem.'));
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
  // El valor de la consulta no se manda: sale del precio del turno.
  const cuerpo = {
    diagnostico: form.elements.diagnostico.value,
    observaciones: form.elements.observaciones.value
  };
  consulta = desenvolver(await api(`${API}/consultas/${consulta.id}`, { metodo: 'PUT', cuerpo }));
}

// Si se sigue escribiendo, lo que está en pantalla ya no es lo guardado.
form.addEventListener('input', () => avisar('mensaje-guardar', ''));

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const boton = document.getElementById('guardar');
  boton.disabled = true;
  avisar('mensaje-guardar', '');
  try {
    await guardar();
    avisar('mensaje-guardar', 'Cambios guardados.', 'ok');
  } catch (e) {
    mostrarErrores(form, e.datos?.campos, e.datos?.error ?? 'No se pudieron guardar los cambios.');
    document.getElementById('error-general').scrollIntoView({ block: 'nearest' });
  } finally {
    boton.disabled = false;
  }
});

/* ------------------------------------------------------------------ */
/* Finalizar la consulta                                               */
/* ------------------------------------------------------------------ */

botonFinalizar.addEventListener('click', async () => {
  const seguir = await confirmar('¿Finalizar la consulta? Se genera la factura y se descuenta el stock. No se puede deshacer.', { aceptar: 'Finalizar' });
  if (!seguir) return;

  botonFinalizar.disabled = true;                   // un segundo clic no manda otro pedido
  avisar('mensaje-finalizar', 'Finalizando…', null);
  bajas.clear();
  try {
    await guardar();                                // el backend valida lo guardado, no lo escrito en pantalla
    const r = await api(`${API}/consultas/${consulta.id}/finalizar`, { metodo: 'POST' });
    consulta = { ...consulta, ...desenvolver(r) };
    pintarDatos();
    pintarItems();
    mostrarFactura(r.factura);
    avisar('mensaje-finalizar', '');
  } catch (e) {
    if (e.estado === 400) mostrarErrores(form, e.datos?.campos ?? {});   // además, el error debajo de cada campo
    if (e.datos?.motivo === 'DADO_DE_BAJA') {
      for (const i of e.datos.items ?? []) bajas.add(`${i.tipo === 'INSUMO' ? 'insumos' : 'productos'}:${i.id}`);
    }
    pintarItems();
    avisar('mensaje-finalizar', mensajeFinalizar(e));
    pintarFaltantes(e);
  } finally {
    botonFinalizar.disabled = false;
  }
});

// 409 de stock: un "Cargar stock" por cada insumo o producto que no alcanza, ahí mismo.
function pintarFaltantes(e) {
  const caja = document.getElementById('cargar-faltantes');
  caja.replaceChildren();
  if (!(e.estado === 409 && !e.datos?.motivo && Array.isArray(e.datos?.items))) return;
  for (const i of e.datos.items) {
    const esInsumo = i.tipo === 'INSUMO';
    const campo = esInsumo ? 'insumo_id' : 'producto_id';
    const item = (consulta[esInsumo ? 'insumos' : 'productos'] ?? []).find((x) => x[campo] === i.id);
    const faltan = item ? item.cantidad - (i.stock ?? 0) : 1;
    const fila = el('div', '', { class: 'acciones' });
    fila.append(el('span', `${nombreItem(i)}: hay ${i.stock ?? 0}`), formCargarStock(esInsumo ? 'insumos' : 'productos', i.id, nombreItem(i), faltan, 'mensaje-finalizar'));
    caja.append(fila);
  }
}

// Traduce el error de "finalizar" a un mensaje; en el 409 de stock indica qué falta.
function mensajeFinalizar(e) {
  if (e.estado === 409 && e.datos?.motivo === 'DADO_DE_BAJA') {
    const bajas = (e.datos.items ?? []).map((i) => nombreItem(i));
    return 'Estos ítems están dados de baja: ' + bajas.join(', ') + '. Quitalos de la consulta para poder finalizar.';
  }
  // Un intento anterior ya descontó otra cantidad de esos ítems: hay que volver a esa cantidad.
  if (e.estado === 409 && e.datos?.motivo === 'OPERACION_DISTINTA') {
    const items = (e.datos.items ?? []).map((i) => `${nombreItem(i)} (ya se descontaron ${i.cantidad_aplicada})`);
    return 'Un intento anterior de finalizar ya descontó del stock otra cantidad de: ' + items.join(', ')
      + '. Volvé a dejar esa cantidad y finalizá de nuevo.';
  }
  if (e.estado === 409 && Array.isArray(e.datos?.items)) {
    const faltan = e.datos.items.map((i) => `${nombreItem(i)} (stock disponible: ${i.stock})`);
    return 'No hay stock suficiente de: ' + faltan.join(', ') + '.';
  }
  if (e.estado === 400) {
    const campos = Object.values(e.datos?.campos ?? {});
    const detalle = (campos.length ? campos.join(' ') : (e.datos?.error ?? 'Revisá los datos de la consulta.')).replace(/\.?$/, '.');
    const ayuda = totalActual > TOTAL_MAXIMO_CENTAVOS
      ? ' El total es la suma del valor base, los insumos y los productos: bajá el valor base o quitá ítems.'
      : '';
    return 'No se pudo finalizar. ' + detalle + ayuda;
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
  p.textContent = `Factura ${f.numero} · ${textoEstadoFactura(f.estado)} · `;
  p.append(el('a', 'Ver factura', { href: '/cliente/factura.html?consulta=' + consulta.id }));
  p.hidden = false;
  enlaceAdopcion();
}

// Chequeo de adopción (Entrega 5, rol 3): ya atendido, lo que sigue es completar la adopción, que la
// veterinaria decide en el panel de adopciones (no se completa sola: el chequeo puede salir mal).
// Solo si la adopción de este chequeo sigue en curso: completada o cancelada, no queda nada por hacer.
async function enlaceAdopcion() {
  if (consulta.motivo !== 'CHEQUEO_ADOPCION' || document.getElementById('ir-adopcion')) return;
  let enCurso = false;
  try {
    // Sin estado, la API devuelve las que no terminaron (hasta 100: alcanza de sobra).
    const { adopciones } = await api('/api/adopciones?por_pagina=100');
    enCurso = adopciones.some((a) => a.turno_chequeo?.id === consulta.turno_id);
  } catch {
    return; // sin el botón, la veterinaria igual llega desde el panel de adopciones
  }
  if (!enCurso || document.getElementById('ir-adopcion')) return;
  const p = el('p', '', { id: 'ir-adopcion' });
  p.append(el('a', 'Ir a completar la adopción', { href: '/panel/adopciones.html#en-curso', class: 'boton' }));
  document.getElementById('factura').after(p);
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