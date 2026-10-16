/**
 * layout.js — Encabezado y pie compartidos por las páginas internas
 * (login, registro y panel del veterinario).
 *
 * Para qué sirve: evita copiar el mismo encabezado (logo, menú hamburguesa, botones de
 * sesión) en cada HTML. Si cambia un enlace del menú, se edita solo acá.
 *
 * Cómo se usa: cada página deja dos marcadores vacíos,
 *     <div id="encabezado-sitio"></div>   (arriba, seguido de <script src="/js/layout.js">)
 *     <div id="pie-sitio"></div>          (al final del <body>)
 * y este archivo los reemplaza por el HTML real.
 *
 * IMPORTANTE: se carga como script CLÁSICO (sin type="module") justo debajo del marcador
 * del encabezado. Así corre antes del primer dibujado de la página y el contenido no
 * "salta" hacia abajo cuando aparece el encabezado. No importarlo desde otros archivos
 * (se ejecutaría dos veces y la segunda daría error).
 *
 * index.html NO usa este archivo: tiene su propio encabezado escrito en el HTML.
 */

// Logo: huella de mascota en SVG. aria-hidden porque es decorativo (el enlace ya tiene aria-label).
const paw = `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><g fill="#1d4b43"><ellipse cx="14" cy="27" rx="7" ry="9"/><ellipse cx="29" cy="15" rx="7" ry="10"/><ellipse cx="45" cy="15" rx="7" ry="10"/><ellipse cx="57" cy="29" rx="6" ry="9"/><path d="M32 31c-9 0-18 9-18 17 0 6 5 9 11 8 3-.6 5-1.5 7-1.5s4 .9 7 1.5c6 1 11-2 11-8 0-8-9-17-18-17z"/></g></svg>`;

// Encabezado. Los ids (#menu-boton, #menu-cerrar, #navegacion, #menu, #sesion) los usan
// menu.js (menú hamburguesa) y auth.js (nombre de usuario, "Salir" y enlace "Panel").
const encabezado = `<header class="encabezado"><div class="contenedor encabezado-fila">
  <a class="marca-logo" href="/index.html" aria-label="HuellaVet, ir al inicio">${paw}</a>
  <a class="marca-nombre" href="/index.html">HuellaVet</a>
  <button type="button" class="menu-boton" id="menu-boton" aria-expanded="false" aria-controls="navegacion" aria-label="Abrir menú"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg></button>
  <nav id="navegacion" aria-label="Principal">
    <button type="button" class="menu-cerrar" id="menu-cerrar">&lsaquo; Volver</button>
    <ul class="menu" id="menu"><li><a href="/catalogo/catalogo.html">Productos</a></li></ul>
    <div class="sesion" id="sesion"><a class="boton boton-borde" href="/login/login.html">Inicia sesión</a><a class="boton" href="/registros/registro.html">Registro</a></div>
  </nav></div></header>`;

// Pie simple de las páginas internas (el del home es más completo).
const pie = `<footer class="pie"><div class="contenedor"><div><h2>HuellaVet</h2><p>Programación en Ambiente Web · TP Integrador 2026 · Grupo La 25</p></div></div></footer>`;

// Encabezado: se inyecta de inmediato (este script corre justo después de su marcador).
// outerHTML reemplaza el <div> marcador completo por el contenido real.
document.getElementById('encabezado-sitio').outerHTML = encabezado;

// Pie: el marcador está al final de la página, así que se espera a que el HTML termine de cargarse.
// Como está debajo del contenido, agregarlo tarde no desplaza nada.
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('pie-sitio').outerHTML = pie;
});