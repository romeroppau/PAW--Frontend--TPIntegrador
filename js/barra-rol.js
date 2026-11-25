/**
 * barra-rol.js — La barra de "Mi panel" en todas las pantallas, para quien tiene sesión.
 *
 * Con sesión, auth.js llama a dibujarBarra(usuario): el encabezado de la página (el del sitio o el
 * de un panel) se reemplaza por la cabecera del panel y la barra con un menú desplegable por sección.
 * Así el cliente, la rescatista y la veterinaria ven siempre su panel, en cualquier pantalla.
 * Sin sesión no se toca nada: queda el encabezado público (layout.js o el del HTML).
 *
 * Para sumar una opción al menú de un rol, se agrega una fila en MENUS. Es solo presentación:
 * quién puede ver o modificar qué lo decide el backend en cada endpoint.
 */
import { el } from './ui.js';
import { aplicarContacto } from './contacto.js';

// el() de ui.js con hijos: crea el elemento y le agrega los nodos que se le pasan.
function h(tag, texto = '', atributos = {}, hijos = []) {
  const nodo = el(tag, texto, atributos);
  nodo.append(...hijos);
  return nodo;
}

// El número es el que cargó la veterinaria en Configuración: lo cambia aplicarContacto() al dibujar la barra.
const WA_TURNO = 'https://wa.me/5491139010486?text=Hola%2C%20quiero%20solicitar%20un%20turno';

/**
 * Menú de cada rol. Cada sección: [id, título, descripción, enlaces]; cada enlace: [texto, destino]
 * (con un tercer valor true si abre otro sitio, como WhatsApp).
 * carrito: muestra el enlace "Carrito (N)". contacto: muestra "Contactanos" (la sección del panel).
 */
