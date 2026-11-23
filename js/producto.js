import { api } from './api.js';
import { datosDeContacto, enlaceWhatsApp } from './contacto.js';
import { textoCategoria, textoEspecie } from './etiquetas.js';
import { sesion } from './auth.js';
import { agregarAlCarrito, bloquePrecio, irALogin } from './tienda.js';

const $estado = document.getElementById('estado-detalle');
const $error = document.getElementById('error-detalle');
const $detalle = document.getElementById('detalle-producto');
const $sinImagen = document.getElementById('producto-sin-imagen');
const $categoria = document.getElementById('producto-categoria');
const $nombre = document.getElementById('producto-nombre');
const $especie = document.getElementById('producto-especie');
const $precio = document.getElementById('producto-precio');
const $descripcion = document.getElementById('producto-descripcion');
const $whatsapp = document.getElementById('producto-whatsapp');
const $formAgregar = document.getElementById('form-agregar');
const $cantidad = document.getElementById('cantidad');
const $botonAgregar = document.getElementById('boton-agregar');
const $aviso = document.getElementById('aviso-carrito');

// El producto que se está mirando (lo completa cargarDetalle).
let productoActual = null;

const id = new URLSearchParams(window.location.search).get('id');

function mostrarError(mensaje) {
  $estado.textContent = '';
  $detalle.hidden = true;
  $error.textContent = mensaje;
  $error.hidden = false;
}

async function cargarDetalle() {
  if (!id || !/^\d+$/.test(id)) {
    mostrarError('No encontramos ese producto. Volvé al catálogo y elegí uno de la lista.');
    return;
  }

  try {
    const respuesta = await api('/api/tienda/productos/' + encodeURIComponent(id));
    const producto = respuesta.producto ?? respuesta.datos ?? respuesta;

    if (!producto || producto.id == null) {
      mostrarError('No encontramos ese producto. Puede que ya no esté disponible.');
      return;
    }

    $categoria.textContent = producto.categoria ? textoCategoria(producto.categoria) : 'Producto';
    $nombre.textContent = producto.nombre ?? 'Producto';
    $especie.textContent = producto.especie ? `Especie: ${textoEspecie(producto.especie)}` : '';
    // Con promoción: el precio de siempre tachado, el rebajado y hasta cuándo (tienda.js).
    $precio.replaceChildren(...bloquePrecio(producto).childNodes);
    $precio.classList.toggle('precio-con-promo', Boolean(producto.promocion));
    $descripcion.textContent = producto.descripcion ?? 'No hay una descripción disponible para este producto.';

    // Se admiten URLs o data URLs de imagen. Si el API devuelve otra representación,
    // hay que adaptar esta parte al formato acordado con Inventario.
    const srcImagen = producto.imagen_url ?? producto.imagenUrl ?? producto.imagen;
    // La <img> se crea recién acá, con su src (en el HTML no hay una vacía: no sería válida).
    document.getElementById('producto-imagen')?.remove();
    $sinImagen.hidden = false;
    if (typeof srcImagen === 'string' && /^(https?:\/\/|data:image\/)/i.test(srcImagen)) {
      const imagen = document.createElement('img');
      imagen.id = 'producto-imagen';
      imagen.className = 'detalle-imagen';
      imagen.alt = producto.nombre ? `Imagen de ${producto.nombre}` : 'Imagen del producto';
      imagen.src = srcImagen;
      // Si no carga, vuelve el recuadro "Imagen del producto".
      imagen.addEventListener('error', () => {
        imagen.remove();
        $sinImagen.hidden = false;
      }, { once: true });
      $sinImagen.before(imagen);
      $sinImagen.hidden = true;
    }

    const mensaje = `Hola, quiero consultar por ${producto.nombre ?? 'un producto'} de HuellaVet.`;
    $whatsapp.href = 'https://wa.me/5491139010486?text=' + encodeURIComponent(mensaje);
    // Con el número que cargó la veterinaria en Configuración (si no responde, queda el de siempre).
    datosDeContacto().then((datos) => { if (datos) $whatsapp.href = enlaceWhatsApp(datos, mensaje); });
    productoActual = producto;
    prepararCompra(producto);
    $estado.textContent = '';
    $error.hidden = true;
    $detalle.hidden = false;
    document.title = `${producto.nombre ?? 'Producto'} | HuellaVet`;
  } catch (error) {
    if (error.estado === 404) {
      mostrarError('No encontramos ese producto o ya no está disponible.');
    } else {
      mostrarError('No se pudo cargar el producto. Probá nuevamente más tarde.');
    }
  }
}

// Agregar al carrito: la veterinaria no lo ve; sin stock, el botón queda apagado.
async function prepararCompra(producto) {
  const usuario = await sesion;
  $formAgregar.hidden = usuario?.rol === 'VETERINARIO';
  const sinStock = producto.disponible === false;
  $botonAgregar.disabled = sinStock;
  $cantidad.disabled = sinStock;
  $botonAgregar.textContent = sinStock ? 'Sin stock' : 'Agregar al carrito';
}

$formAgregar.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!productoActual) return;

  // Sin sesión: a iniciar sesión, y después vuelve a este producto.
  if (!(await sesion)) {
    irALogin();
    return;
  }

  const cantidad = Number($cantidad.value);
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 99) {
    mostrarAviso({ ok: false, texto: 'La cantidad tiene que ser un número entero entre 1 y 99.' });
    $cantidad.setAttribute('aria-invalid', 'true');
    return;
  }
  $cantidad.removeAttribute('aria-invalid');

  $botonAgregar.disabled = true;
  const resultado = await agregarAlCarrito(productoActual, cantidad);
  $botonAgregar.disabled = false;
  mostrarAviso(resultado);
});

function mostrarAviso({ ok, texto }) {
  $aviso.textContent = texto;
  $aviso.classList.toggle('aviso-error', !ok);
}

cargarDetalle();
