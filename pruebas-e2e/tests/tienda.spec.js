// Tienda (Entrega 5, rol 2): agregar al carrito desde el catálogo y el detalle, el carrito con la
// política de cancelación, la compra con la cuenta regresiva, mis compras y las ventas de la veterinaria.
// Contrato de la API: repo Inventario, docs/api/contrato-tienda.md.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion, abrirSeccion, PRODUCTOS } = require('./ayudas');

const CLIENTE = { id: 102, nombre: 'Cliente de Prueba', email: 'c@prueba.huellavet', rol: 'CLIENTE' };
const RESCATISTA = { id: 104, nombre: 'Rescatista', email: 'r@prueba.huellavet', rol: 'RESCATISTA' };
const VET = { id: 101, nombre: 'Veterinaria de Prueba', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };

const VACIO = { items: [], total: 0 };
const item = (producto_id, nombre, precio_unitario, cantidad, extra = {}) => ({
  producto_id, nombre, precio_unitario, cantidad, subtotal: Math.round(precio_unitario * cantidad * 100) / 100,
  stock: 20, a_la_venta: true, ...extra,
});
const CARRITO = {
  items: [item(101, 'Alimento cachorro 3 kg', 15999.9, 2, { tiene_imagen: true }), item(110, 'Collar ajustable', 5200, 1)],
  total: 37199.8,
  minutos_para_pagar: 15,
  retirar_hasta_si_compra_hoy: '2026-11-25',
};

/** Catálogo con los productos de ejemplo (y uno sin stock). */
async function simularCatalogo(page) {
  const productos = [...PRODUCTOS, { id: 104, nombre: 'Alimento gatito 1,5 kg', categoria: 'ALIMENTO', especie: 'GATO', precio: 9999, vencimiento: null, disponible: false }];
  await page.route('**/api/tienda/productos?*', (route) => responderJson(route, { datos: productos, pagina: 1, por_pagina: 12, total: productos.length }));
}

// ---------- Catálogo y detalle ----------

test('el catálogo usa la barra del sitio; sin sesión, "Agregar" lleva a iniciar sesión y vuelve', async ({ page }) => {
  await simularSesion(page, null);
  await simularCatalogo(page);
  await page.goto('/catalogo/catalogo.html');

  await expect(page.locator('#sesion')).toContainText('Inicia sesión');
  await page.getByRole('button', { name: 'Agregar Alimento cachorro 3 kg al carrito' }).click();
  await expect(page).toHaveURL('/login/login.html?volver=%2Fcatalogo%2Fcatalogo.html');
});

test('un cliente agrega desde la tarjeta y el menú muestra "Carrito (N)"', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await simularCatalogo(page);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  let cuerpo = null;
  await page.route('**/api/tienda/carrito/items', (route) => {
    cuerpo = route.request().postDataJSON();
    return responderJson(route, { items: [item(101, 'Alimento cachorro 3 kg', 15999.9, 1)], total: 15999.9 });
  });
  await page.goto('/catalogo/catalogo.html');

  await expect(page.locator('#enlace-carrito')).toHaveText('Carrito');
  await page.getByRole('button', { name: 'Agregar Alimento cachorro 3 kg al carrito' }).click();
  await expect(page.locator('#aviso-carrito')).toHaveText('Agregaste Alimento cachorro 3 kg al carrito.');
  await expect(page.locator('#enlace-carrito')).toHaveText('Carrito (1)');
  expect(cuerpo).toEqual({ producto_id: 101, cantidad: 1 });

  // Sin stock: el botón queda apagado.
  await expect(page.getByRole('button', { name: 'Sin stock' })).toBeDisabled();
});

test('la veterinaria no ve "Agregar" y tiene "Ventas" en el menú', async ({ page }) => {
  await simularSesion(page, VET);
  await simularCatalogo(page);
  await page.goto('/catalogo/catalogo.html');

  await expect(page.locator('#lista > li')).toHaveCount(4);
  await expect(page.locator('.boton-agregar').first()).toBeHidden();
  await expect(page.locator('#menu')).toContainText('Ventas');
  await expect(page.locator('#enlace-carrito')).toHaveCount(0);
});

test('el detalle agrega la cantidad elegida y avisa si no alcanza el stock', async ({ page }) => {
  await simularSesion(page, RESCATISTA);
  await page.route('**/api/tienda/productos/101', (route) => responderJson(route, { ...PRODUCTOS[0], descripcion: 'Rico.' }));
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  const cantidades = [];
  await page.route('**/api/tienda/carrito/items', (route) => {
    const { cantidad } = route.request().postDataJSON();
    cantidades.push(cantidad);
    return cantidad > 5
      ? responderJson(route, { error: 'Stock insuficiente', stock: 5 }, 409)
      : responderJson(route, { items: [item(101, 'Alimento cachorro 3 kg', 15999.9, cantidad)], total: 15999.9 * cantidad });
  });
  await page.goto('/catalogo/producto.html?id=101');

  await page.getByLabel('Cantidad').fill('3');
  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(page.locator('#aviso-carrito')).toHaveText('Agregaste Alimento cachorro 3 kg al carrito.');
  await expect(page.locator('#enlace-carrito')).toHaveText('Carrito (3)');

  await page.getByLabel('Cantidad').fill('9');
  await page.getByRole('button', { name: 'Agregar al carrito' }).click();
  await expect(page.locator('#aviso-carrito')).toContainText('quedan 5');
  expect(cantidades).toEqual([3, 9]);
});

test('el detalle de un producto sin stock no deja agregarlo', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/productos/104', (route) => responderJson(route, { id: 104, nombre: 'Alimento gatito', categoria: 'ALIMENTO', especie: 'GATO', precio: 9999, disponible: false }));
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  await page.goto('/catalogo/producto.html?id=104');
  await expect(page.locator('#boton-agregar')).toHaveText('Sin stock');
  await expect(page.locator('#boton-agregar')).toBeDisabled();
});

// ---------- Login: volver a donde estaba ----------

