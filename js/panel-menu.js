/**
 * panel-menu.js — Menús desplegables de la barra de los paneles (paneles/*.html).
 *
 * Cada sección de la barra es un <details class="panel-desplegable">: el navegador ya lo abre y
 * lo cierra con clic, Enter o Espacio, sin JavaScript. Este archivo solo agrega comodidades:
 *   - se abre de a uno (al abrir una sección se cierran las demás);
 *   - un clic afuera o la tecla Escape cierran el menú abierto;
 *   - si la dirección trae #seccion (p. ej. panel-cliente.html#tienda), esa sección empieza abierta.
 */
const desplegables = [...document.querySelectorAll('.panel-desplegable')];

function cerrarTodos(excepto = null) {
  for (const d of desplegables) {
    if (d !== excepto) d.open = false;
  }
}

for (const d of desplegables) {
  d.addEventListener('toggle', () => {
    if (d.open) cerrarTodos(d);
  });
}

document.addEventListener('click', (evento) => {
  if (!evento.target.closest('.panel-desplegable')) cerrarTodos();
});

document.addEventListener('keydown', (evento) => {
  if (evento.key !== 'Escape') return;
  const abierto = desplegables.find((d) => d.open);
  if (!abierto) return;
  abierto.open = false;
  abierto.querySelector('summary').focus();
});

function abrirSegunDireccion() {
  const id = decodeURIComponent(location.hash.slice(1));
  const destino = desplegables.find((d) => d.id === id);
  if (destino) destino.open = true;
}

abrirSegunDireccion();
window.addEventListener('hashchange', abrirSegunDireccion);
