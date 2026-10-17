/**
 * guardia-panel.js — Protege los paneles de Ana (paneles/*.html) y muestra "Salir".
 *
 * Cada panel indica qué rol puede verlo con data-rol en el <body>:
 *   paneles/panel-administrador.html  ->  <body data-rol="VETERINARIO">
 *   paneles/panel-cliente.html        ->  <body data-rol="CLIENTE">
 *   paneles/panel-rescatista.html     ->  <body data-rol="RESCATISTA">
 *
 * Requisitos en el HTML de cada panel:
 *   - <main ... hidden>: queda oculto hasta confirmar el rol, así quien no corresponde
 *     nunca ve el panel ni un instante.
 *   - <div class="sesion" id="sesion"></div> dentro de la cabecera: auth.js lo rellena con
 *     el nombre del usuario y el botón "Salir".
 *   - Cargar este archivo y auth.js al final del <body>.
 *
 * Esto es solo comodidad de interfaz: la autorización real la hace el backend (responde 403).
 * Las páginas del ABM (panel/*.html) tienen su propia guardia en panel.js, porque se puede
 * llegar a ellas escribiendo la URL sin pasar por la portada.
 */
import { exigirRol } from './auth.js';

// Si no hay sesión o el rol no coincide, redirige a login y el módulo se corta acá.
await exigirRol(document.body.dataset.rol);

document.querySelector('main').hidden = false;