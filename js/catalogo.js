import { api, debounce } from './api.js';

const $buscar = document.getElementById('buscar');
const $categoria = document.getElementById('categoria');
const $especie = document.getElementById('especie');
const $lista = document.getElementById('lista');
const $estado = document.getElementById('estado');

let pedidoActual = 0;

// Carga el catálogo de productos según los filtros y la página. Se llama al cargar la página y cada vez que cambian los filtros o se hace scroll hasta el final.
async function cargar(pagina = 1) {
  const id = ++pedidoActual;
  const q = new URLSearchParams({
    buscar: $buscar.value.trim(),
    categoria: $categoria.value,
    especie: $especie.value,
    pagina
  });
  $estado.textContent = 'Cargando…';
  try { // Se hace la solicitud a la API para obtener los productos según los filtros y la página
    const r = await api('/api/tienda/productos?' + q);
    if (id !== pedidoActual) return; // descarta respuestas viejas
    render(r);
  } catch (e) { // Si hay un error, se muestra un mensaje de error
    $estado.textContent = 'No se pudo cargar el catálogo. Intente nuevamente.';
  }
}

// Renderiza la lista de productos en el HTML. Se llama desde cargar() cuando se recibe la respuesta de la API.
function render(r) {
  const productos = r.datos ?? r.productos ?? [];
  $lista.replaceChildren();
  $estado.textContent = productos.length ? '' : 'No se encontraron productos.';
  for (const p of productos) { // Se crea un elemento <li> con un enlace al producto y su precio, y se agrega a la lista
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = 'producto.html?id=' + encodeURIComponent(p.id);
    a.textContent = p.nombre; // textContent: evita XSS
    const precio = document.createElement('span');
    precio.textContent = ' $' + p.precio;
    li.append(a, precio);
    $lista.append(li);
  }
}

// Se agregan los event listeners a los filtros y al input de búsqueda, con debounce para evitar hacer demasiadas solicitudes al servidor mientras el usuario escribe.
$buscar.addEventListener('input', debounce(() => cargar(1), 300));
$categoria.addEventListener('change', () => cargar(1));
$especie.addEventListener('change', () => cargar(1));
cargar(1); // Se carga la primera página del catálogo al cargar la página