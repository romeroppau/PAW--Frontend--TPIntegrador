/**
 * auth.js — Estado de sesión en todas las páginas.
 *
 * Al cargarse, consulta al backend quién es el usuario actual (GET /api/auth/yo) y:
 *   - sin sesión: la barra pública (barra-rol.js, MENU_PUBLICO), con el mismo diseño que la de un
 *     rol, y "Inicia sesión" y "Registro";
 *   - con sesión: pone la barra de "Mi panel" de su rol (barra-rol.js) en lugar del menú público,
 *     con el nombre del usuario, la campana y un botón "Salir".
 *
 * IMPORTANTE: esto es solo presentación. Ocultar o mostrar opciones NO protege nada.
 * La seguridad real (quién puede ver o modificar qué) la hace el backend en cada endpoint.
 *
 * Orden de carga: debe ejecutarse después de que exista el encabezado
 * (layout.js en páginas internas, HTML estático en index.html).
 *
 * Exporta:
 *   - sesion:         promesa que resuelve con el usuario ({nombre, rol, ...}) o null.
 *                     Las páginas protegidas hacen `await sesion` para decidir si dejan pasar.
 *   - cargarUsuario:  vuelve a consultar al backend (se usa justo después de un login).
 */
import { api, setCsrf } from './api.js';
import { el } from './ui.js';
import { dibujarBarra, dibujarBarraPublica } from './barra-rol.js';

// Usuario actual en memoria. null = sin sesión.
let usuario = null;

/**
 * Consulta GET /api/auth/yo y actualiza el usuario y el token CSRF.
 *
 * Contrato (repo Backend, docs/api/contrato.md): responde un objeto plano
 *   { id, nombre, email, rol, csrf }   con rol = "CLIENTE" | "VETERINARIO" | "RESCATISTA" (en mayúsculas).
 * Si no hay sesión, la sesión venció (dura 12 horas) o el token fue alterado, responde 401:
 * en ese caso el usuario queda en null.
 * @returns {Promise<object|null>}
 */
export async function cargarUsuario() {
  try {
    usuario = await api('/api/auth/yo');
    setCsrf(usuario.csrf); // se registra en api.js para los próximos POST/PUT/DELETE (también el logout)
  } catch {
    usuario = null;
  }
  return usuario;
}

/**
 * Guardia de acceso para páginas que solo deben ver ciertos roles.
 * Espera a conocer la sesión; si no hay usuario o su rol no está permitido, redirige a login y corta
 * la ejecución del módulo que la llamó (lanza un error, así el resto del archivo no corre).
 * location.replace evita que la página protegida quede en el historial del navegador.
 *
 * Es solo comodidad de interfaz: la autorización real la hace el backend (responde 403).
 *
 * Uso:  await exigirRol('VETERINARIO');
 *       await exigirRol(['CLIENTE', 'VETERINARIO']);   // páginas compartidas (cliente/*.html)
 * @param {string|string[]} roles  Rol o roles permitidos, en mayúsculas ('CLIENTE', 'VETERINARIO' o 'RESCATISTA').
 * @returns {Promise<object>} El usuario, si su rol está permitido.
 */
export async function exigirRol(roles) {
  const permitidos = Array.isArray(roles) ? roles : [roles];
  const u = await sesion;
  if (!u || !permitidos.includes(u.rol)) {
    location.replace('/login/login.html');
    throw new Error('Acceso denegado');
  }
  return u;
}

// Roles que pueden comprar en la tienda: ven "Carrito (N)" en el menú.
const COMPRADORES = ['CLIENTE', 'RESCATISTA'];

/** Agrega una hoja de estilos si la página todavía no la tiene. */
function estilos(href) {
  if (!document.querySelector(`link[href="${href}"]`)) {
    document.head.append(el('link', '', { rel: 'stylesheet', href }));
  }
}

/** Recuerda el rol entre pantallas, para que layout.js no muestre el menú público mientras carga. */
function recordarRol(rol) {
  try {
    if (rol) sessionStorage.setItem('huellavet-rol', rol);
    else sessionStorage.removeItem('huellavet-rol');
  } catch { /* sin almacenamiento: se ve el menú público un instante, nada más */ }
  document.documentElement.classList.remove('barra-pendiente');
}

/**
 * Ajusta el encabezado según el usuario: con sesión, la barra de su panel en lugar del menú público
 * (barra-rol.js), el nombre con su enlace a "Mis datos", "Salir", la campana y "Carrito (N)".
 */
function pintar() {
  recordarRol(usuario?.rol);
  if (!usuario) {                                 // sin sesión: el menú público, con el mismo diseño
    estilos('/css/barra-rol.css');
    dibujarBarraPublica();
    return;
  }

  estilos('/css/barra-rol.css');
  if (dibujarBarra(usuario)) {
    // La campana va en la cabecera del panel (las páginas de panel no la cargaban).
    estilos('/css/notificaciones.css');
    import('./notificaciones.js');
  }

  const zona = document.getElementById('sesion'); // contenedor de los botones de sesión
  if (!zona) return;

  // Botón "Salir": pide al backend que borre la cookie (responde 204 sin cuerpo; exige el token CSRF)
  // y vuelve al inicio.
  const salir = el('button', 'Salir', { type: 'button', class: 'boton boton-borde' });
  salir.addEventListener('click', async () => {
    try { await api('/api/auth/logout', { metodo: 'POST' }); } catch { /* aunque falle, se sale igual de la pantalla */ }
    recordarRol(null);
    location.href = '/index.html';
  });
  // El nombre lleva a "Mis datos" (Entrega 5), como en la mayoría de los sitios.
  zona.replaceChildren(el('a', usuario.nombre ?? 'Mi cuenta', {
    class: 'sesion-nombre', href: '/cuenta/mis-datos.html', title: 'Mis datos',
  }), salir);

  if (COMPRADORES.includes(usuario.rol)) contarCarrito();
}

/**
 * "Carrito (N)" en el menú: N son las unidades del carrito abierto (GET /api/tienda/carrito).
 * Las pantallas de la tienda avisan cuando cambia con el evento "carrito:cantidad" (ver tienda.js),
 * así el número se actualiza sin volver a pedirlo.
 */
function mostrarCantidad(cantidad) {
  const enlace = document.getElementById('enlace-carrito');
  if (enlace) enlace.textContent = cantidad > 0 ? `Carrito (${cantidad})` : 'Carrito';
}

async function contarCarrito() {
  try {
    const carrito = await api('/api/tienda/carrito');
    mostrarCantidad((carrito.items ?? []).reduce((suma, item) => suma + item.cantidad, 0));
  } catch { /* si falla, el enlace queda como "Carrito" */ }
}

document.addEventListener('carrito:cantidad', (evento) => mostrarCantidad(evento.detail));

// Se ejecuta al importar el archivo: consulta la sesión, pinta el encabezado y entrega el usuario.
export const sesion = cargarUsuario().then((u) => { pintar(); return u; });