/**
 * clientes.js — Clientes de la veterinaria (panel/clientes.html).
 *
 * API: GET /api/clientes?buscar=ana&pagina=1 → { datos, pagina, por_pagina, hay_mas }
 * (repo Backend, docs/api/contrato.md, "Clientes"). De a 20: "Ver más" agrega la página siguiente.
 */
import { api, debounce } from './api.js';
import { exigirRol } from './auth.js';
import { el } from './ui.js';
import { enlaceTelefono } from './personas.js';

const $buscar = document.getElementById('buscar');
const $estado = document.getElementById('estado');
const $tabla = document.getElementById('tabla');
const $filas = document.getElementById('filas');
const $verMas = document.getElementById('ver-mas');

let pagina = 1;
let pedidoActual = 0;   // si llegan dos respuestas, solo se dibuja la del último pedido

await exigirRol('VETERINARIO');
$buscar.focus();
cargar();

async function cargar(siguiente = false) {
  const id = ++pedidoActual;
  const buscar = $buscar.value.trim();
  const paginaPedida = siguiente ? pagina + 1 : 1;
  const q = new URLSearchParams({ pagina: String(paginaPedida) });
  if (buscar) q.set('buscar', buscar);
  $verMas.disabled = true;
  if (!siguiente) $estado.textContent = 'Cargando clientes…';

  try {
    const { datos = [], hay_mas: hayMas } = await api('/api/clientes?' + q.toString());
    if (id !== pedidoActual) return;
    pagina = paginaPedida;
    const filas = datos.map(fila);
    if (siguiente) $filas.append(...filas); else $filas.replaceChildren(...filas);
    const hayAlguno = $filas.children.length > 0;
    $tabla.hidden = !hayAlguno;
    $verMas.hidden = !hayMas;
    $estado.textContent = hayAlguno ? '' : buscar ? `No encontramos clientes con "${buscar}".` : 'Todavía no hay clientes.';
  } catch {
    if (id !== pedidoActual) return;
    $estado.textContent = 'No se pudieron cargar los clientes. Probá de nuevo en un momento.';
  } finally {
    $verMas.disabled = false;
  }
}

function fila(cliente) {
  const tr = el('tr');
  const nombre = el('th', '', { scope: 'row' });
  nombre.append(el('a', cliente.nombre, { href: '/panel/cliente.html?id=' + encodeURIComponent(cliente.id) }));
  const email = el('td');
  email.append(el('a', cliente.email, { href: 'mailto:' + cliente.email }));
  const telefono = el('td');
  telefono.append(enlaceTelefono(cliente.telefono));
  tr.append(nombre, email, telefono);
  return tr;
}

$buscar.addEventListener('input', debounce(() => cargar(), 300));
$verMas.addEventListener('click', () => cargar(true));
