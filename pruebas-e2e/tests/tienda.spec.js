// Tienda (Entrega 5, rol 2): agregar al carrito desde el catálogo y el detalle, el carrito con la
// política de cancelación, la compra con la cuenta regresiva, mis compras y las ventas de la veterinaria.
// Contrato de la API: repo Inventario, docs/api/contrato-tienda.md.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion, PRODUCTOS } = require('./ayudas');

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

test('una compra pagada se puede cancelar: avisa que el importe no se reintegra', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  const PAGADA = { ...PENDIENTE, numero: 'V-000099', estado: 'PAGADA', pagar_antes_de: null, segundos_para_pagar: null, retirar_hasta: '2026-11-25' };
  await page.route('**/api/tienda/compras/V-000099', (route) => responderJson(route, PAGADA));
  let cancelada = false;
  await page.route('**/api/tienda/compras/V-000099/cancelar', (route) => {
    cancelada = true;
    return responderJson(route, { ...PAGADA, estado: 'CANCELADA', retirar_hasta: null, motivo_cancelacion: 'COMPRADOR' });
  });
  await page.goto('/tienda/compra.html?numero=V-000099');

  await expect(page.locator('#politica')).toContainText('Si cancelás un pedido ya pagado, el importe tampoco se reintegra.');
  await page.getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(page.getByRole('dialog')).toContainText('¿Cancelás el pedido V-000099? Los productos vuelven a la tienda y el importe no se reintegra.');
  await page.getByRole('dialog').getByRole('button', { name: 'Volver' }).click();
  expect(cancelada).toBe(false);

  await page.getByRole('button', { name: 'Cancelar pedido' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(page.locator('#estado-compra')).toHaveText('Cancelada');
  await expect(page.locator('#aviso')).toHaveText('Cancelaste esta compra.');
  await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toBeHidden();
  expect(cancelada).toBe(true);
});

test('mis compras: cada una con su estado y lo que hay que hacer', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, VACIO));
  await page.route('**/api/tienda/compras', (route) => responderJson(route, { datos: [
    { numero: 'V-000105', estado: 'PENDIENTE_PAGO', fecha: '2026-11-18 10:30:00', total: 4500, pagar_antes_de: '2026-11-18 10:45:00', retirar_hasta: '2026-11-25' },
    { numero: 'V-000101', estado: 'PAGADA', fecha: '2026-11-17 12:00:00', total: 31999.8, pagar_antes_de: null, retirar_hasta: '2026-11-24' },
    { numero: 'V-000103', estado: 'CANCELADA', fecha: '2026-11-06 09:00:00', total: 7800, pagar_antes_de: null, retirar_hasta: null, motivo_cancelacion: 'VENCIDA' },
  ] }));
  await page.goto('/tienda/compras.html');

  const filas = page.locator('#filas > tr');
  await expect(filas).toHaveCount(3);
  await expect(filas.nth(0)).toContainText('Esperando el pago');
  await expect(filas.nth(0)).toContainText('Pagá antes de las 10:45');
  await expect(filas.nth(1)).toContainText('Retirala hasta el martes 24/11');
  await expect(filas.nth(2)).toContainText('Cancelada');
  await expect(filas.nth(2)).toContainText('Venció el plazo de retiro');
  await expect(page.getByRole('link', { name: 'V-000101' })).toHaveAttribute('href', '/tienda/compra.html?numero=V-000101');
});

// ---------- Ventas de la veterinaria ----------

const PARA_RETIRAR = [{
  numero: 'V-000101', estado: 'PAGADA', fecha: '2026-11-17 12:00:00', total: 31999.8, pagar_antes_de: null,
  retirar_hasta: '2026-11-24', comprador: 'Cliente de Prueba', items: [{ nombre: 'Alimento cachorro 3 kg', cantidad: 2 }],
}];
const ENTREGADOS = [{
  numero: 'V-000102', estado: 'ENTREGADA', fecha: '2026-11-08 12:00:00', total: 5200, pagar_antes_de: null, retirar_hasta: null,
  comprador: 'Rescatista Aprobada', entregada_en: '2026-11-11 12:40:00', entregada_por: 'Veterinaria de Prueba',
  items: [{ nombre: 'Collar ajustable', cantidad: 1 }],
}];

test('ventas: pestañas, buscador y "Entregado" con confirmación', async ({ page }) => {
  await simularSesion(page, VET);
  const consultas = [];
  let entregada = false;
  await page.route('**/api/inventario/compras?*', (route) => {
    const q = new URL(route.request().url()).searchParams;
    consultas.push(q.toString());
    if (q.get('estado') === 'ENTREGADA') return responderJson(route, { datos: ENTREGADOS });
    if (q.get('estado') === 'CANCELADA') return responderJson(route, { datos: [{ ...ENTREGADOS[0], numero: 'V-000099', estado: 'CANCELADA', motivo_cancelacion: 'COMPRADOR' }] });
    if (q.get('buscar') === 'nadie') return responderJson(route, { datos: [] });
    return responderJson(route, { datos: entregada ? [] : PARA_RETIRAR });
  });
  await page.route('**/api/tienda/compras/V-000101/entregada', (route) => {
    entregada = true;
    return responderJson(route, { ...PARA_RETIRAR[0], estado: 'ENTREGADA' });
  });
  await page.goto('/panel/ventas.html');

  await expect(page.getByRole('tab', { name: 'Para retirar' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('thead')).toContainText('Fecha límite de retiro');
  await expect(page.getByRole('button', { name: 'Marcar el pedido V-000101 como entregado' })).toHaveText('Marcar como entregado');
  const fila = page.locator('#filas > tr').first();
  await expect(fila).toContainText('V-000101');
  await expect(fila).toContainText('Cliente de Prueba');
  await expect(fila).toContainText('Alimento cachorro 3 kg × 2');
  await expect(fila).toContainText('martes 24/11');

  // Buscador: busca dentro de la pestaña.
  await page.getByLabel('Buscar por número de pedido o comprador').fill('nadie');
  await expect(page.locator('#estado')).toHaveText('No encontramos pedidos con "nadie" en esta pestaña.');
  expect(consultas).toContain('estado=PAGADA&buscar=nadie');
  await page.getByLabel('Buscar por número de pedido o comprador').fill('');
  await expect(page.locator('#filas > tr')).toHaveCount(1);

  // Entregado: primero se arrepiente, después confirma.
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

  // Pestaña Entregados: cuándo y quién.
  await page.getByRole('tab', { name: 'Entregados' }).click();
  await expect(page.locator('thead')).toContainText('Entregado');
  await expect(page.locator('#filas')).toContainText('11/11/2026 12:40, por Veterinaria de Prueba');
  await expect(page.locator('#filas button')).toHaveCount(0);

  // Pestaña Cancelados: con el motivo.
  await page.getByRole('tab', { name: 'Cancelados' }).click();
  await expect(page.locator('thead')).toContainText('Motivo');
  await expect(page.locator('#filas')).toContainText('La canceló el comprador');
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
  const tienda = page.locator('#tienda');
  await expect(tienda.getByRole('link', { name: 'Ver catálogo de productos' })).toHaveAttribute('href', '/catalogo/catalogo.html');
  await expect(tienda.getByRole('link', { name: 'Mi carrito' })).toHaveAttribute('href', '/tienda/carrito.html');
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
