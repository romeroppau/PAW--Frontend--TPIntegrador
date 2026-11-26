/**
 * insumos.js — Panel del veterinario: insumos (rol 2, Entrega 4)
 *
 * Un solo archivo para las tres pantallas. Cada HTML indica cuál es con data-pagina en el <body>:
 *   panel/insumos.html              data-pagina="listado"      -> listado()
 *   panel/insumo-form.html          data-pagina="formulario"   -> formulario()
 *   panel/insumo-movimientos.html   data-pagina="movimientos"  -> movimientos()
 *
 * Contrato de la API: docs/api/contrato-insumos.md (repo Inventario).
 * Seguridad: la guardia de acceso es solo comodidad de interfaz; la autorización real la hace
 * el backend (401 sin sesión, 403 si no es veterinario o si falta el token CSRF).
 * Todo texto que viene de la API se inserta con el() (textContent), nunca con innerHTML (evita XSS).
 */
import { api } from './api.js';                              // fetch común (cookie, CSRF, timeout)
import { exigirRol } from './auth.js';                       // guardia compartida
import { confirmar, el, limpiarErrores, mostrarErrores } from './ui.js'; // utilidades de interfaz
import { textoEstadoInsumo } from './etiquetas.js';          // "DISPONIBLE" -> "Disponible"
import { filtrarPorNombre, filtroStockBajo } from './buscar-lista.js'; // buscador y "solo stock bajo"
import { pantallaMovimientos } from './movimientos-inventario.js'; // pantalla de movimientos
import { filaDeLotes, leerCantidad, mensajeDeError } from './lotes.js'; // los lotes (26/11)
import { fecha } from './tienda.js';                       // "2027-10-25" -> "25/10/2027"

// Espera a confirmar que es veterinario (y a tener el token CSRF). Si no, redirige al login
// y el resto del archivo no corre.
await exigirRol('VETERINARIO');

const base = '/api/inventario/insumos';
const id = new URLSearchParams(location.search).get('id');  // ?id= del formulario y de movimientos
const estado = document.getElementById('estado');           // mensajes (role="status")

// $1.900,00 (pesos argentinos)
const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

// Se elige la función según la pantalla. Las funciones declaradas con "function" ya existen acá
// aunque estén escritas más abajo.
({ listado, formulario, movimientos })[document.body.dataset.pagina]();

/* ------------------------------------------------------------------ */
/* Pantalla: listado (panel/insumos.html)                              */
/* ------------------------------------------------------------------ */

// despues (opcional): qué mostrar al terminar de recargar: {texto} (un aviso arriba de la tabla) o
// {id, aviso} (vuelve a abrir los lotes de ese insumo, con el aviso de lo que se hizo).
async function listado(despues = null) {
  const filas = document.getElementById('filas');
  avisar('Cargando…', '');
  try {
    const respuesta = await api(base);                       // GET /api/inventario/insumos
    const { datos } = respuesta;
    const bajo = filtroStockBajo(respuesta);
    // El buscador filtra por nombre lo que ya se trajo; la casilla deja solo los de stock bajo.
    filtrarPorNombre(document.getElementById('buscar'), datos, (visibles, texto) => {
      abridores.clear();
      filas.replaceChildren(...visibles.map(fila));
      avisar(datos.length === 0 ? 'No hay insumos cargados.'
        : visibles.length > 0 ? ''
        : bajo.casilla?.checked ? (texto ? `Ningún insumo con stock bajo se llama "${texto}".` : 'Ningún insumo tiene stock bajo.')
        : `Ningún insumo se llama "${texto}".`, '');
    }, bajo);
    if (despues?.aviso) abridores.get(despues.id)?.({ aviso: despues.aviso });
    else if (despues?.texto) avisar(despues.texto, 'ok');
  } catch {
    avisar('No se pudo cargar el listado.', 'error');
  }
}

// El mensaje arriba de la tabla, con el estilo del sitio: tipo 'ok' (verde), 'error' (rojo) o '' (común).
function avisar(texto, tipo) {
  estado.textContent = texto;
  estado.className = tipo && texto ? `estado mensaje mensaje-${tipo}` : 'estado';
}

// Columnas de la tabla (para la fila de los lotes, que ocupa todo el ancho).
const COLUMNAS = 6;

// La función que abre los lotes de cada insumo de la tabla (para volver a abrirlos después de cargar).
const abridores = new Map();

