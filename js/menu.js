// Menú hamburguesa (solo tiene efecto en celular; en escritorio los botones están ocultos).
const boton = document.getElementById('menu-boton');
const cerrar = document.getElementById('menu-cerrar');
const panel = document.getElementById('navegacion');

function abrir() {
  panel.classList.add('abierto');
  boton.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
  cerrar.focus();
}

function cerrarMenu() {
  panel.classList.remove('abierto');
  boton.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
  boton.focus();
}

boton.addEventListener('click', abrir);
cerrar.addEventListener('click', cerrarMenu);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && panel.classList.contains('abierto')) cerrarMenu();
});
// Si se agranda la ventana con el panel abierto, se restablece
window.matchMedia('(min-width: 801px)').addEventListener('change', (e) => {
  if (e.matches && panel.classList.contains('abierto')) cerrarMenu();
});