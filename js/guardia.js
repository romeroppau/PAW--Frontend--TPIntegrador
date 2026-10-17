/**
 * guardia-admin.js — Protege paneles/panel-administrador.html: solo entra el VETERINARIO.
 *
 * El <main> de esa página debe llevar el atributo `hidden` en el HTML: queda oculto hasta
 * confirmar el rol, así quien no corresponde nunca ve el panel ni un instante.
 * (Las páginas del ABM, panel/*.html, tienen su propia guardia en panel.js; cada página
 * a la que se puede llegar escribiendo la URL necesita la suya.)
 */
import { exigirRol } from './auth.js';

await exigirRol('VETERINARIO');       // si no corresponde, redirige a login y el módulo se corta acá
document.querySelector('main').hidden = false;