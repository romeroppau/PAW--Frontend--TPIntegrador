/**
 * panel.js — Panel del veterinario (HuellaVet)
 *
 * Un solo archivo para las tres pantallas del panel. Cada HTML indica cuál le
 * corresponde con el atributo data-pagina del <body>:
 *
 *   panel/productos.html      data-pagina="listado"     -> listado()
 *   panel/producto-form.html  data-pagina="formulario"  -> formulario()
 *   panel/movimientos.html    data-pagina="movimientos" -> movimientos()
 *
 * Seguridad: la guardia de acceso de abajo es solo comodidad de interfaz.
 * La autorización real la hace el backend, que debe responder 403 a cualquier
 * pedido de un usuario que no sea veterinario.
 */

// layout.js ya se cargó como script clásico en el HTML (crea el encabezado que usan menu.js y auth.js).
import './menu.js';
import { api } from './api.js';                                  // fetch común (cookie, CSRF, timeout, reintento)
import { sesion } from './auth.js';                              // promesa con el usuario actual o null
import { el, limpiarErrores, mostrarErrores } from './ui.js';    // utilidades de interfaz

/* ------------------------------------------------------------------ */
/* Guardia de acceso                                                   */
/* ------------------------------------------------------------------ */

// "await" a nivel de módulo: el resto del archivo no se ejecuta hasta saber quién es el usuario.
const usuario = await sesion;

// Sin sesión o con otro rol: se redirige y se corta la ejecución del módulo.
// location.replace evita que la página protegida quede en el historial del navegador.
if (!usuario || usuario.rol !== 'VETERINARIO') {   // los roles llegan en mayúsculas (contrato de auth)
  location.replace('/login/login.html');
  throw new Error('Acceso denegado');
}

/* ------------------------------------------------------------------ */
/* Constantes y utilidades compartidas                                 */
/* ------------------------------------------------------------------ */

// Parámetro ?id= de la URL. Lo usan el formulario (edición) y movimientos.
// Vale null en el listado y en el alta de un producto nuevo.
const id = new URLSearchParams(location.search).get('id');

// Párrafo con role="status" donde se muestran mensajes ("Cargando…", errores, lista vacía).
const estado = document.getElementById('estado');

// Extrae el arreglo de una respuesta. Prueba tres nombres posibles de clave;
// si ninguno existe devuelve []. ADAPTAR al contrato real de la API.
const lista = (r) => r.datos ?? r.productos ?? r.movimientos ?? [];

// Ruta base del módulo Inventario. ADAPTAR al contrato.
const base = '/api/inventario/productos';

// El <main> está oculto (atributo hidden) en el HTML. Recién acá, con el rol
// confirmado, se muestra: así un cliente nunca ve el panel ni un instante.
document.getElementById('contenido').hidden = false;

// Selector de página: el objeto asocia cada valor de data-pagina con su función,
// y se invoca la que corresponde. Funciona porque las funciones declaradas con
// "function" se elevan (hoisting) y ya existen aunque se definan más abajo.
({ listado, formulario, movimientos })[document.body.dataset.pagina]();

/* ------------------------------------------------------------------ */
/* Pantalla: listado de productos (panel/productos.html)               */
/* ------------------------------------------------------------------ */

/**
 * Pide todos los productos (incluidos los dados de baja) y arma la tabla.
 * Se vuelve a llamar después de cargar stock o dar de baja, para refrescar la vista.
 */
async function listado() {
  const filas = document.getElementById('filas');   // <tbody> de la tabla
  estado.textContent = 'Cargando…';
  try {
    const productos = lista(await api(base));       // GET /api/inventario/productos
    filas.replaceChildren(...productos.map(fila));  // una fila por producto; reemplaza el contenido anterior
    estado.textContent = productos.length ? '' : 'No hay productos cargados.';
  } catch {
    estado.textContent = 'No se pudo cargar el listado.';
  }
}