test('después de iniciar sesión vuelve al producto; un "volver" a otro sitio se ignora', async ({ page }) => {
  // La sesión existe recién después de iniciarla (así el panel del cliente no vuelve a mandar a login).
  let conSesion = false;
  await page.route('**/api/auth/yo', (route) => conSesion
    ? responderJson(route, { ...CLIENTE, csrf: 'x' })
    : responderJson(route, { error: 'No autenticado' }, 401));
  await page.route('**/api/auth/login', (route) => { conSesion = true; return responderJson(route, { ...CLIENTE, csrf: 'x' }); });
  await page.route('**/api/tienda/productos/101', (route) => responderJson(route, PRODUCTOS[0]));
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));

  await page.goto('/login/login.html?volver=%2Fcatalogo%2Fproducto.html%3Fid%3D101');
  await page.getByLabel('Email').fill('c@prueba.huellavet');
  await page.locator('#password').fill('una-clave');
  await page.getByRole('button', { name: /Ingresar|Iniciar sesión/ }).click();
  await expect(page).toHaveURL('/catalogo/producto.html?id=101');

  conSesion = false;
  await page.goto('/login/login.html?volver=%2F%2Fsitio-falso.com');
  await page.getByLabel('Email').fill('c@prueba.huellavet');
  await page.locator('#password').fill('una-clave');
  await page.getByRole('button', { name: /Ingresar|Iniciar sesión/ }).click();
  await expect(page).toHaveURL('/paneles/panel-cliente.html');
});

// ---------- Carrito ----------

test('el carrito: cambiar cantidad, quitar, y "Ir a pagar" solo después de aceptar la política', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  let carrito = structuredClone(CARRITO);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, carrito));
  const pedidos = [];
  await page.route('**/api/tienda/carrito/items/*', (route) => {
    const req = route.request();
    pedidos.push(`${req.method()} ${new URL(req.url()).pathname}`);
    if (req.method() === 'PUT') carrito.items[0] = item(101, 'Alimento cachorro 3 kg', 15999.9, req.postDataJSON().cantidad);
    if (req.method() === 'DELETE') carrito.items = carrito.items.filter((i) => i.producto_id !== 110);
    carrito.total = carrito.items.reduce((s, i) => s + i.subtotal, 0);
    return responderJson(route, carrito);
  });
  await page.route('**/api/tienda/carrito/confirmar', (route) => responderJson(route, { numero: 'V-000105', estado: 'PENDIENTE_PAGO' }, 201));
  // "Ir a pagar" lleva directo al pago (en la prueba, la página del pago simulado).
  await page.route('**/api/tienda/compras/V-000105/pago', (route) => responderJson(route, { url: '/tienda/pago-simulado.html?numero=V-000105' }));
  await page.route('**/api/tienda/compras/V-000105', (route) => responderJson(route, {
    numero: 'V-000105', estado: 'PENDIENTE_PAGO', fecha: '2026-11-18 10:30:00', total: 47999.7,
    pagar_antes_de: '2099-01-01 00:00:00', retirar_hasta: '2026-11-25', entregada_en: null, items: [],
  }));

  // La foto del producto 101 (un PNG de 1x1).
  await page.route('**/api/tienda/productos/101/imagen', (route) => route.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
  }));
  await page.goto('/tienda/carrito.html');
  await expect(page.locator('#filas > li')).toHaveCount(2);
  await expect(page.locator('#total')).toHaveText(/37\.199,80/);
  await expect(page.locator('#politica')).toContainText('5 días hábiles');
  await expect(page.locator('#enlace-carrito')).toHaveText('Carrito (3)');

  // Cada fila: foto (o la huellita si no tiene), nombre, precio por unidad y subtotal.
  const primera = page.locator('#filas > li').first();
  await expect(primera.locator('img')).toHaveAttribute('src', '/api/tienda/productos/101/imagen');
  await expect(primera).toContainText('$ 15.999,90 c/u');
  await expect(primera).toContainText(/31\.999,80/);
  await expect(page.locator('#filas > li').nth(1).locator('img')).toHaveCount(0);

  // El resumen: productos, plazos con la fecha concreta.
  await expect(page.locator('#unidades')).toHaveText('3 productos');
  await expect(page.locator('#minutos')).toHaveText('15 minutos');
  await expect(page.locator('#retirar-hasta')).toHaveText('miércoles 25/11');

  // − está apagado con 1 unidad; + suma de a uno.
  await expect(page.getByRole('button', { name: 'Restar uno de Collar ajustable' })).toBeDisabled();
  await page.getByRole('button', { name: 'Sumar uno de Alimento cachorro 3 kg' }).click();
  await expect(page.getByLabel('Cantidad de Alimento cachorro 3 kg')).toHaveValue('3');

  await page.getByLabel('Cantidad de Alimento cachorro 3 kg').fill('4');
  await page.getByLabel('Cantidad de Alimento cachorro 3 kg').press('Tab');
  await expect(page.locator('#total')).toHaveText(/69\.199,60/);

  await page.getByRole('button', { name: 'Quitar Collar ajustable del carrito' }).click();
  await expect(page.locator('#filas > li')).toHaveCount(1);
  expect(pedidos).toEqual(['PUT /api/tienda/carrito/items/101', 'PUT /api/tienda/carrito/items/101', 'DELETE /api/tienda/carrito/items/110']);

  const pagar = page.getByRole('button', { name: 'Ir a pagar' });
  await expect(pagar).toBeDisabled();
  await page.getByLabel('Leí y acepto la política de cancelación').check();
  await expect(pagar).toBeEnabled();
  await pagar.click();
  await expect(page).toHaveURL('/tienda/pago-simulado.html?numero=V-000105');
});

