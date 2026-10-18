import { api, debounce } from './api.js';
import { textoCategoria } from './etiquetas.js';

const $buscar = document.getElementById('buscar');
const $categoria = document.getElementById('categoria');
const $especie = document.getElementById('especie');
const $lista = document.getElementById('lista');
const $estado = document.getElementById('estado');
const $cargarMas = document.getElementById('cargar-mas');

let pedidoActual = 0;
let paginaActual = 1;

function parametros(pagina) {
  const q = new URLSearchParams();
  const buscar = $buscar.value.trim();
  if (buscar) q.set('buscar', buscar);
  if ($categoria.value) q.set('categoria', $categoria.value);
  if ($especie.value) q.set('especie', $especie.value);
  q.set('pagina', String(pagina));
  return q;
}

function extraerProductos(respuesta) {
  if (Array.isArray(respuesta)) return respuesta;
  if (Array.isArray(respuesta.datos)) return respuesta.datos;
  if (Array.isArray(respuesta.productos)) return respuesta.productos;
  return [];
}

async function cargar(pagina = 1, agregar = false) {
  const id = ++pedidoActual;
  paginaActual = pagina;
  $estado.textContent = 'Cargando productos…';
  $cargarMas.hidden = true;
  if (!agregar) $lista.replaceChildren();

  try {
    const respuesta = await api('/api/tienda/productos?' + parametros(pagina).toString());
    if (id !== pedidoActual) return;

    const productos = extraerProductos(respuesta);
    if (!agregar) $lista.replaceChildren();

    for (const producto of productos) {
      $lista.append(crearTarjeta(producto));
    }

    if ($lista.children.length === 0) {
      $estado.textContent = 'No se encontraron productos. Probá cambiar la búsqueda o los filtros.';
    } else {
      $estado.textContent = '';
    }

    // El contrato incluye paginado. Si una página trae productos, se permite pedir la siguiente.
    // Al llegar a una página vacía, se oculta el botón y no se pierden los resultados ya mostrados.
    $cargarMas.hidden = productos.length === 0;
  } catch (error) {
    if (id !== pedidoActual) return;
    $estado.textContent = 'No se pudo cargar el catálogo. Probá nuevamente más tarde.';
    $cargarMas.hidden = true;
  }
}

function crearTarjeta(producto) {
  const li = document.createElement('li');
  li.className = 'tarjeta-producto';

  const categoria = document.createElement('p');
  categoria.className = 'etiqueta';
  categoria.textContent = producto.categoria ? textoCategoria(producto.categoria) : 'Producto';

  const nombre = document.createElement('h2');
  nombre.className = 'nombre-producto';
  nombre.textContent = producto.nombre ?? 'Producto sin nombre';

  const precio = document.createElement('p');
  precio.className = 'precio';
  precio.textContent = producto.precio == null ? 'Precio a consultar' : formatearPrecio(producto.precio);

  const enlace = document.createElement('a');
  enlace.className = 'boton boton-borde enlace-detalle';
  enlace.href = '/catalogo/producto.html?id=' + encodeURIComponent(producto.id);
  enlace.textContent = 'Ver detalle';
  enlace.setAttribute('aria-label', `Ver detalle de ${producto.nombre ?? 'producto'}`);

  li.append(categoria, nombre, precio, enlace);
  return li;
}

function formatearPrecio(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return `$${valor}`;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 2
  }).format(numero);
}

$buscar.addEventListener('input', debounce(() => cargar(1), 300));
$categoria.addEventListener('change', () => cargar(1));
$especie.addEventListener('change', () => cargar(1));
$cargarMas.addEventListener('click', () => cargar(paginaActual + 1, true));

cargar(1);
