/**
 * catalogo.js — Catálogo de la tienda (catalogo/catalogo.html): todos los productos, con buscador y
 * filtros por categoría y especie. Los que están en promoción aparecen como cualquier otro, con el
 * precio de siempre tachado, el porcentaje, el rebajado y hasta cuándo. Las promociones solas están
 * en catalogo/promociones.html (24/11; antes eran una sección arriba de este catálogo).
 */
// Los enlaces de antes a la sección (catalogo.html#promociones) llevan a la página de promociones.
if (location.hash === '#promociones') location.replace('/catalogo/promociones.html');

import { api, debounce } from './api.js';
import { crearTarjeta } from './tarjeta-producto.js';

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

cargar(1);