test('un producto que ya no está a la venta bloquea el pago hasta quitarlo', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, {
    items: [item(106, 'Antiparasitario', 7800, 1, { a_la_venta: false })], total: 7800,
  }));
  await page.goto('/tienda/carrito.html');

  await expect(page.locator('#filas')).toContainText('Ya no está a la venta');
  await page.getByLabel('Leí y acepto la política de cancelación').check();
  await expect(page.getByRole('button', { name: 'Ir a pagar' })).toBeDisabled();
  await expect(page.locator('#motivo-bloqueo')).toContainText('Quitá los productos');
});

test('si otro se llevó el stock al ir a pagar, dice de qué producto', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, CARRITO));
  await page.route('**/api/tienda/carrito/confirmar', (route) => responderJson(route, {
    error: 'Stock insuficiente', items: [{ producto_id: 110, nombre: 'Collar ajustable', pedido: 1, stock: 0 }],
  }, 409));
  await page.goto('/tienda/carrito.html');
  await page.getByLabel('Leí y acepto la política de cancelación').check();
  await page.getByRole('button', { name: 'Ir a pagar' }).click();
  await expect(page.locator('#error')).toContainText('Collar ajustable (pediste 1, no queda ninguno)');
});

test('el carrito vacío invita a ver productos', async ({ page }) => {
  await simularSesion(page, RESCATISTA);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  await page.goto('/tienda/carrito.html');
  await expect(page.locator('#vacio')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver productos' })).toHaveAttribute('href', '/catalogo/catalogo.html');
});

// ---------- Una compra ----------

const PENDIENTE = {
  numero: 'V-000105', estado: 'PENDIENTE_PAGO', fecha: '2026-11-18 10:30:00', total: 31999.8,
  pagar_antes_de: '2026-11-18 10:45:00', retirar_hasta: '2026-11-25', entregada_en: null,
  items: [{ producto_id: 101, nombre: 'Alimento cachorro 3 kg', precio_unitario: 15999.9, cantidad: 2, subtotal: 31999.8 }],
};

test('esperando el pago: la cuenta regresiva baja y, al llegar a cero, se ve cancelada', async ({ page }) => {
  // Reloj simulado y quieto a las 10:30 (avanza solo con runFor): la compra vence a las 10:45.
  await page.clock.install({ time: new Date('2026-11-18T10:29:00-03:00') });
  await page.clock.pauseAt(new Date('2026-11-18T10:30:00-03:00'));
  await simularSesion(page, CLIENTE);
  let compra = PENDIENTE;
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  await page.route('**/api/tienda/compras/V-000105', (route) => responderJson(route, compra));
  await page.goto('/tienda/compra.html?numero=V-000105');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Compra V-000105');
  await expect(page.locator('#estado-compra')).toHaveText('Esperando el pago');
  await expect(page.getByRole('timer')).toHaveText('15:00');
  await page.clock.runFor(61_000);
  await expect(page.getByRole('timer')).toHaveText('13:59');

  compra = { ...PENDIENTE, estado: 'CANCELADA', pagar_antes_de: null, retirar_hasta: null };
  await page.clock.runFor(14 * 60_000);
  await expect(page.locator('#estado-compra')).toHaveText('Cancelada');
  await expect(page.locator('#aviso')).toContainText('Se terminó el tiempo para pagar');
  await expect(page.locator('#pendiente')).toBeHidden();
});

test('"Pagar con Mercado Pago" lleva a pagar; al volver aprobado se confirma el pago y se ve el comprobante', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  await page.route('**/api/tienda/compras/V-000105', (route) => responderJson(route, { ...PENDIENTE, segundos_para_pagar: 600 }));
  await page.route('**/api/tienda/compras/V-000105/pago', (route) => responderJson(route, { url: '/tienda/pago-simulado.html?numero=V-000105' }));
  await page.goto('/tienda/compra.html?numero=V-000105');
  await page.getByRole('button', { name: 'Pagar con Mercado Pago' }).click();
  await expect(page).toHaveURL('/tienda/pago-simulado.html?numero=V-000105');

  // Vuelta de Mercado Pago con el número de pago: la página le pide al servidor que lo confirme.
  let confirmado = null;
  await page.route('**/api/tienda/compras/V-000105/pago/confirmar', (route) => {
    confirmado = route.request().postDataJSON();
    return responderJson(route, { ...PENDIENTE, estado: 'PAGADA', pagar_antes_de: null, segundos_para_pagar: null, operacion_mp: '123456789' });
  });
  await page.goto('/tienda/compra.html?numero=V-000105&payment_id=123456789&status=approved');
  await expect(page.locator('#estado-compra')).toHaveText('Lista para retirar');
  await expect(page.locator('#resultado-pago')).toHaveText('¡Listo! Tu pago se acreditó y el pedido está listo para retirar.');
  await expect(page.locator('#aviso')).toContainText('Pagaste con Mercado Pago · operación N° 123456789.');
  expect(confirmado).toEqual({ payment_id: '123456789' });
  await expect(page).toHaveURL('/tienda/compra.html?numero=V-000105');   // sin payment_id: recargar no repite
});

test('al volver con el pago rechazado se avisa y se puede reintentar', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  await page.route('**/api/tienda/compras/V-000105/pago/confirmar', (route) => responderJson(route, { ...PENDIENTE, segundos_para_pagar: 500 }));
  await page.route('**/api/tienda/compras/V-000105', (route) => responderJson(route, { ...PENDIENTE, segundos_para_pagar: 500 }));
  await page.goto('/tienda/compra.html?numero=V-000105&payment_id=987654321&status=rejected');
  await expect(page.locator('#resultado-pago')).toHaveText('El pago fue rechazado. Volvé a intentarlo antes de que termine el tiempo.');
  await expect(page.locator('#estado-compra')).toHaveText('Esperando el pago');
  await expect(page.getByRole('button', { name: 'Pagar con Mercado Pago' })).toBeVisible();
});