/**
 * Construye la fila <tr> de un producto: sus datos y sus acciones.
 * @param {object} p Producto: id, nombre, categoria, precio, stock, vencimiento, activo.
 * @returns {HTMLTableRowElement}
 */
function fila(p) {
  // Celdas de datos. el() usa textContent, por lo que el contenido nunca se interpreta como HTML.
  const tr = el('tr');
  tr.append(
    el('td', p.nombre),
    el('td', p.categoria ?? ''),
    el('td', '$' + p.precio),
    el('td', p.stock),
    el('td', p.vencimiento || '—'),               // sin vencimiento se muestra un guion
    el('td', p.activo ? 'Activo' : 'De baja')
  );

  // Celda de acciones. Cada control lleva aria-label con el nombre del producto
  // para que un lector de pantalla distinga "Editar Collar" de "Editar Alimento".
  const acc = el('td', '', { class: 'acciones' });
  acc.append(
    el('a', 'Editar', { href: '/panel/producto-form.html?id=' + p.id, 'aria-label': 'Editar ' + p.nombre }),
    el('a', 'Movimientos', { href: '/panel/movimientos.html?id=' + p.id, 'aria-label': 'Movimientos de ' + p.nombre })
  );

  // --- Carga de stock: formulario pequeño dentro de la fila ---
  const f = el('form', '', { class: 'form-stock' });
  const cant = el('input', '', {
    type: 'number', min: '1', step: '1', required: '',
    'aria-label': 'Cantidad a cargar de ' + p.nombre
  });
  f.append(cant, el('button', 'Cargar stock', { type: 'submit', class: 'boton boton-borde boton-chico' }));
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();                            // evita que el navegador recargue la página
    try {
      // POST .../{id}/stock: el backend suma al producto y registra un movimiento de entrada.
      await api(`${base}/${p.id}/stock`, { metodo: 'POST', cuerpo: { cantidad: Number(cant.value) } });
      listado();                                    // refresca la tabla con el stock nuevo
    } catch (e) {
      // Si el backend devuelve un error para "cantidad" (campos) o uno general (error), se muestra ese texto.
      estado.textContent = e.datos?.campos?.cantidad ?? e.datos?.error ?? 'No se pudo cargar el stock.';
    }
  });
  acc.append(f);

  // --- Baja lógica: solo para productos activos ---
  if (p.activo) {
    const baja = el('button', 'Dar de baja', {
      type: 'button', class: 'boton boton-peligro boton-chico', 'aria-label': 'Dar de baja ' + p.nombre
    });
    baja.addEventListener('click', async () => {
      // Confirmación previa: la acción cambia el estado del producto en el catálogo público.
      if (!confirm(`¿Dar de baja "${p.nombre}"? Queda inactivo y se conserva su historial.`)) return;
      try {
        await api(`${base}/${p.id}`, { metodo: 'DELETE' });   // el backend marca activo = 0; no borra la fila
        listado();
      } catch {
        estado.textContent = 'No se pudo dar de baja el producto.';
      }
    });
    acc.append(baja);
  }

  tr.append(acc);
  return tr;
}

/* ------------------------------------------------------------------ */
/* Pantalla: alta y edición (panel/producto-form.html)                 */
/* ------------------------------------------------------------------ */

/**
 * Sirve para dos casos según haya ?id= en la URL:
 *   sin id -> alta:    POST /api/inventario/productos
 *   con id -> edición: PUT  /api/inventario/productos/{id}
 */
