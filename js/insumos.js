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
import { el, limpiarErrores, mostrarErrores } from './ui.js'; // utilidades de interfaz
import { textoEstadoInsumo } from './etiquetas.js';          // "DISPONIBLE" -> "Disponible"

// Espera a confirmar que es veterinario (y a tener el token CSRF). Si no, redirige al login
// y el resto del archivo no corre.
await exigirRol('VETERINARIO');

const base = '/api/inventario/insumos';
const id = new URLSearchParams(location.search).get('id');  // ?id= del formulario y de movimientos
const estado = document.getElementById('estado');           // mensajes (role="status")

// Texto que ve el veterinario para cada movimiento (contrato: GET .../movimientos).
const TIPOS = { ENTRADA: 'Entrada', SALIDA: 'Salida' };
const MOTIVOS = {
  CARGA_VETERINARIO: 'Carga de stock',
  CONSULTA: 'Usado en una consulta',
  AJUSTE: 'Retiro manual (sin consulta)'
};

// $1.900,00 (pesos argentinos)
const pesos = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });

// Se elige la función según la pantalla. Las funciones declaradas con "function" ya existen acá
// aunque estén escritas más abajo.
({ listado, formulario, movimientos })[document.body.dataset.pagina]();

/* ------------------------------------------------------------------ */
/* Pantalla: listado (panel/insumos.html)                              */
/* ------------------------------------------------------------------ */

async function listado() {
  const filas = document.getElementById('filas');
  estado.textContent = 'Cargando…';
  try {
    const { datos } = await api(base);                       // GET /api/inventario/insumos
    filas.replaceChildren(...datos.map(fila));
    estado.textContent = datos.length ? '' : 'No hay insumos cargados.';
  } catch {
    estado.textContent = 'No se pudo cargar el listado.';
  }
}

// La fila <tr> de un insumo: sus datos, su estado con color y sus acciones.
function fila(insumo) {
  const tr = el('tr', '', insumo.activo ? {} : { class: 'fila-baja' });
  tr.append(
    el('td', insumo.nombre),
    el('td', insumo.stock),
    el('td', pesos.format(insumo.costo)),
    celdaEstado(insumo)
  );

  // Cada acción lleva aria-label con el nombre, así el lector de pantalla distingue
  // "Editar Gasa" de "Editar Jeringa".
  const acciones = el('td', '', { class: 'acciones' });
  acciones.append(
    el('a', 'Editar', { href: '/panel/insumo-form.html?id=' + insumo.id, 'aria-label': 'Editar ' + insumo.nombre }),
    el('a', 'Movimientos', { href: '/panel/insumo-movimientos.html?id=' + insumo.id, 'aria-label': 'Movimientos de ' + insumo.nombre })
  );

  // Cargar, retirar y dar de baja: solo para insumos activos.
  if (insumo.activo) {
    acciones.append(formularioStock(insumo, tr), botonBaja(insumo));
  }

  tr.append(acciones);
  return tr;
}

// Estado con color: rojo si está en falta, amarillo si tiene stock bajo, gris si está dado de baja.
// stock_bajo y estado los calcula la API (regla de Insumo::stockBajo() en el backend).
function celdaEstado(insumo) {
  if (!insumo.activo) {
    return el('td', 'De baja');
  }

  const td = el('td');
  if (insumo.estado === 'EN_FALTA') {
    td.append(el('span', textoEstadoInsumo(insumo.estado), { class: 'insignia insignia-falta' }));
  } else if (insumo.stock_bajo) {
    td.append(el('span', 'Stock bajo', { class: 'insignia insignia-bajo' }));
  } else {
    td.append(el('span', textoEstadoInsumo(insumo.estado), { class: 'insignia' }));
  }
  return td;
}

// Un casillero de cantidad y dos botones: Cargar (suma) y Retirar (resta sin consulta).
function formularioStock(insumo, tr) {
  const form = el('form', '', { class: 'form-stock' });
  const cantidad = el('input', '', {
    type: 'number', min: '1', step: '1', required: '',
    'aria-label': 'Cantidad de ' + insumo.nombre
  });
  // Lugar para el error de esta fila (role="alert": el lector de pantalla lo anuncia).
  const error = el('span', '', { class: 'campo-error', role: 'alert' });
  form.append(
    cantidad,
    el('button', 'Cargar', { type: 'submit', value: 'stock', class: 'boton boton-borde boton-chico', 'aria-label': 'Cargar stock de ' + insumo.nombre }),
    el('button', 'Retirar', { type: 'submit', value: 'retiro', class: 'boton boton-borde boton-chico', 'aria-label': 'Retirar unidades de ' + insumo.nombre }),
    error
  );

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();                                     // sin recargar la página
    const accion = ev.submitter.value;                       // qué botón se tocó: "stock" o "retiro"
    error.textContent = '';
    try {
      // POST .../{id}/stock o .../{id}/retiro. Responde { id, stock, estado, stock_bajo }.
      const nuevo = await api(`${base}/${insumo.id}/${accion}`, {
        metodo: 'POST',
        cuerpo: { cantidad: Number(cantidad.value) }
      });
      // Si sale bien no se muestra ningún mensaje: se reemplaza solo esta fila con los datos
      // nuevos, y a la vista cambian el stock, el estado y el color.
      tr.replaceWith(fila({ ...insumo, ...nuevo }));
    } catch (e) {
      // 400 (cantidad inválida), 409 ("Stock insuficiente" o "dado de baja") u otro error:
      // se muestra en la misma fila, debajo de los botones.
      const mensaje = e.datos?.campos?.cantidad ?? e.datos?.error ?? 'No se pudo cambiar el stock';
      const hay = e.datos?.stock !== undefined ? ` (hay ${e.datos.stock})` : '';
      error.textContent = mensaje + hay;
    }
  });
  return form;
}