export const MENUS = {
  VETERINARIO: {
    inicio: '/paneles/panel-administrador.html',
    nombre: 'Panel de administrador',
    secciones: [
      ['agenda', 'Agenda', 'Turnos y consultas del día.', [
        ['Agenda de turnos', '/panel/agenda.html']]],
      ['pacientes', 'Mis pacientes', 'Clientes, mascotas y su historia clínica.', [
        ['Clientes', '/panel/clientes.html'],
        ['Ficha de mascotas', '/cliente/mascotas.html'],
        ['Historial clínico', '/panel/historial-clinico.html'],
        ['Calendario sanitario', '/cliente/calendario.html']]],
      // Inventario (24/11): Productos e Insumos, cada uno con su stock y sus movimientos. La Tienda
      // queda solo con las ventas, y Reportes con el análisis (sin el stock).
      ['productos', 'Productos', 'Los productos, su stock y sus movimientos.', [
        ['Productos y stock', '/panel/productos.html'],
        ['Movimientos', '/panel/productos-movimientos.html']]],
      ['insumos', 'Insumos', 'Lo que se usa en las consultas.', [
        ['Insumos y stock', '/panel/insumos.html'],
        ['Movimientos', '/panel/insumo-movimientos.html']]],
      ['tienda', 'Tienda', 'Las ventas de la tienda web.', [
        ['Ventas y pedidos para retirar', '/panel/ventas.html']]],
      ['reportes', 'Reportes', 'Sugerencias y turnos atendidos.', [
        ['Qué promocionar', '/panel/reportes.html#promocionar'],
        ['Qué liquidar', '/panel/reportes.html#liquidar'],
        ['Promociones publicadas', '/panel/reportes.html#promociones'],
        ['Turnos atendidos', '/panel/reportes.html#turnos-atendidos']]],
      ['rescatistas', 'Rescatistas', 'Cuentas de rescatistas por aprobar.', [
        ['Solicitudes pendientes', '/panel/adopciones.html#rescatistas']]],
      ['adopcion', 'Adopción', 'Publicaciones y adopciones.', [
        ['Moderar publicaciones', '/panel/adopciones.html#moderacion'],
        ['Adopciones en curso', '/panel/adopciones.html#en-curso'],
        ['Adopciones finalizadas', '/panel/adopciones.html#finalizadas']]],
      ['notificaciones', 'Notificaciones', 'Alertas y novedades administrativas.', [
        ['Ver mis notificaciones', '/cuenta/notificaciones.html']]],
      ['configuracion', 'Configuración', 'Cómo funciona la veterinaria.', [
        ['Turnos, avisos, stock, tienda y datos de la veterinaria', '/panel/configuracion.html']]],
      ['resenas', 'Reseñas', 'Lo que opinan los clientes; desde ahí las respondés.', [
        ['Ver reseñas', '/resenas/resenas.html']]],
    ],
  },
  CLIENTE: {
    inicio: '/paneles/panel-cliente.html',
    nombre: 'Panel de cliente',
    carrito: true,
    contacto: true,
    secciones: [
      ['cuenta', 'Mi cuenta', 'Tus datos personales.', [
        ['Datos personales', '/cuenta/mis-datos.html']]],
      ['mascotas', 'Mis mascotas', 'Fichas, historia clínica, facturas y vacunas.', [
        ['Fichas de mis mascotas', '/cliente/mascotas.html'],
        ['Historial clínico y facturas', '/cliente/historial.html'],
        ['Calendario sanitario', '/cliente/calendario.html']]],
      ['turnos', 'Turnos', 'Tus turnos y cómo pedir uno.', [
        ['Mis turnos', '/cliente/turnos.html'],
        ['Ver descuentos', '/cliente/descuentos.html'],
        ['Pedir turno por WhatsApp', WA_TURNO, true]]],
      // Tienda (24/11): promociones, catálogo y Mis compras (antes estaba en Mi cuenta).
      ['tienda', 'Tienda', 'Productos para tu mascota y tus compras.', [
        ['Promociones', '/catalogo/promociones.html'],
        ['Ver catálogo de productos', '/catalogo/catalogo.html', false, [
          ['Medicamentos', '/catalogo/catalogo.html?categoria=MEDICAMENTO'],
          ['Alimento balanceado', '/catalogo/catalogo.html?categoria=ALIMENTO'],
          ['Accesorios', '/catalogo/catalogo.html?categoria=ACCESORIO']]],
        ['Mis compras', '/tienda/compras.html']]],
      ['adopcion', 'Adopción', 'Animales que buscan familia.', [
        ['Animales disponibles', '/adopciones/adopciones.html'],
        ['Mis postulaciones', '/adopciones/adopciones.html#seccion-mias']]],
      ['notificaciones', 'Notificaciones', 'Turnos, compras y actividad de la cuenta.', [
        ['Ver mis notificaciones', '/cuenta/notificaciones.html']]],
      ['resenas', 'Reseñas', 'Contanos cómo te atendimos.', [
        ['Escribir reseña', '/resenas/escribir.html'],
        ['Ver reseñas', '/resenas/resenas.html']]],
    ],
  },
  RESCATISTA: {
    inicio: '/paneles/panel-rescatista.html',
    nombre: 'Panel de rescatista',
    carrito: true,
    contacto: true,
    secciones: [
      ['cuenta', 'Mi cuenta', 'Tus datos de contacto.', [
        ['Datos personales', '/cuenta/mis-datos.html']]],
      ['publicaciones', 'Mis publicaciones', 'Publicá animales, elegí adoptantes y seguí cada adopción.', [
        ['Publicaciones, postulantes y adopciones', '/rescatista/publicaciones.html'],
        ['Mis mascotas', '/cliente/mascotas.html']]],
      ['tienda', 'Tienda', 'También podés comprar en la tienda.', [
        ['Promociones', '/catalogo/promociones.html'],
        ['Ver catálogo de productos', '/catalogo/catalogo.html', false, [
          ['Medicamentos', '/catalogo/catalogo.html?categoria=MEDICAMENTO'],
          ['Alimento balanceado', '/catalogo/catalogo.html?categoria=ALIMENTO'],
          ['Accesorios', '/catalogo/catalogo.html?categoria=ACCESORIO']]],
        ['Mis compras', '/tienda/compras.html']]],
      ['notificaciones', 'Notificaciones', 'Publicaciones, postulaciones y adopciones.', [
        ['Ver mis notificaciones', '/cuenta/notificaciones.html']]],
      ['resenas', 'Reseñas', 'Contanos cómo te atendimos.', [
        ['Escribir reseña', '/resenas/escribir.html'],
        ['Ver reseñas', '/resenas/resenas.html']]],
    ],
  },
};

// Lo que pide iniciar sesión lleva al login, que después vuelve a esa pantalla (?volver=).
const conSesion = (destino) => '/login/login.html?volver=' + encodeURIComponent(destino);

/**
 * Menú de quien no inició sesión (24/11): las mismas secciones y el mismo diseño que el del cliente,
 * sin lo que es de una cuenta (Mis compras, Mi cuenta, Mis mascotas…). "Mis postulaciones" y
 * "Escribir reseña" piden iniciar sesión. "Contactanos" lleva a esa sección de la portada.
 */