async function formulario() {
  const form = document.getElementById('form-producto');

  if (id) {
    // --- Modo edición ---
    document.getElementById('titulo').textContent = 'Editar producto';

    // El stock no se edita acá: solo cambia con "Cargar stock", para que cada
    // variación quede registrada en los movimientos de inventario.
    // Un campo disabled no se incluye en FormData, así que tampoco se envía.
    form.elements.stock.disabled = true;

    try {
      // El plan no define un GET individual para el veterinario, así que se
      // pide el listado completo y se busca el producto por id.
      const p = lista(await api(base)).find((x) => String(x.id) === id);
      if (!p) { location.replace('/panel/productos.html'); return; }   // id inexistente: vuelve al listado

      // Precarga los campos con los valores actuales. "?? ''" evita escribir "null" en un input.
      for (const c of ['nombre', 'descripcion', 'categoria', 'especie', 'precio', 'stock', 'vencimiento']) {
        form.elements[c].value = p[c] ?? '';
      }
    } catch {
      estado.textContent = 'No se pudo cargar el producto.';
      return;
    }
  }

  // --- Envío del formulario (alta y edición) ---
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    limpiarErrores(form);                           // borra errores del intento anterior

    // FormData -> objeto simple. Los valores llegan como texto.
    const cuerpo = Object.fromEntries(new FormData(form));
    delete cuerpo.imagen;                           // el input file llega como objeto File; se trata aparte
    cuerpo.precio = Number(cuerpo.precio);          // el JSON debe llevar números, no texto
    if ('stock' in cuerpo) cuerpo.stock = Number(cuerpo.stock);   // en edición no existe (campo deshabilitado)
    cuerpo.vencimiento = cuerpo.vencimiento || null;              // fecha vacía -> null (producto sin vencimiento)

    // --- Imagen opcional: se valida el tamaño y se convierte a data URL (base64) ---
    const archivo = form.elements.imagen.files[0];
    if (archivo) {
      if (archivo.size > 1024 * 1024) {             // límite de 1 MB: la imagen se guarda en MySQL
        mostrarErrores(form, { imagen: 'La imagen no puede superar 1 MB.' });
        return;
      }
      // FileReader trabaja con eventos; se lo envuelve en una promesa para poder usar await.
      cuerpo.imagen = await new Promise((ok, fallo) => {   // ADAPTAR: formato de imagen según el contrato
        const lector = new FileReader();
        lector.onload = () => ok(lector.result);    // resultado: "data:image/png;base64,...."
        lector.onerror = fallo;
        lector.readAsDataURL(archivo);
      });
    }

    // Se deshabilita el botón durante el envío para evitar productos duplicados por doble clic.
    const boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    try {
      await api(id ? `${base}/${id}` : base, { metodo: id ? 'PUT' : 'POST', cuerpo });
      location.href = '/panel/productos.html';      // éxito: vuelve al listado
    } catch (e) {
      // 400: el backend devuelve { error, campos: { campo: mensaje } } y se muestra junto a cada campo.
      // Otro error: mensaje general del formulario.
      // Formato de error de la API: { error: "mensaje general", campos: { campo: "mensaje" } }.
      mostrarErrores(
        form,
        e.datos?.campos,
        e.datos?.error ?? 'No se pudo guardar el producto.'
      );
    } finally {
      boton.disabled = false;                       // se rehabilita siempre, haya o no error
    }
  });
}

/* ------------------------------------------------------------------ */
/* Pantalla: movimientos de inventario (panel/movimientos.html)        */
/* ------------------------------------------------------------------ */

/**
 * Muestra el historial de movimientos de un producto (?id= en la URL).
 * Cada carga de stock genera un movimiento de entrada.
 */
async function movimientos() {
  const filas = document.getElementById('filas');
  estado.textContent = 'Cargando…';
  try {
    const mov = lista(await api(`${base}/${id}/movimientos`));   // GET .../{id}/movimientos
    filas.replaceChildren(...mov.map((m) => {
      const tr = el('tr');
      tr.append(el('td', m.fecha), el('td', m.tipo), el('td', m.cantidad));
      return tr;
    }));
    estado.textContent = mov.length ? '' : 'Este producto no tiene movimientos.';
  } catch {
    estado.textContent = 'No se pudo cargar el historial.';
  }
}