test('el pago simulado aprueba y vuelve a la compra', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  let cuerpo = null;
  await page.route('**/api/tienda/pagos/simulado', (route) => {
    cuerpo = route.request().postDataJSON();
    return responderJson(route, { ...PENDIENTE, estado: 'PAGADA', resultado: 'aprobado' });
  });
  await page.route('**/api/tienda/compras/V-000105', (route) => responderJson(route, { ...PENDIENTE, estado: 'PAGADA', pagar_antes_de: null, segundos_para_pagar: null }));
  await page.goto('/tienda/pago-simulado.html?numero=V-000105');
  await page.getByRole('button', { name: 'Aprobar el pago' }).click();
  await expect(page).toHaveURL('/tienda/compra.html?numero=V-000105&status=approved');
  expect(cuerpo).toEqual({ numero: 'V-000105', resultado: 'aprobado' });
});

test('en el último minuto ya no se puede empezar a pagar', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-18T11:59:00-03:00') });
  await page.clock.pauseAt(new Date('2026-11-18T12:00:00-03:00'));
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  await page.route('**/api/tienda/compras/V-000105', (route) => responderJson(route, { ...PENDIENTE, segundos_para_pagar: 90 }));
  await page.goto('/tienda/compra.html?numero=V-000105');

  const pagar = page.getByRole('button', { name: 'Pagar con Mercado Pago' });
  await expect(pagar).toBeEnabled();
  await page.clock.runFor(31_000);   // quedan 59 segundos
  await expect(pagar).toBeDisabled();
  await expect(page.locator('#resultado-pago')).toHaveText('Ya no queda tiempo para pagar esta compra.');
});

test('la cuenta regresiva parte de lo que dice el servidor, aunque el reloj de la computadora esté mal', async ({ page }) => {
  // La computadora cree que son las 12:00, pero el servidor dice que faltan 10 minutos.
  await page.clock.install({ time: new Date('2026-11-18T11:59:00-03:00') });
  await page.clock.pauseAt(new Date('2026-11-18T12:00:00-03:00'));
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  await page.route('**/api/tienda/compras/V-000105', (route) => responderJson(route, { ...PENDIENTE, segundos_para_pagar: 600 }));
  await page.goto('/tienda/compra.html?numero=V-000105');
  await expect(page.getByRole('timer')).toHaveText('10:00');
});