export const MENU_PUBLICO = {
  inicio: '/index.html',
  contacto: true,
  secciones: [
    ['tienda', 'Tienda', 'Productos para tu mascota.', [
      ['Promociones', '/catalogo/promociones.html'],
      ['Ver catálogo de productos', '/catalogo/catalogo.html', false, [
        ['Medicamentos', '/catalogo/catalogo.html?categoria=MEDICAMENTO'],
        ['Alimento balanceado', '/catalogo/catalogo.html?categoria=ALIMENTO'],
        ['Accesorios', '/catalogo/catalogo.html?categoria=ACCESORIO']]]]],
    ['adopcion', 'Adopción', 'Animales que buscan familia.', [
      ['Animales disponibles', '/adopciones/adopciones.html'],
      ['Mis postulaciones', conSesion('/adopciones/adopciones.html#seccion-mias')]]],
    ['resenas', 'Reseñas', 'Lo que opinan nuestros clientes.', [
      ['Escribir reseña', conSesion('/resenas/escribir.html')],
      ['Ver reseñas', '/resenas/resenas.html']]],
  ],
};

/** Página de inicio ("Mi panel") de un rol, o null si no tiene. */
export function inicioDe(rol) {
  return MENUS[rol]?.inicio ?? null;
}

function enlaceExterno(texto, destino) {
  const enlace = el('a', texto, { href: destino, target: '_blank', rel: 'noopener noreferrer' });
  if (destino.startsWith('https://wa.me/')) {
    enlace.dataset.contactoEnlace = 'whatsapp';
    enlace.dataset.whatsappTexto = new URL(destino).searchParams.get('text') ?? '';
  }
  return enlace;
}

function seccion([id, titulo, descripcion, enlaces]) {
  const opciones = el('ul', '', { class: 'panel-opciones' });
  for (const [texto, destino, externo, subopciones] of enlaces) {
    const item = h('li', '', {}, [externo ? enlaceExterno(texto, destino) : el('a', texto, { href: destino })]);
    if (subopciones) {
      const sub = el('ul', '', { class: 'panel-subopciones' });
      for (const [t, d] of subopciones) sub.append(h('li', '', {}, [el('a', t, { href: d })]));
      item.append(sub);
    }
    opciones.append(item);
  }
  const caja = h('div', '', { class: 'panel-desplegable-caja' }, [
    el('p', descripcion, { class: 'panel-desplegable-desc' }),
    opciones,
  ]);
  // id con prefijo: las pantallas usan ids como "publicaciones" o "tienda" para su propio contenido.
  const desplegable = h('details', '', { class: 'panel-desplegable', id: `menu-${id}`, name: 'panel-menu' }, [
    el('summary', titulo),
    caja,
  ]);
  return h('li', '', {}, [desplegable]);
}

/**
 * Reemplaza el encabezado de la página por la cabecera del panel y la barra del rol.
 * Devuelve false si el rol no tiene panel (y no toca nada).
 */
export function dibujarBarra(usuario) {
  const menu = MENUS[usuario?.rol];
  if (!menu) return false;
  return dibujar(menu, [
    el('a', 'HuellaVet', { class: 'panel-marca', href: menu.inicio, title: 'Mi panel' }),
    el('a', menu.nombre, { class: 'panel-usuario', href: menu.inicio }),
    // auth.js lo rellena con el nombre del usuario y "Salir"; notificaciones.js agrega la campana.
    el('div', '', { class: 'sesion', id: 'sesion' }),
  ]);
}

/**
 * Sin sesión (24/11): la misma cabecera y la misma barra que con sesión, con el menú público
 * (MENU_PUBLICO) y los botones "Inicia sesión" y "Registro". Si después resulta que hay sesión,
 * dibujarBarra() la reemplaza por la del rol.
 */
export function dibujarBarraPublica() {
  const sesion = h('div', '', { class: 'sesion', id: 'sesion' }, [
    el('a', 'Inicia sesión', { class: 'boton boton-borde', href: '/login/login.html' }),
    el('a', 'Registro', { class: 'boton', href: '/registros/registro.html' }),
  ]);
  return dibujar(MENU_PUBLICO, [
    el('a', 'HuellaVet', { class: 'panel-marca', href: '/index.html', title: 'Inicio' }),
    sesion,
  ]);
}