// La fila <tr> de un insumo: sus datos, su estado con color y sus acciones. Si vence (26/11),
// "Lotes" agrega debajo la fila de sus lotes, como en Productos.
function fila(insumo) {
  const tr = el('tr', '', insumo.activo ? {} : { class: 'fila-baja' });
  const lotes = insumo.lotes ?? [];
  const vencidos = lotes.filter((l) => l.vencido && l.stock > 0);
  // El stock es el de todos los lotes; si hay vencidos, se dice cuánto se puede usar.
  const stock = el('td', insumo.stock);
  if (insumo.stock_sin_vencer !== undefined && insumo.stock_sin_vencer !== insumo.stock) {
    stock.append(el('span', `${insumo.stock_sin_vencer} sin vencer`, { class: 'ayuda' }));
  }
  const vence = el('td', insumo.vencimiento ? fecha(insumo.vencimiento) : insumo.vence === false ? 'No vence' : '—');
  if (vencidos.length) {
    const cuantas = vencidos.reduce((suma, l) => suma + l.stock, 0);
    vence.append(el('span', `${cuantas} vencida${cuantas === 1 ? '' : 's'}: retiralas`, { class: 'campo-error' }));
  }
  tr.append(
    el('td', insumo.nombre),
    stock,
    vence,
    el('td', pesos.format(insumo.costo)),
    celdaEstado(insumo)
  );
  const lotesDeI = insumo.vence ? filaDeLotes(tr, insumo, COLUMNAS, {
    base, que: 'insumo', alCambiar: (aviso) => listado({ id: insumo.id, aviso }),
  }) : null;
  if (lotesDeI) abridores.set(insumo.id, lotesDeI.abrir);

  // Cada acción lleva aria-label con el nombre, así el lector de pantalla distingue
  // "Editar Gasa" de "Editar Jeringa".
  // La caja con display:flex va adentro de la celda: si la celda misma fuera flex, dejaría de ser
  // celda de tabla y se saldría de la tabla.
  const acciones = el('div', '', { class: 'acciones' });
  acciones.append(
    el('a', 'Editar', { href: '/panel/insumo-form.html?id=' + insumo.id, 'aria-label': 'Editar ' + insumo.nombre }),
    el('a', 'Movimientos', { href: '/panel/insumo-movimientos.html?id=' + insumo.id, 'aria-label': 'Movimientos de ' + insumo.nombre })
  );

  // Cargar, retirar y dar de baja: solo para insumos activos.
  // El error de cargar o retirar va al final de la celda, en su propia línea (no adentro del
  // formulario), así los botones no se mueven cuando aparece. role="alert": se anuncia solo.
  // Un insumo dado de baja solo se puede reactivar.
  const error = el('span', '', { class: 'campo-error', role: 'alert' });
  if (insumo.activo) {
    acciones.append(formularioStock(insumo, error, lotesDeI));
    if (lotesDeI) acciones.append(lotesDeI.boton);
    // Con stock bajo se puede marcar que ya se pidió al proveedor (o desmarcarlo).
    if (insumo.stock_bajo) acciones.append(botonPedido(insumo, tr, error));
    acciones.append(botonBaja(insumo), error);
  } else {
    acciones.append(botonReactivar(insumo, error), error);
  }

  const celda = el('td');
  celda.append(acciones);
  tr.append(celda);
  return tr;
}

// Estado con color: rojo si está en falta, amarillo si tiene stock bajo, gris si está dado de baja.
// stock_bajo y estado los calcula la API (regla de Insumo::stockBajo() en el backend).
function celdaEstado(insumo) {
  if (!insumo.activo) {
    return el('td', 'De baja');
  }

  const td = el('td');
  if (insumo.estado === 'YA_PEDIDO') {
    // Ya se pidió al proveedor: el faltante está resuelto, se muestra aparte del "Stock bajo".
    td.append(el('span', textoEstadoInsumo(insumo.estado), { class: 'insignia insignia-pedido' }));
  } else if (insumo.estado === 'EN_FALTA') {
    td.append(el('span', textoEstadoInsumo(insumo.estado), { class: 'insignia insignia-falta' }));
  } else if (insumo.stock_bajo) {
    td.append(el('span', 'Stock bajo', { class: 'insignia insignia-bajo' }));
  } else {
    td.append(el('span', textoEstadoInsumo(insumo.estado), { class: 'insignia' }));
  }
  return td;
}

