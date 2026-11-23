/**
 * contacto.js — Los datos de la veterinaria (dirección, teléfono, WhatsApp, email y redes) que ella
 * misma carga en Configuración → "Datos de la veterinaria".
 *
 * API (repo Backend, docs/api/contrato.md, "Configuración"): GET /api/configuracion/contacto, pública →
 *   { direccion, telefono, whatsapp, email, instagram, facebook, youtube,
 *     enlaces: { telefono: "tel:+54…", whatsapp: "https://wa.me/549…" } }   (lo no cargado va como null)
 *
 * El HTML marca dónde va cada dato y este módulo lo completa (lo escrito queda si la API no responde):
 *   data-contacto="direccion|telefono|whatsapp|email"        → el texto
 *   data-contacto-enlace="telefono|whatsapp|email|instagram|facebook|youtube|mapa" → el href.
 *       Si ese dato no está cargado, se oculta: el [data-contacto-caja] que lo contiene, si no el <li>,
 *       si no el enlace mismo.
 *   data-whatsapp-texto="Hola, …"                            → el mensaje que abre WhatsApp
 *   data-contacto-mapa                                       → el src del mapa (iframe)
 *   data-contacto-redes                                      → el bloque "Seguinos": se oculta sin redes
 * Se aplica solo al cargar la página; lo que se dibuja después (la barra) llama a aplicarContacto().
 */
import { api } from './api.js';

const REDES = ['instagram', 'facebook', 'youtube'];
let pedido = null;

// Una sola consulta por página. Si falla, null: queda lo que dice el HTML.
export function datosDeContacto() {
  pedido ??= api('/api/configuracion/contacto').catch(() => null);
  return pedido;
}

export function enlaceWhatsApp(datos, texto) {
  return datos.enlaces.whatsapp + (texto ? '?text=' + encodeURIComponent(texto) : '');
}

const lugar = (direccion) => encodeURIComponent(`${direccion}, Buenos Aires`);

function destino(datos, clave, nodo) {
  switch (clave) {
    case 'telefono': return datos.enlaces.telefono;
    case 'whatsapp': return enlaceWhatsApp(datos, nodo.dataset.whatsappTexto);
    case 'email': return datos.email ? 'mailto:' + datos.email : null;
    case 'mapa': return `https://www.google.com/maps/search/?api=1&query=${lugar(datos.direccion)}`;
    default: return datos[clave] ?? null;   // las redes
  }
}

export async function aplicarContacto(raiz = document) {
  const datos = await datosDeContacto();
  if (!datos) return;

  for (const nodo of raiz.querySelectorAll('[data-contacto]')) {
    const valor = datos[nodo.dataset.contacto];
    if (valor) nodo.textContent = valor;
  }
  for (const nodo of raiz.querySelectorAll('[data-contacto-enlace]')) {
    const href = destino(datos, nodo.dataset.contactoEnlace, nodo);
    if (href) nodo.href = href;
    (nodo.closest('[data-contacto-caja]') ?? nodo.closest('li') ?? nodo).hidden = !href;
  }
  for (const mapa of raiz.querySelectorAll('[data-contacto-mapa]')) {
    mapa.src = `https://www.google.com/maps?q=${lugar(datos.direccion)}&output=embed`;
    mapa.title = `Mapa: HuellaVet, ${datos.direccion}`;
  }
  for (const bloque of raiz.querySelectorAll('[data-contacto-redes]')) {
    bloque.hidden = !REDES.some((red) => datos[red]);
  }
}

aplicarContacto();
