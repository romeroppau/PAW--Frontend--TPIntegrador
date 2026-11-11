import { api } from './api.js';
import { textoCategoria, textoEspecie } from './etiquetas.js';

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

const id = new URLSearchParams(window.location.search).get('id');

function formatearPrecio(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return valor == null ? 'Precio a consultar' : `$${valor}`;
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 2
  }).format(numero);
}

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
    $precio.textContent = formatearPrecio(producto.precio);
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

cargarDetalle();