// Un casillero de cantidad y dos botones: Cargar (suma) y Retirar (resta sin consulta).
// error: el lugar de la fila donde se muestra un error (lo crea fila()). lotesDeI: los lotes, si vence
// (la carga es en un lote, que se elige en la fila de los lotes). novalidate: los errores se muestran
// con el estilo del sitio, no con el globo del navegador.
function formularioStock(insumo, error, lotesDeI) {
  const form = el('form', '', { class: 'form-stock', novalidate: '' });
  const cantidad = el('input', '', {
    type: 'number', min: '1', step: '1', inputmode: 'numeric',
    'aria-label': 'Cantidad de ' + insumo.nombre
  });
  form.append(
    cantidad,
    el('button', 'Cargar', { type: 'submit', value: 'stock', class: 'boton boton-borde boton-chico', 'aria-label': 'Cargar stock de ' + insumo.nombre }),
    el('button', 'Retirar', { type: 'submit', value: 'retiro', class: 'boton boton-borde boton-chico', 'aria-label': 'Retirar unidades de ' + insumo.nombre })
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();                                     // sin recargar la página
    const accion = ev.submitter?.value === 'retiro' ? 'retiro' : 'stock';   // Enter en el casillero = Cargar
    error.textContent = '';
    if (accion === 'stock' && lotesDeI) {
      lotesDeI.abrir({ cantidad: cantidad.value.trim() });
      return;
    }
    const n = leerCantidad(cantidad);
    if (typeof n === 'string') {
      error.textContent = n;
      cantidad.setAttribute('aria-invalid', 'true');
      cantidad.focus();
      return;
    }
    cantidad.removeAttribute('aria-invalid');
    try {
      // POST .../{id}/stock o .../{id}/retiro. Responde { id, stock, estado, stock_bajo, ... }. El
      // retiro sin elegir lote sale de lo que vence primero (lo vencido antes que nada).
      const nuevo = await api(`${base}/${insumo.id}/${accion}`, { metodo: 'POST', cuerpo: { cantidad: n } });
      // Se recarga la lista (cambian el stock, el estado y el color) y se dice qué se hizo.
      listado({ texto: accion === 'stock'
        ? `${insumo.nombre}: se ${n === 1 ? 'cargó 1 unidad' : `cargaron ${n} unidades`}. Ahora tiene ${nuevo.stock}.`
        : `${insumo.nombre}: se ${n === 1 ? 'retiró 1 unidad' : `retiraron ${n} unidades`}${lotesDeI ? ' (de lo vencido y de lo que vence antes)' : ''}. Ahora tiene ${nuevo.stock}.` });
    } catch (e) {
      // 400 (cantidad inválida), 409 ("Stock insuficiente" o "dado de baja") u otro error:
      // se muestra en la misma fila, debajo de los botones.
      error.textContent = mensajeDeError(e, 'No se pudo cambiar el stock');
    }
  });
  return form;
}

// "Ya pedido": POST .../{id}/pedido lo marca y DELETE lo desmarca. Responde { id, stock, estado, stock_bajo }.
// Al cargar stock (llegó el pedido) la API lo vuelve a DISPONIBLE sola.
function botonPedido(insumo, tr, error) {
  const pedido = insumo.estado === 'YA_PEDIDO';
  const boton = el('button', pedido ? 'Quitar "Ya pedido"' : 'Marcar "Ya pedido"', {
    type: 'button', class: 'boton boton-borde boton-chico',
    'aria-label': (pedido ? 'Quitar "Ya pedido" de ' : 'Marcar "Ya pedido" ') + insumo.nombre
  });
  boton.addEventListener('click', async () => {
    error.textContent = '';
    try {
      const nuevo = await api(`${base}/${insumo.id}/pedido`, { metodo: pedido ? 'DELETE' : 'POST' });
      tr.replaceWith(fila({ ...insumo, ...nuevo }));
    } catch (e) {
      error.textContent = e.datos?.error ?? 'No se pudo cambiar el estado';
    }
  });
  return boton;
}

// Deshace la baja: el insumo vuelve con su stock y su historial.
function botonReactivar(insumo, error) {
  const boton = el('button', 'Reactivar', {
    type: 'button', class: 'boton boton-borde boton-chico', 'aria-label': 'Reactivar ' + insumo.nombre
  });
  boton.addEventListener('click', async () => {
    error.textContent = '';
    try {
      await api(`${base}/${insumo.id}/reactivar`, { metodo: 'POST' });
      listado();
    } catch (e) {
      error.textContent = e.datos?.error ?? 'No se pudo reactivar el insumo';
    }
  });
  return boton;
}

// Baja lógica, con confirmación.
function botonBaja(insumo) {
  const boton = el('button', 'Dar de baja', {
    type: 'button', class: 'boton boton-peligro boton-chico', 'aria-label': 'Dar de baja ' + insumo.nombre
  });
  boton.addEventListener('click', async () => {
    if (!await confirmar(`¿Dar de baja "${insumo.nombre}"? Queda inactivo y se conserva su historial.`, { aceptar: 'Dar de baja', peligro: true })) return;
    try {
      await api(`${base}/${insumo.id}`, { metodo: 'DELETE' });   // el backend pone activo = 0
      listado();
    } catch {
      estado.textContent = 'No se pudo dar de baja el insumo.';
    }
  });
  return boton;
}