test('arrepentirse: "Cancelar compra" pide confirmación y la cancela', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  await page.route('**/api/tienda/compras/V-000105', (route) => responderJson(route, { ...PENDIENTE, pagar_antes_de: '2099-01-01 00:00:00' }));
  let cancelada = false;
  await page.route('**/api/tienda/compras/V-000105/cancelar', (route) => {
    cancelada = true;
    return responderJson(route, { ...PENDIENTE, estado: 'CANCELADA', pagar_antes_de: null, retirar_hasta: null });
  });
  await page.goto('/tienda/compra.html?numero=V-000105');

  await page.getByRole('button', { name: 'Cancelar compra' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Volver' }).click();
  expect(cancelada).toBe(false);

  await page.getByRole('button', { name: 'Cancelar compra' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar compra' }).click();
  await expect(page.locator('#estado-compra')).toHaveText('Cancelada');
  expect(cancelada).toBe(true);
});

test('una compra pagada dice hasta cuándo retirarla, con la política', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  await page.route('**/api/tienda/compras/V-000101', (route) => responderJson(route, {
    ...PENDIENTE, numero: 'V-000101', estado: 'PAGADA', pagar_antes_de: null, retirar_hasta: '2026-11-25',
  }));
  await page.goto('/tienda/compra.html?numero=V-000101');
  await expect(page.locator('#estado-compra')).toHaveText('Lista para retirar');
  await expect(page.locator('#aviso')).toHaveText('Ya podés retirarla en el local, hasta el miércoles 25/11 inclusive.');
  await expect(page.locator('#politica')).toContainText('no se reintegra');
  await expect(page.locator('#pendiente')).toBeHidden();
});

// La política de reintegro de una compra pagada de $ 14.500 (último día miércoles 25/11).
const POLITICA_REINTEGRO = {
  anticipado: 75, ultimo_momento: 50, horas: 48, anticipado_hasta: '2026-11-23 23:59:59',
  monto_anticipado: 10875, monto_ultimo_momento: 7250, porcentaje_hoy: 75, monto_hoy: 10875,
};

test('una compra pagada se puede cancelar con anticipación: se devuelve el 75 %', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-20T12:00:00-03:00') });
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  const PAGADA = {
    ...PENDIENTE, numero: 'V-000099', estado: 'PAGADA', total: 14500, pagar_antes_de: null, segundos_para_pagar: null,
    retirar_hasta: '2026-11-25', politica_reintegro: POLITICA_REINTEGRO,
  };
  await page.route('**/api/tienda/compras/V-000099', (route) => responderJson(route, PAGADA));
  let cancelada = false;
  await page.route('**/api/tienda/compras/V-000099/cancelar', (route) => {
    cancelada = true;
    return responderJson(route, {
      ...PAGADA, estado: 'CANCELADA', retirar_hasta: null, motivo_cancelacion: 'COMPRADOR', politica_reintegro: null,
      reintegro: { porcentaje: 75, monto: 10875, estado: 'HECHO' },
    });
  });
  await page.goto('/tienda/compra.html?numero=V-000099');

  await expect(page.locator('#politica')).toContainText('con 48 horas o más antes del final del último día para retirar, te devolvemos el 75 % del importe; si cancelás después, el 50 %.');
  await expect(page.locator('#ayuda-cancelar')).toHaveText('Si lo cancelás hasta el lunes 23/11 a las 23:59, te devolvemos $ 10.875,00 (el 75 %); después, $ 7.250,00 (el 50 %).');
  await page.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(page.getByRole('dialog')).toContainText('¿Cancelás el pedido V-000099? Los productos vuelven a la tienda y te devolvemos $ 10.875,00 (el 75 % de lo que pagaste).');
  await page.getByRole('dialog').getByRole('button', { name: 'Volver' }).click();
  expect(cancelada).toBe(false);

  await page.getByRole('button', { name: 'Cancelar pedido' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(page.locator('#estado-compra')).toHaveText('Cancelada');
  await expect(page.locator('#aviso')).toHaveText('Cancelaste esta compra. Te devolvimos $ 10.875,00 (el 75 %) de lo que pagaste a tu medio de pago; puede tardar unos días en verse.');
  await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toBeHidden();
  expect(cancelada).toBe(true);
});

test('cancelar a último momento devuelve el 50 % (y si Mercado Pago tarda, se ve en proceso)', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-11-24T10:00:00-03:00') });
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  const PAGADA = {
    ...PENDIENTE, numero: 'V-000099', estado: 'PAGADA', total: 14500, pagar_antes_de: null, segundos_para_pagar: null,
    retirar_hasta: '2026-11-25', politica_reintegro: { ...POLITICA_REINTEGRO, porcentaje_hoy: 50, monto_hoy: 7250 },
  };
  await page.route('**/api/tienda/compras/V-000099', (route) => responderJson(route, PAGADA));
  await page.route('**/api/tienda/compras/V-000099/cancelar', (route) => responderJson(route, {
    ...PAGADA, estado: 'CANCELADA', retirar_hasta: null, motivo_cancelacion: 'COMPRADOR', politica_reintegro: null,
    reintegro: { porcentaje: 50, monto: 7250, estado: 'PENDIENTE' },
  }));
  await page.goto('/tienda/compra.html?numero=V-000099');

  await expect(page.locator('#ayuda-cancelar')).toHaveText('Si lo cancelás, los productos vuelven a la tienda y te devolvemos $ 7.250,00 (el 50 % de lo que pagaste).');
  await page.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(page.getByRole('dialog')).toContainText('te devolvemos $ 7.250,00 (el 50 % de lo que pagaste).');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(page.locator('#aviso')).toHaveText('Cancelaste esta compra. Te vamos a devolver $ 7.250,00 (el 50 %) de lo que pagaste: lo estamos procesando con Mercado Pago.');
});

test('el reintegro se ve en Mis compras, en la factura y en Ventas', async ({ page }) => {
  const CANCELADA = {
    numero: 'V-000099', estado: 'CANCELADA', fecha: '2026-11-18 10:00:00', total: 14500, pagar_antes_de: null, retirar_hasta: null,
    motivo_cancelacion: 'COMPRADOR', tiene_factura: true, reintegro: { porcentaje: 75, monto: 10875, estado: 'HECHO' },
  };
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  await page.route('**/api/tienda/compras?*', (route) => responderJson(route, { pagina: 1, por_pagina: 20, hay_mas: false, desde: '2026-10-22', hasta: '2026-11-20', datos: [CANCELADA] }));
  await page.goto('/tienda/compras.html');
  await expect(page.locator('#filas')).toContainText('La cancelaste · reintegro de $ 10.875,00 (el 75 %)');

  await page.route('**/api/tienda/compras/V-000099/factura', (route) => responderJson(route, {
    ...CANCELADA, comprador: { nombre: 'Cliente de Prueba' }, pago: { medio: 'Mercado Pago', operacion: '123' },
    cancelada_en: '2026-11-20 11:00:00', items: [],
  }));
  await page.goto('/tienda/factura.html?numero=V-000099');
  await expect(page.locator('#dato-reintegro')).toContainText('$ 10.875,00 (el 75 %)');

  await simularSesion(page, VET);
  await page.route('**/api/inventario/compras/resumen', (route) => responderJson(route, { para_retirar: 0, vencen_hoy: 0 }));
  await page.route('**/api/inventario/compras?*', (route) => responderJson(route, {
    pagina: 1, por_pagina: 20, hay_mas: false, desde: '2026-10-22', hasta: '2026-11-20',
    datos: [{ ...CANCELADA, comprador: 'Cliente de Prueba', items: [], reintegro: { porcentaje: 50, monto: 7250, estado: 'PENDIENTE' } }],
  }));
  await page.goto('/panel/ventas.html');
  await page.getByRole('tab', { name: 'Cancelados' }).click();
  await expect(page.locator('#filas')).toContainText('La canceló el comprador · reintegro de $ 7.250,00 (el 50 %), en proceso');
});

test('mis compras: cada una con su estado, lo que hay que hacer y la factura de las pagadas', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  await page.route('**/api/tienda/compras?*', (route) => responderJson(route, {
    pagina: 1, por_pagina: 20, hay_mas: false, desde: '2026-10-22', hasta: '2026-11-20', datos: [
      { numero: 'V-000105', estado: 'PENDIENTE_PAGO', fecha: '2026-11-18 10:30:00', total: 4500, pagar_antes_de: '2026-11-18 10:45:00', retirar_hasta: '2026-11-25', tiene_factura: false },
      { numero: 'V-000101', estado: 'PAGADA', fecha: '2026-11-17 12:00:00', total: 31999.8, pagar_antes_de: null, retirar_hasta: '2026-11-24', tiene_factura: true },
      { numero: 'V-000103', estado: 'CANCELADA', fecha: '2026-11-06 09:00:00', total: 7800, pagar_antes_de: null, retirar_hasta: null, motivo_cancelacion: 'VENCIDA', tiene_factura: true },
    ],
  }));
  await page.goto('/tienda/compras.html');

  const filas = page.locator('#filas > tr');
  await expect(filas).toHaveCount(3);
  await expect(filas.nth(0)).toContainText('Esperando el pago');
  await expect(filas.nth(0)).toContainText('Pagá antes de las 10:45');
  await expect(filas.nth(1)).toContainText('Retirala hasta el martes 24/11');
  await expect(filas.nth(2)).toContainText('Cancelada');
  await expect(filas.nth(2)).toContainText('Venció el plazo de retiro');
  await expect(page.getByRole('link', { name: 'V-000101', exact: true })).toHaveAttribute('href', '/tienda/compra.html?numero=V-000101');

  // Solo las que se pagaron tienen factura (también la que se pagó y después se canceló).
  await expect(filas.nth(0).getByRole('link', { name: /factura/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ver la factura de la compra V-000101' })).toHaveAttribute('href', '/tienda/factura.html?numero=V-000101');
  await expect(page.getByRole('link', { name: 'Ver la factura de la compra V-000103' })).toBeVisible();

  // El filtro muestra las fechas que usó el servidor (los últimos 30 días); no hay más páginas.
  await expect(page.getByLabel('Desde')).toHaveValue('2026-10-22');
  await expect(page.getByLabel('Hasta')).toHaveValue('2026-11-20');
  await expect(page.getByRole('button', { name: 'Ver más' })).toBeHidden();
});

test('mis compras: filtro por fechas y "Ver más"', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  const consultas = [];
  const compra = (n) => ({ numero: `V-0001${String(n).padStart(2, '0')}`, estado: 'ENTREGADA', fecha: '2026-11-10 10:00:00', total: 1000, pagar_antes_de: null, retirar_hasta: null, tiene_factura: true });
  await page.route('**/api/tienda/compras?*', (route) => {
    const q = new URL(route.request().url()).searchParams;
    consultas.push(q.toString());
    if (q.get('desde') === '2020-01-01') return responderJson(route, { pagina: 1, por_pagina: 20, hay_mas: false, desde: '2020-01-01', hasta: '2020-01-31', datos: [] });
    const pagina = Number(q.get('pagina'));
    return responderJson(route, {
      pagina, por_pagina: 20, hay_mas: pagina === 1, desde: '2026-10-22', hasta: '2026-11-20',
      datos: pagina === 1 ? Array.from({ length: 20 }, (_, i) => compra(i)) : [compra(20), compra(21)],
    });
  });
  await page.goto('/tienda/compras.html');

  const filas = page.locator('#filas > tr');
  await expect(filas).toHaveCount(20);
  await page.getByRole('button', { name: 'Ver más' }).click();
  await expect(filas).toHaveCount(22);
  await expect(page.getByRole('button', { name: 'Ver más' })).toBeHidden();
  expect(consultas).toEqual(['pagina=1', 'pagina=2']);

  // Desde después de Hasta: no se pide nada y se avisa.
  await page.getByLabel('Desde').fill('2026-11-30');
  await page.getByLabel('Hasta').fill('2026-11-01');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page.locator('#estado')).toHaveText('La fecha "Desde" tiene que ser anterior o igual a "Hasta".');
  expect(consultas).toHaveLength(2);

  await page.getByLabel('Desde').fill('2020-01-01');
  await page.getByLabel('Hasta').fill('2020-01-31');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page.locator('#texto-vacio')).toHaveText('No hay compras entre el 01/01/2020 y el 31/01/2020.');
  await expect(page.locator('#tabla')).toBeHidden();
  expect(consultas[2]).toBe('pagina=1&desde=2020-01-01&hasta=2020-01-31');

  await page.getByRole('button', { name: 'Últimos 30 días' }).click();
  await expect(filas).toHaveCount(20);
  expect(consultas[3]).toBe('pagina=1');
});

// ---------- Factura de una compra ----------

const FACTURA = {
  numero: 'V-000101', estado: 'PAGADA', fecha: '2026-11-17 12:00:00', total: 31999.8, retirar_hasta: '2026-11-24',
  motivo_cancelacion: null, tiene_factura: true, comprador: { nombre: 'Cliente de Prueba', email: 'c@prueba.huellavet' },
  pago: { medio: 'Mercado Pago', operacion: '123456789', fecha: '2026-11-17 12:03:00' },
  entregada_en: null, entregada_por: null, cancelada_en: null,
  items: [{ producto_id: 101, nombre: 'Alimento cachorro 3 kg', cantidad: 2, precio_unitario: 15999.9, subtotal: 31999.8 }],
};

test('factura de una compra pagada: el pedido para mostrar al retirar, el pago y los productos', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  await page.route('**/api/tienda/compras/V-000101/factura', (route) => responderJson(route, FACTURA));
  await page.goto('/tienda/factura.html?numero=V-000101');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Factura V-000101');
  await expect(page.locator('#estado-factura')).toHaveText('Pagada · para retirar');
  await expect(page.locator('#para-retirar')).toContainText('Pedido V-000101 · Mostralo al retirar');
  await expect(page.locator('#comprador')).toHaveText('Cliente de Prueba');
  await expect(page.locator('#medio-pago')).toHaveText('Mercado Pago · operación N° 123456789');
  await expect(page.locator('#dato-estado')).toContainText('Retirar hasta');
  await expect(page.locator('#dato-estado')).toContainText('martes 24/11 inclusive');
  await expect(page.locator('#filas')).toContainText('Alimento cachorro 3 kg');
  await expect(page.locator('#total')).toContainText('31.999,80');
  await expect(page.getByRole('button', { name: 'Imprimir' })).toBeVisible();
  await expect(page.getByRole('link', { name: '← Volver a la compra' })).toHaveAttribute('href', '/tienda/compra.html?numero=V-000101');
});

