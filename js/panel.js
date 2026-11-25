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
import { exigirRol } from './auth.js';                          // guardia de acceso compartida (ver auth.js)
import { confirmar, el, limpiarErrores, mostrarErrores } from './ui.js';    // utilidades de interfaz
import { textoCategoria } from './etiquetas.js';                // texto de cada código de categoría
import { fecha } from './tienda.js';                            // "2027-10-25" -> "25/10/2027"
import { filtrarPorNombre, filtroStockBajo } from './buscar-lista.js'; // buscador y "solo stock bajo"

/* ------------------------------------------------------------------ */
/* Guardia de acceso                                                   */
/* ------------------------------------------------------------------ */

// Guardia compartida (definida en auth.js, la misma que usa el panel del administrador):
// espera a saber quién es el usuario y, si no es VETERINARIO, redirige a login y corta la ejecución del módulo.
// El resto del archivo no corre para otros roles.
await exigirRol('VETERINARIO');

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
    const respuesta = await api(base);              // GET /api/inventario/productos
    const productos = lista(respuesta);
    const bajo = filtroStockBajo(respuesta);
    // El buscador filtra por nombre lo que ya se trajo (la lista incluye los dados de baja); la
    // casilla deja solo los de stock bajo.
    filtrarPorNombre(document.getElementById('buscar'), productos, (visibles, texto) => {
      filas.replaceChildren(...visibles.map(fila));  // una fila por producto; reemplaza el contenido anterior
      estado.textContent = productos.length === 0 ? 'No hay productos cargados.'
        : visibles.length > 0 ? ''
        : bajo.casilla?.checked ? (texto ? `Ningún producto con stock bajo se llama "${texto}".` : 'Ningún producto tiene stock bajo.')
        : `Ningún producto se llama "${texto}".`;
    }, bajo);
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
    el('td', p.categoria ? textoCategoria(p.categoria) : ''),
    el('td', '$' + p.precio),
    el('td', p.stock),
    el('td', p.vencimiento ? fecha(p.vencimiento) : '—'),   // DD/MM/AAAA; sin vencimiento, un guion
    el('td', p.activo ? 'Activo' : 'De baja')
  );

  // Celda de acciones. Cada control lleva aria-label con el nombre del producto
  // para que un lector de pantalla distinga "Editar Collar" de "Editar Alimento".
  // La caja con display:flex va adentro de la celda (una celda flex se sale de la tabla).
  const acc = el('div', '', { class: 'acciones' });
  acc.append(
    el('a', 'Editar', { href: '/panel/producto-form.html?id=' + p.id, 'aria-label': 'Editar ' + p.nombre }),
    el('a', 'Movimientos', { href: '/panel/productos-movimientos.html?producto=' + p.id, 'aria-label': 'Movimientos de ' + p.nombre })
  );

  // --- Carga y retiro de stock: un casillero de cantidad y dos botones, como en insumos ---
  // Cargar suma (movimiento de entrada); Retirar resta a mano un producto vencido, roto o usado en
  // el local (salida por ajuste: "Retiro manual" en Movimientos).
  const f = el('form', '', { class: 'form-stock' });
  const cant = el('input', '', {
    type: 'number', min: '1', step: '1', required: '',
    'aria-label': 'Cantidad de ' + p.nombre
  });
  f.append(
    cant,
    el('button', 'Cargar', { type: 'submit', value: 'stock', class: 'boton boton-borde boton-chico', 'aria-label': 'Cargar stock de ' + p.nombre }),
    el('button', 'Retirar', { type: 'submit', value: 'retiro', class: 'boton boton-borde boton-chico', 'aria-label': 'Retirar unidades de ' + p.nombre })
  );
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();                            // evita que el navegador recargue la página
    const accion = ev.submitter?.value === 'retiro' ? 'retiro' : 'stock';   // Enter en el casillero = Cargar
    try {
      // POST .../{id}/stock o .../{id}/retiro: el backend cambia el stock y registra el movimiento.
      await api(`${base}/${p.id}/${accion}`, { metodo: 'POST', cuerpo: { cantidad: Number(cant.value) } });
      listado();                                    // refresca la tabla con el stock nuevo
    } catch (e) {
      // 400 (cantidad inválida) o 409 ("Stock insuficiente", con cuántas hay, o "dado de baja").
      // Como el mensaje va arriba de la tabla, lleva el nombre del producto.
      const mensaje = e.datos?.campos?.cantidad ?? e.datos?.error
        ?? (accion === 'retiro' ? 'No se pudo retirar el stock' : 'No se pudo cargar el stock');
      const hay = e.datos?.stock !== undefined ? ` (hay ${e.datos.stock})` : '';
      estado.textContent = `${p.nombre}: ${mensaje}${hay}.`;
    }
  });
  // A un producto dado de baja no se le carga ni se le retira stock (la API responde 409): solo se reactiva.
  if (p.activo) acc.append(f);

  // --- Reactivar: deshace la baja y el producto vuelve a la tienda con su stock e historial ---
  if (!p.activo) {
    const reactivar = el('button', 'Reactivar', {
      type: 'button', class: 'boton boton-borde boton-chico', 'aria-label': 'Reactivar ' + p.nombre
    });
    reactivar.addEventListener('click', async () => {
      try {
        await api(`${base}/${p.id}/reactivar`, { metodo: 'POST' });
        listado();
      } catch {
        estado.textContent = 'No se pudo reactivar el producto.';
      }
    });
    acc.append(reactivar);
  }

  // --- Baja lógica: solo para productos activos ---
  if (p.activo) {
    const baja = el('button', 'Dar de baja', {
      type: 'button', class: 'boton boton-peligro boton-chico', 'aria-label': 'Dar de baja ' + p.nombre
    });
    baja.addEventListener('click', async () => {
      // Confirmación previa: la acción cambia el estado del producto en el catálogo público.
      if (!await confirmar(`¿Dar de baja "${p.nombre}"? Queda inactivo y se conserva su historial.`, { aceptar: 'Dar de baja', peligro: true })) return;
      try {
        await api(`${base}/${p.id}`, { metodo: 'DELETE' });   // el backend marca activo = 0; no borra la fila
        listado();
      } catch {
        estado.textContent = 'No se pudo dar de baja el producto.';
      }
    });
    acc.append(baja);
  }

  const celda = el('td');
  celda.append(acc);
  tr.append(celda);
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
      // GET .../{id}: trae un solo producto con todos sus datos (el listado no incluye descripción ni imagen).
      const p = await api(`${base}/${encodeURIComponent(id)}`);

      // Precarga los campos con los valores actuales. "?? ''" evita escribir "null" en un input.
      for (const c of ['nombre', 'descripcion', 'categoria', 'especie', 'precio', 'stock', 'vencimiento']) {
        form.elements[c].value = p[c] ?? '';
      }
    } catch (e) {
      if (e.estado === 404) { location.replace('/panel/productos.html'); return; }   // id inexistente: vuelve al listado
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

// La página vieja de un producto (panel/movimientos.html?id=) lleva a "Productos → Movimientos" filtrado.
async function movimientos() {
  location.replace('/panel/productos-movimientos.html' + (id ? '?producto=' + encodeURIComponent(id) : ''));
}