/* ------------------------------------------------------------------ */
/* Pantalla: alta y edición (panel/insumo-form.html)                   */
/* ------------------------------------------------------------------ */

// Sin ?id= es un alta (POST); con ?id= es una edición (PUT).
async function formulario() {
  const form = document.getElementById('form-insumo');

  if (id) {
    document.getElementById('titulo').textContent = 'Editar insumo';
    // El stock no se edita: solo cambia con Cargar o Retirar, para que quede en los movimientos.
    // Un campo disabled no se envía. Los lotes se cargan desde Insumos → "Lotes".
    form.elements.stock.disabled = true;
    for (const c of ['vencimiento', 'lote']) document.getElementById('campo-' + c).hidden = true;

    try {
      const insumo = await api(`${base}/${encodeURIComponent(id)}`);   // GET .../{id}
      form.elements.nombre.value = insumo.nombre;
      form.elements.costo.value = insumo.costo;
      form.elements.aplicacion.value = insumo.aplicacion ?? '';
      form.elements.stock.value = insumo.stock;
      // "Vence" (26/11) se cambia solo sin stock: con stock queda deshabilitado (y no se envía).
      form.elements.vence.value = insumo.vence ? 'si' : 'no';
      if (insumo.stock > 0) {
        form.elements.vence.disabled = true;
        document.getElementById('ayuda-vence').textContent =
          `Se puede cambiar solo sin stock: tiene ${insumo.stock}. Retirá o usá esas unidades primero.`;
      }
    } catch (e) {
      if (e.estado === 404) { location.replace('/panel/insumos.html'); return; }   // no existe: al listado
      estado.textContent = 'No se pudo cargar el insumo.';
      return;
    }
  }

  // En el alta, el vencimiento del primer lote se pide solo si vence.
  if (!id) {
    const mostrar = () => {
      for (const c of ['vencimiento', 'lote']) document.getElementById('campo-' + c).hidden = form.elements.vence.value !== 'si';
    };
    form.elements.vence.addEventListener('change', mostrar);
    mostrar();
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limpiarErrores(form);

    // El JSON tiene que llevar números, no texto. Un campo vacío se manda como null,
    // así el backend responde "es obligatorio".
    const numero = (valor) => (valor === '' ? null : Number(valor));
    const cuerpo = {
      nombre: form.elements.nombre.value, costo: numero(form.elements.costo.value),
      aplicacion: form.elements.aplicacion.value || null,      // vacuna o antiparasitario del calendario (25/11)
    };
    // Si vence (26/11): true o false (sin elegir, null: la API dice que falta). Deshabilitado, no va.
    if (!form.elements.vence.disabled) {
      cuerpo.vence = form.elements.vence.value === 'si' ? true : form.elements.vence.value === 'no' ? false : null;
    }
    // El stock y el primer lote (L1) solo van en el alta. Si no vence, sin fecha ni número.
    if (!id) {
      cuerpo.stock = numero(form.elements.stock.value);
      cuerpo.vencimiento = cuerpo.vence ? (form.elements.vencimiento.value || null) : null;
      cuerpo.lote = cuerpo.vence ? (form.elements.lote.value.trim() || null) : null;
    }

    // Se deshabilita el botón mientras se envía, para no crear el insumo dos veces con un doble clic.
    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      await api(id ? `${base}/${id}` : base, { metodo: id ? 'PUT' : 'POST', cuerpo });
      location.href = '/panel/insumos.html';                 // guardado: vuelve al listado
    } catch (e) {
      // 400: { error, campos: { campo: mensaje } } -> cada mensaje debajo de su campo.
      mostrarErrores(form, e.datos?.campos, e.datos?.error ?? 'No se pudo guardar el insumo.');
    } finally {
      boton.disabled = false;
    }
  });
}

/* ------------------------------------------------------------------ */
/* Pantalla: movimientos (panel/insumo-movimientos.html)               */
/* ------------------------------------------------------------------ */

// Selector de insumo, filtro de fechas y tabla con el motivo enlazado: js/movimientos-inventario.js.
async function movimientos() {
  await pantallaMovimientos({
    urlItems: base,
    urlMovimientos: (insumo, desde, hasta) => `${base}/movimientos?` + new URLSearchParams(
      Object.entries({ insumo, desde, hasta }).filter(([, v]) => v)).toString(),
    campoItem: 'insumo',
    parametroItem: 'id',
    textoVacio: 'No hay movimientos de insumos con ese filtro.',
  });
}