test('factura: una compra pagada y cancelada se ve cancelada; la vet vuelve a Ventas', async ({ page }) => {
  await simularSesion(page, VET);
  await page.route('**/api/tienda/compras/V-000103/factura', (route) => responderJson(route, {
    ...FACTURA, numero: 'V-000103', estado: 'CANCELADA', retirar_hasta: null, motivo_cancelacion: 'VENCIDA', cancelada_en: '2026-11-26 09:00:00',
  }));
  await page.goto('/tienda/factura.html?numero=V-000103');

  await expect(page.locator('#estado-factura')).toHaveText('Cancelada');
  await expect(page.locator('#para-retirar')).toBeHidden();
  await expect(page.locator('#dato-estado')).toContainText('26/11/2026 09:00 · Venció el plazo de retiro');
  await expect(page.getByRole('link', { name: '← Volver a ventas' })).toHaveAttribute('href', '/panel/ventas.html');
});

test('factura: una compra sin pagar no tiene factura', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  await page.route('**/api/tienda/compras/V-000105/factura', (route) => responderJson(route, { error: 'Factura no encontrada' }, 404));
  await page.goto('/tienda/factura.html?numero=V-000105');

  await expect(page.locator('#estado')).toHaveText('Esta compra no tiene factura: solo las compras pagadas tienen factura.');
  await expect(page.locator('#factura')).toBeHidden();
});

