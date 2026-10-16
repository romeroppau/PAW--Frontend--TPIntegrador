/**
 * auth.js — Estado de sesión en todas las páginas.
 *
 * Al cargarse, consulta al backend quién es el usuario actual (GET /api/auth/yo) y:
 *   - sin sesión: deja los botones "Inicia sesión" y "Registro" del encabezado;
 *   - con sesión: los reemplaza por el nombre del usuario y un botón "Salir";
 *   - si el rol es veterinario: agrega el enlace "Panel" al menú.
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

/** Ajusta el encabezado según el usuario: nombre, botón "Salir" y enlace "Panel". */
function pintar() {
  const zona = document.getElementById('sesion'); // contenedor de los botones de sesión
  const menu = document.getElementById('menu');   // lista de enlaces del menú
  if (!usuario || !zona) return;                  // sin sesión no se toca nada

  // Botón "Salir": pide al backend que borre la cookie (responde 204 sin cuerpo; exige el token CSRF)
  // y vuelve al inicio.
  const salir = el('button', 'Salir', { type: 'button', class: 'boton boton-borde' });
  salir.addEventListener('click', async () => {
    try { await api('/api/auth/logout', { metodo: 'POST' }); } catch { /* aunque falle, se sale igual de la pantalla */ }
    location.href = '/index.html';
  });
  zona.replaceChildren(el('span', usuario.nombre ?? 'Mi cuenta', { class: 'sesion-nombre' }), salir);

  // Enlace al panel de administración, solo para el veterinario.
  if (usuario.rol === 'VETERINARIO' && menu) {
    const li = el('li');
    li.append(el('a', 'Panel', { href: '/panel/productos.html' }));
    menu.append(li);
  }
}

// Se ejecuta al importar el archivo: consulta la sesión, pinta el encabezado y entrega el usuario.
export const sesion = cargarUsuario().then((u) => { pintar(); return u; });