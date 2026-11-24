/**
 * tarjeta-producto.js — La tarjeta de un producto de la tienda, común al catálogo
 * (catalogo/catalogo.html) y a las promociones (catalogo/promociones.html).
 *
 * Foto, categoría, nombre, precio (con promoción: el de siempre tachado, el porcentaje, el rebajado y
 * hasta cuándo; ver bloquePrecio en tienda.js), "Ver detalle" y "Agregar" al carrito.
 * Lo que pasa al tocar "Agregar" se escribe en #aviso-carrito de la página.
 */
import { textoCategoria } from './etiquetas.js';
import { sesion } from './auth.js';
import { agregarAlCarrito, bloquePrecio, irALogin } from './tienda.js';

// Quién inició sesión. Los productos se cargan sin esperarlo; la veterinaria no compra, así que
// cuando se sabe que es ella, los botones "Agregar" se ocultan (clase en el <body>, ver catalogo.css).
let usuario = null;
const sesionLista = sesion.then((u) => {
  usuario = u;
  document.body.classList.toggle('rol-veterinario', u?.rol === 'VETERINARIO');
});

export function crearTarjeta(producto) {
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

// "Agregar": suma 1 unidad al carrito. Sin sesión, lleva a iniciar sesión y vuelve a la página.
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
  const aviso = document.getElementById('aviso-carrito');
  if (!aviso) return;
  aviso.textContent = texto;
  aviso.classList.toggle('aviso-error', !ok);
}