function dibujar(menu, contenidoCabecera) {
  const actual = document.querySelector('header.encabezado, header.panel-cabecera');
  if (!actual) return false;

  const cabecera = h('header', '', { class: 'panel-cabecera' }, [
    h('div', '', { class: 'contenedor' }, contenidoCabecera),
  ]);

  // id="menu": las pruebas y otras pantallas buscan acá los enlaces del rol.
  const lista = el('ul', '', { class: 'contenedor panel-menu', id: 'menu' });
  lista.append(...menu.secciones.map(seccion));
  if (menu.carrito) {
    lista.append(h('li', '', {}, [el('a', 'Carrito', { class: 'panel-menu-enlace', id: 'enlace-carrito', href: '/tienda/carrito.html' })]));
  }
  if (menu.contacto) {
    lista.append(h('li', '', {}, [el('a', 'Contactanos', { class: 'panel-menu-enlace', href: `${menu.inicio}#contacto` })]));
  }
  const barra = h('nav', '', { class: 'panel-nav', 'aria-label': menu.nombre ? `Menú: ${menu.nombre}` : 'Menú principal' }, [lista]);

  document.querySelector('nav.panel-nav')?.remove();   // la de un panel, si la página ya traía una
  actual.replaceWith(cabecera, barra);

  // "← Volver a mi panel" de las pantallas compartidas por varios roles (Mascotas, Historial…).
  for (const enlace of document.querySelectorAll('a[data-volver-panel]')) enlace.href = menu.inicio;

  activarDesplegables();
  aplicarContacto(barra);
  document.querySelectorAll('.pestanas-seccion').forEach((n) => n.remove());   // si se redibuja
  pestanasDeSeccion(menu);
  return true;
}

/**
 * Pestañas de la sección: si la página es una de las opciones de una sección del menú que tiene
 * varias páginas (por ejemplo Productos: "Productos y stock" y "Movimientos"), arriba del contenido
 * aparecen todas como pestañas, con la actual marcada. Salen del mismo MENUS, así nunca se
 * desincronizan del desplegable. Las secciones cuyas opciones son partes de una misma página
 * (Reportes, Adopción: #liquidar, #en-curso…) no las necesitan: esa página ya tiene sus pestañas.
 * Los enlaces externos (WhatsApp) no son pestañas.
 */
function pestanasDeSeccion(menu) {
  const contenedor = document.querySelector('main .contenedor') ?? document.querySelector('main');
  if (!contenedor) return;

  for (const [, titulo, , enlaces] of menu.secciones) {
    // Ni los externos (WhatsApp) ni los que piden iniciar sesión (llevan al login) son pestañas.
    const internos = enlaces.filter(([, destino, externo]) => !externo)
      .map(([texto, destino]) => ({ texto, url: new URL(destino, location.origin) }))
      .filter((e) => e.url.pathname !== '/login/login.html');
    const paginas = new Set(internos.map((e) => e.url.pathname));
    if (paginas.size < 2) continue;
    const actual = internos.find((e) => e.url.pathname === location.pathname);
    if (!actual) continue;

    const nav = el('nav', '', { class: 'pestanas pestanas-seccion', 'aria-label': `Secciones de ${titulo}` });
    for (const e of internos) {
      const a = el('a', e.texto, { href: e.url.pathname + e.url.search + e.url.hash });
      if (e === actual) a.setAttribute('aria-current', 'page');
      nav.append(a);
    }
    // Después del "← Volver a mi panel" del principio, si lo hay; si no, al principio.
    const primero = contenedor.firstElementChild;
    const esVolver = primero?.tagName === 'P' && primero.children.length === 1 && primero.firstElementChild.tagName === 'A';
    if (esVolver) primero.after(nav); else contenedor.prepend(nav);
    return;
  }
}

/**
 * Que la caja no se salga de la pantalla: si sobra por la derecha, se corre hacia la izquierda
 * (sin pasarse del borde izquierdo). En celular la caja ya ocupa todo el ancho y no se toca.
 */
function acomodar(desplegable) {
  const caja = desplegable.querySelector('.panel-desplegable-caja');
  caja.style.left = '';
  if (getComputedStyle(desplegable).position === 'static') return;

  const margen = 12;
  const { left, right } = caja.getBoundingClientRect();
  const sobra = right - (document.documentElement.clientWidth - margen);
  if (sobra > 0) caja.style.left = `${-Math.min(sobra, left - margen)}px`;
}

/**
 * Comodidades de los desplegables (el navegador ya los abre y cierra con clic, Enter o Espacio):
 * se abre de a uno, un clic afuera o Escape lo cierra, y #seccion en la dirección (p. ej.
 * panel-cliente.html#tienda) abre esa sección.
 */
function activarDesplegables() {
  const desplegables = [...document.querySelectorAll('.panel-desplegable')];
  const cerrarTodos = (excepto = null) => desplegables.forEach((d) => { if (d !== excepto) d.open = false; });

  for (const d of desplegables) {
    d.addEventListener('toggle', () => {
      if (!d.open) return;
      cerrarTodos(d);
      acomodar(d);
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

  const abrirSegunDireccion = () => {
    const destino = desplegables.find((d) => d.id === `menu-${decodeURIComponent(location.hash.slice(1))}`);
    if (destino) destino.open = true;
  };
  abrirSegunDireccion();
  window.addEventListener('hashchange', abrirSegunDireccion);
}