// ---------- Ventas de la veterinaria ----------

const PARA_RETIRAR = [{
  numero: 'V-000101', estado: 'PAGADA', fecha: '2026-11-17 12:00:00', total: 31999.8, pagar_antes_de: null, tiene_factura: true,
  retirar_hasta: '2026-11-24', comprador: 'Cliente de Prueba', items: [{ nombre: 'Alimento cachorro 3 kg', cantidad: 2 }],
}];
const ENTREGADOS = [{
  numero: 'V-000102', estado: 'ENTREGADA', fecha: '2026-11-08 12:00:00', total: 5200, pagar_antes_de: null, retirar_hasta: null, tiene_factura: true,
  comprador: 'Rescatista Aprobada', entregada_en: '2026-11-11 12:40:00', entregada_por: 'Veterinaria de Prueba',
  items: [{ nombre: 'Collar ajustable', cantidad: 1 }],
}];
const pagina = (datos, extra = {}) => ({ pagina: 1, por_pagina: 20, hay_mas: false, desde: null, hasta: null, datos, ...extra });

test('ventas: para retirar arranca con el buscador y sin la lista; vencen hoy y "Entregado"', async ({ page }) => {
  await simularSesion(page, VET);
  const consultas = [];
  let entregada = false;
  await page.route('**/api/inventario/compras/resumen', (route) => responderJson(route, entregada ? { para_retirar: 2, vencen_hoy: 0 } : { para_retirar: 3, vencen_hoy: 1 }));
  await page.route('**/api/inventario/compras?*', (route) => {
    const q = new URL(route.request().url()).searchParams;
    consultas.push(q.toString());
    if (q.get('buscar') === 'nadie') return responderJson(route, pagina([]));
    return responderJson(route, pagina(entregada ? [] : PARA_RETIRAR));
  });
  await page.route('**/api/tienda/compras/V-000101/entregada', (route) => {
    entregada = true;
    return responderJson(route, { ...PARA_RETIRAR[0], estado: 'ENTREGADA' });
  });
  await page.goto('/panel/ventas.html');

  // Al entrar: el buscador listo para escribir, cuántos vencen hoy y "Ver todos", sin pedir la lista.
  await expect(page.getByRole('tab', { name: 'Para retirar' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Buscar por número de pedido o comprador')).toBeFocused();
  await expect(page.locator('#vencen-hoy')).toContainText('Hoy es el último día para retirar 1 pedido.');
  await expect(page.getByRole('button', { name: 'Ver todos los pedidos para retirar (3)' })).toBeVisible();
  await expect(page.locator('#tabla')).toBeHidden();
  expect(consultas).toHaveLength(0);

  // "Ver cuáles": los que vencen hoy.
  await page.getByRole('button', { name: 'Ver cuáles' }).click();
  await expect(page.getByRole('button', { name: 'Ver cuáles' })).toHaveAttribute('aria-pressed', 'true');
  expect(consultas).toContain('estado=PAGADA&pagina=1&vence=hoy');
  await expect(page.locator('thead')).toContainText('Fecha límite de retiro');
  const fila = page.locator('#filas > tr').first();
  await expect(fila).toContainText('V-000101');
  await expect(fila).toContainText('Cliente de Prueba');
  await expect(fila).toContainText('Alimento cachorro 3 kg × 2');
  await expect(fila).toContainText('martes 24/11');
  await expect(fila.getByRole('link', { name: 'Ver la factura del pedido V-000101' })).toHaveAttribute('href', '/tienda/factura.html?numero=V-000101');

  // "Ver todos".
  await page.getByRole('button', { name: /Ver todos los pedidos/ }).click();
  await expect.poll(() => consultas.at(-1)).toBe('estado=PAGADA&pagina=1');

  // Buscador: busca entre todos los de la pestaña (sin el resumen).
  await page.getByLabel('Buscar por número de pedido o comprador').fill('nadie');
  await expect(page.locator('#estado')).toHaveText('No encontramos pedidos con "nadie" en esta pestaña.');
  await expect(page.locator('#resumen-retirar')).toBeHidden();
  expect(consultas).toContain('estado=PAGADA&pagina=1&buscar=nadie');
  await page.getByLabel('Buscar por número de pedido o comprador').fill('');
  await expect(page.locator('#filas > tr')).toHaveCount(1);

  // Entregado: primero se arrepiente, después confirma; el resumen se actualiza.
  await page.getByRole('button', { name: 'Marcar el pedido V-000101 como entregado' }).click();
  await expect(page.getByRole('dialog')).toContainText('¿Confirmás que Cliente de Prueba retiró el pedido V-000101?');
  await page.getByRole('dialog').getByRole('button', { name: 'Volver' }).click();
  expect(entregada).toBe(false);
  await page.getByRole('button', { name: 'Marcar el pedido V-000101 como entregado' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sí, lo retiró' }).click();
  await expect(page.locator('#aviso')).toHaveText('El pedido V-000101 quedó como entregado.');
  // La fila se queda, con "Entregado" en lugar del botón.
  await expect(fila).toContainText('V-000101');
  await expect(fila.locator('.estado-entregada')).toHaveText('Entregado');
  await expect(fila.getByRole('button')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ver todos los pedidos para retirar (2)' })).toBeVisible();
  await expect(page.locator('#ninguno-hoy')).toHaveText('Hoy no vence ningún pedido.');
});

test('ventas: entregados y cancelados de los últimos 30 días, con filtro por fechas y "Ver más"', async ({ page }) => {
  await simularSesion(page, VET);
  const consultas = [];
  await page.route('**/api/inventario/compras/resumen', (route) => responderJson(route, { para_retirar: 0, vencen_hoy: 0 }));
  await page.route('**/api/inventario/compras?*', (route) => {
    const q = new URL(route.request().url()).searchParams;
    consultas.push(q.toString());
    const fechas = { desde: q.get('desde') ?? '2026-10-22', hasta: q.get('hasta') ?? '2026-11-20' };
    if (q.get('estado') === 'CANCELADA') {
      return responderJson(route, pagina([{ ...ENTREGADOS[0], numero: 'V-000099', estado: 'CANCELADA', motivo_cancelacion: 'COMPRADOR' }], fechas));
    }
    if (q.get('desde') === '2020-01-01') return responderJson(route, pagina([], fechas));
    if (q.get('pagina') === '2') return responderJson(route, pagina([{ ...ENTREGADOS[0], numero: 'V-000098' }], { ...fechas, pagina: 2 }));
    return responderJson(route, pagina(ENTREGADOS, { ...fechas, hay_mas: true }));
  });
  await page.goto('/panel/ventas.html');

  // Sin pedidos para retirar.
  await expect(page.locator('#ninguno-hoy')).toHaveText('No hay pedidos para retirar.');
  await expect(page.getByRole('button', { name: /Ver todos los pedidos/ })).toBeHidden();

  // Entregados: cuándo y quién, con las fechas del filtro y "Ver más".
  await page.getByRole('tab', { name: 'Entregados' }).click();
  await expect(page.locator('#resumen-retirar')).toBeHidden();
  await expect(page.locator('thead')).toContainText('Entregado');
  await expect(page.locator('#filas')).toContainText('11/11/2026 12:40, por Veterinaria de Prueba');
  await expect(page.locator('#filas button')).toHaveCount(0);
  await expect(page.getByLabel('Desde')).toHaveValue('2026-10-22');
  await expect(page.getByLabel('Hasta')).toHaveValue('2026-11-20');
  await page.getByRole('button', { name: 'Ver más' }).click();
  await expect(page.locator('#filas > tr')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Ver más' })).toBeHidden();

  await page.getByLabel('Desde').fill('2020-01-01');
  await page.getByLabel('Hasta').fill('2020-01-31');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page.locator('#estado')).toHaveText('No hay pedidos entregados entre el 01/01/2020 y el 31/01/2020.');
  expect(consultas).toContain('estado=ENTREGADA&pagina=1&desde=2020-01-01&hasta=2020-01-31');

  // Cancelados: con el motivo; al cambiar de pestaña vuelve a los últimos 30 días.
  await page.getByRole('tab', { name: 'Cancelados' }).click();
  await expect(page.locator('thead')).toContainText('Motivo');
  await expect(page.locator('#filas')).toContainText('La canceló el comprador');
  expect(consultas.at(-1)).toBe('estado=CANCELADA&pagina=1');
});

test('un cliente no entra a las ventas de la veterinaria', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.goto('/panel/ventas.html');
  await expect(page).toHaveURL(/\/login\/login\.html/);
});

test('el panel del rescatista tiene acceso a la tienda (también compra)', async ({ page }) => {
  await simularSesion(page, RESCATISTA);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  await page.goto('/paneles/panel-rescatista.html');
  await abrirSeccion(page, 'tienda');
  const tienda = page.locator('#menu-tienda');
  await expect(tienda.getByRole('link', { name: 'Ver catálogo de productos' })).toHaveAttribute('href', '/catalogo/catalogo.html');
  await expect(page.locator('#enlace-carrito')).toHaveAttribute('href', '/tienda/carrito.html');
  await expect(tienda.getByRole('link', { name: 'Mis compras' })).toHaveAttribute('href', '/tienda/compras.html');
});

test('el catálogo muestra la foto de cada producto, o la huellita si no tiene', async ({ page }) => {
  await simularSesion(page, null);
  await simularCatalogo(page);
  // Gana la última ruta registrada: primero la general (sin foto) y después la del 101.
  await page.route('**/api/tienda/productos/*/imagen', (route) => responderJson(route, { error: 'Imagen no encontrada' }, 404));
  await page.route('**/api/tienda/productos/101/imagen', (route) => route.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
  }));
  await page.goto('/catalogo/catalogo.html');

  const conFoto = page.locator('#lista > li').filter({ hasText: 'Alimento cachorro 3 kg' }).locator('.foto-producto');
  await expect(conFoto.locator('img')).toHaveAttribute('src', '/api/tienda/productos/101/imagen');
  const sinFoto = page.locator('#lista > li').filter({ hasText: 'Collar reflectivo' }).locator('.foto-producto');
  await expect(sinFoto.locator('svg')).toBeVisible();
  await expect(sinFoto.locator('img')).toHaveCount(0);
});

test('la política del carrito usa los días que configuró la veterinaria', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, {
    ...CARRITO, minutos_para_pagar: 20, dias_habiles_para_retirar: 7, retirar_hasta_si_compra_hoy: '2026-11-27',
  }));
  await page.goto('/tienda/carrito.html');
  await expect(page.locator('#minutos')).toHaveText('20 minutos');
  await expect(page.locator('#politica')).toContainText('Tenés 7 días hábiles');
  await expect(page.locator('#retirar-hasta')).toHaveText('viernes 27/11');
});

test('la política del carrito usa el reintegro que configuró la veterinaria', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, {
    ...CARRITO, dias_habiles_para_retirar: 5, politica_reintegro: { anticipado: 80, ultimo_momento: 40, horas: 72 },
  }));
  await page.goto('/tienda/carrito.html');
  await expect(page.locator('#politica')).toHaveText(
    'Tenés 5 días hábiles desde la compra para retirar tu pedido en el local. '
    + 'Si cancelás un pedido ya pagado con 72 horas o más antes del final del último día para retirar, te devolvemos el 80 % del importe; si cancelás después, el 40 %. '
    + 'Si no lo retirás a tiempo, el pedido se cancela y el importe no se reintegra.');
});
