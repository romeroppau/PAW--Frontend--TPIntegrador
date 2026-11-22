import { api, debounce } from './api.js';
import { textoCategoria } from './etiquetas.js';
import { sesion } from './auth.js';
import { agregarAlCarrito, bloquePrecio, irALogin } from './tienda.js';

const $buscar = document.getElementById('buscar');
const $categoria = document.getElementById('categoria');
const $especie = document.getElementById('especie');
const $lista = document.getElementById('lista');
const $estado = document.getElementById('estado');
const $cargarMas = document.getElementById('cargar-mas');
const $aviso = document.getElementById('aviso-carrito');
const $promociones = document.getElementById('promociones');
const $listaPromociones = document.getElementById('lista-promociones');

// Quién inició sesión. Los productos se cargan sin esperarlo; la veterinaria no compra, así que
// cuando se sabe que es ella, los botones "Agregar" se ocultan (clase en el <body>, ver catalogo.css).
let usuario = null;
const sesionLista = sesion.then((u) => {
  usuario = u;
  document.body.classList.toggle('rol-veterinario', u?.rol === 'VETERINARIO');
});

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
  li.className = producto.promocion ? 'tarjeta-producto tarjeta-en-promo' : 'tarjeta-producto';

  const categoria = document.createElement('p');
  categoria.className = 'etiqueta';
  categoria.textContent = producto.categoria ? textoCategoria(producto.categoria) : 'Producto';

  const nombre = document.createElement('h2');
  nombre.className = 'nombre-producto';
  nombre.textContent = producto.nombre ?? 'Producto sin nombre';

  // Con promoción: el precio de siempre tachado, el rebajado y hasta cuándo (tienda.js).
  const precio = bloquePrecio(producto);

  const enlace = document.createElement('a');
  enlace.className = 'boton boton-borde enlace-detalle';
  enlace.href = '/catalogo/producto.html?id=' + encodeURIComponent(producto.id);
  enlace.textContent = 'Ver detalle';
  enlace.setAttribute('aria-label', `Ver detalle de ${producto.nombre ?? 'producto'}`);

  const acciones = document.createElement('div');
  acciones.className = 'acciones-producto';
  acciones.append(enlace, crearBotonAgregar(producto));

  li.append(crearFoto(producto), categoria, nombre, precio, acciones);
  return li;
}

// Huellita para los productos sin foto (SVG decorativo).
const HUELLA = '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g fill="currentColor"><ellipse cx="14" cy="27" rx="7" ry="9"/><ellipse cx="29" cy="15" rx="7" ry="10"/><ellipse cx="45" cy="15" rx="7" ry="10"/><ellipse cx="57" cy="29" rx="6" ry="9"/><path d="M32 31c-9 0-18 9-18 17 0 6 5 9 11 8 3-.6 5-1.5 7-1.5s4 .9 7 1.5c6 1 11-2 11-8 0-8-9-17-18-17z"/></g></svg>';

// La foto de la tarjeta: se pide la imagen sola (GET /api/tienda/productos/{id}/imagen, que el
// navegador guarda una hora). El listado no dice qué productos tienen foto, así que se intenta y, si
// no tiene (404), queda la huellita. Lleva al detalle, como "Ver detalle".
function crearFoto(producto) {
  const foto = document.createElement('a');
  foto.className = 'foto-producto';
  foto.href = '/catalogo/producto.html?id=' + encodeURIComponent(producto.id);
  foto.tabIndex = -1;                       // el enlace accesible es "Ver detalle"
  foto.setAttribute('aria-hidden', 'true');
  foto.innerHTML = HUELLA;

  // La <img> entra en la página recién cuando cargó (mientras tanto se ve la huellita). Por eso no
  // lleva loading="lazy": una imagen que todavía no está en la página nunca cargaría.
  const imagen = document.createElement('img');
  imagen.alt = '';
  imagen.addEventListener('load', () => foto.replaceChildren(imagen), { once: true });
  imagen.src = `/api/tienda/productos/${encodeURIComponent(producto.id)}/imagen`;
  return foto;
}

// "Agregar": suma 1 unidad al carrito. Sin sesión, lleva a iniciar sesión y vuelve al catálogo.
function crearBotonAgregar(producto) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'boton boton-agregar';

  if (producto.disponible === false) {
    boton.textContent = 'Sin stock';
    boton.disabled = true;
    return boton;
  }

  boton.textContent = 'Agregar';
  boton.setAttribute('aria-label', `Agregar ${producto.nombre ?? 'producto'} al carrito`);
  boton.addEventListener('click', async () => {
    await sesionLista;
    if (!usuario) {
      irALogin();
      return;
    }
    boton.disabled = true;
    const resultado = await agregarAlCarrito(producto, 1);
    boton.disabled = false;
    mostrarAviso(resultado);
  });
  return boton;
}

function mostrarAviso({ ok, texto }) {
  $aviso.textContent = texto;
  $aviso.classList.toggle('aviso-error', !ok);
}

// La sección "Promociones" (arriba del catálogo): los productos que la veterinaria publicitó desde
// sus reportes. Si no hay ninguno, o la API no responde, la sección no se muestra.
async function cargarPromociones() {
  try {
    const { datos = [] } = await api('/api/tienda/promociones');
    $listaPromociones.replaceChildren(...datos.map(crearTarjeta));
    $promociones.hidden = datos.length === 0;
  } catch {
    $promociones.hidden = true;
  }
}

$buscar.addEventListener('input', debounce(() => cargar(1), 300));
$categoria.addEventListener('change', () => cargar(1));
$especie.addEventListener('change', () => cargar(1));
$cargarMas.addEventListener('click', () => cargar(paginaActual + 1, true));

// Se puede entrar con una categoría ya elegida (los enlaces del panel del cliente):
// catalogo.html?categoria=ALIMENTO. Un valor que no está en la lista se ignora.
const categoriaDelEnlace = new URLSearchParams(location.search).get('categoria');
if ([...$categoria.options].some((opcion) => opcion.value && opcion.value === categoriaDelEnlace)) {
  $categoria.value = categoriaDelEnlace;
}

cargarPromociones();
cargar(1);