// Baja lógica, con confirmación.
function botonBaja(insumo) {
  const boton = el('button', 'Dar de baja', {
    type: 'button', class: 'boton boton-peligro boton-chico', 'aria-label': 'Dar de baja ' + insumo.nombre
  });
  boton.addEventListener('click', async () => {
    if (!confirm(`¿Dar de baja "${insumo.nombre}"? Queda inactivo y se conserva su historial.`)) return;
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
    // Un campo disabled no se envía.
    form.elements.stock.disabled = true;

    try {
      const insumo = await api(`${base}/${encodeURIComponent(id)}`);   // GET .../{id}
      form.elements.nombre.value = insumo.nombre;
      form.elements.costo.value = insumo.costo;
      form.elements.stock.value = insumo.stock;
    } catch (e) {
      if (e.estado === 404) { location.replace('/panel/insumos.html'); return; }   // no existe: al listado
      estado.textContent = 'No se pudo cargar el insumo.';
      return;
    }
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limpiarErrores(form);

    // El JSON tiene que llevar números, no texto. Un campo vacío se manda como null,
    // así el backend responde "es obligatorio".
    const numero = (valor) => (valor === '' ? null : Number(valor));
    const cuerpo = { nombre: form.elements.nombre.value, costo: numero(form.elements.costo.value) };
    if (!id) cuerpo.stock = numero(form.elements.stock.value);   // el stock solo va en el alta

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

async function movimientos() {
  const selector = document.getElementById('insumo');
  const filas = document.getElementById('filas');

  // Carga los movimientos. Sin insumo elegido trae los de todos; con uno, el selector funciona
  // como filtro (GET .../movimientos?insumo=ID).
  async function mostrar(insumoId) {
    estado.textContent = 'Cargando…';
    try {
      const filtro = insumoId ? '?insumo=' + encodeURIComponent(insumoId) : '';
      const { datos } = await api(`${base}/movimientos${filtro}`);
      filas.replaceChildren(...datos.map((m) => {
        const tr = el('tr');
        tr.append(
          el('td', fecha(m.fecha)),
          el('td', m.insumo),
          el('td', TIPOS[m.tipo] ?? m.tipo),
          el('td', MOTIVOS[m.motivo] ?? m.motivo),
          el('td', m.cantidad),
          el('td', m.usuario ?? '—')
        );
        return tr;
      }));
      if (datos.length) {
        estado.textContent = '';
      } else {
        estado.textContent = insumoId ? 'Este insumo todavía no tiene movimientos.' : 'Todavía no hay movimientos de insumos.';
      }
    } catch {
      filas.replaceChildren();
      estado.textContent = 'No se pudo cargar el historial.';
    }
  }

  // El selector se llena con todos los insumos (los dados de baja también tienen historial).
  try {
    const { datos } = await api(base);
    selector.append(...datos.map((i) => el('option', i.activo ? i.nombre : i.nombre + ' (de baja)', { value: i.id })));
  } catch {
    estado.textContent = 'No se pudo cargar la lista de insumos.';
    return;
  }

  // Si llegó con ?id=, ese insumo queda elegido.
  if (id) selector.value = id;

  // Al cambiar el insumo: se actualiza la URL (sin recargar) y se muestran sus movimientos.
  selector.addEventListener('change', () => {
    const elegido = selector.value;
    history.replaceState(null, '', elegido ? '?id=' + elegido : location.pathname);
    mostrar(elegido);
  });

  mostrar(selector.value);
}

// "2026-11-06 15:30:00" -> "06/11/2026 15:30"
function fecha(texto) {
  const [dia, hora] = texto.split(' ');
  const [a, m, d] = dia.split('-');
  return `${d}/${m}/${a} ${hora.slice(0, 5)}`;
}
