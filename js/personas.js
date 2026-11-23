/**
 * personas.js — Lo común para mostrar datos de una persona (Clientes, ficha del cliente).
 */
import { el } from './ui.js';

/** El teléfono como enlace para llamar (en el celular abre el marcador), o "—" si no tiene. */
export function enlaceTelefono(telefono) {
  return telefono ? el('a', telefono, { href: 'tel:' + telefono }) : document.createTextNode('—');
}

/** El enlace a la ficha de un dueño (para la veterinaria: Mascotas, Agenda, Clientes). */
export function enlaceDuenio(duenio) {
  return el('a', duenio.nombre, {
    href: '/panel/cliente.html?id=' + encodeURIComponent(duenio.id),
    'aria-label': 'Ver los datos de ' + duenio.nombre,
  });
}
