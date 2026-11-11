// Pendientes de la Entrega 4: factura de la consulta, "Ya pedido" y reactivar insumos y productos,
// historial sin mascota elegida e imagen del detalle de producto.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const CLIENTE = { id: 103, nombre: 'Cliente Dos', email: 'c2@prueba.huellavet', rol: 'CLIENTE' };
const VET = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };

const FACTURA = {
  numero: 'C-000101', subtotal_base: '15000.00', subtotal_insumos: '1700.00', subtotal_productos: '15999.90',
  total: '32699.90', estado: 'PENDIENTE_PAGO', fecha: '2026-11-10 10:42:00',
  consulta: {
    id: 101, fecha: '2026-11-10', hora: '10:00', motivo: 'CONSULTA', diagnostico: 'Otitis externa leve.',
    valor_base: '15000.00',
    insumos: [{ id: 1, insumo_id: 101, nombre: 'Jeringa descartable 3 ml', cantidad: 2, costo_unitario: '850.00' }],
    productos: [{ id: 1, producto_id: 101, nombre: 'Alimento cachorro 3 kg', cantidad: 1, precio_unitario: '15999.90' }]
  },
  mascota: { id: 104, nombre: 'Tom' },
  cliente: { id: 103, nombre: 'Cliente Dos' }
};

test('la factura muestra el detalle, los totales y vuelve al historial de la mascota', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/pacientes/consultas/101/factura', (route) => responderJson(route, FACTURA));

  await page.goto('/cliente/factura.html?consulta=101');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Factura C-000101');
  await expect(page).toHaveTitle('Factura C-000101 | HuellaVet');
  await expect(page.locator('#estado-factura')).toHaveText('Pendiente de pago');
  await expect(page.locator('#mascota')).toHaveText('Tom');
  await expect(page.locator('#atencion')).toHaveText('Consulta del 10/11/2026 a las 10:00');
  await expect(page.locator('#filas > tr')).toHaveCount(3);
  await expect(page.locator('#filas > tr').nth(1)).toContainText('Jeringa descartable 3 ml');
  await expect(page.locator('#filas > tr').nth(1)).toContainText(/1\.700,00/);
  await expect(page.locator('#t-total')).toHaveText(/32\.699,90/);
  await expect(page.locator('#nota-pago')).toBeVisible();
  await expect(page.getByRole('link', { name: /Volver al historial/ })).toHaveAttribute('href', '/cliente/historial.html?mascota=104');
  await expect(page.getByRole('button', { name: 'Imprimir' })).toBeVisible();
});

test('una factura que no es del cliente (404) lo dice sin mostrar nada', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/pacientes/consultas/55/factura', (route) =>
    responderJson(route, { error: 'Factura no encontrada' }, 404));

  await page.goto('/cliente/factura.html?consulta=55');

  await expect(page.locator('#estado')).toHaveText('No se encontró la factura.');
  await expect(page.locator('#factura')).toBeHidden();
});

test('el historial sin mascota deja elegirla, y cada consulta enlaza a su factura', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/pacientes/mascotas', (route) => responderJson(route, { mascotas: [
    { id: 103, nombre: 'Luna', especie: 'PERRO' }, { id: 104, nombre: 'Tom', especie: 'GATO' }
  ] }));
  await page.route('**/api/pacientes/mascotas/104/historial', (route) => responderJson(route, { consultas: [{
    id: 101, fecha: '2026-11-10', diagnostico: 'Otitis', observaciones: null, insumos: [], productos: [],
    factura: { numero: 'C-000101', total: '32699.90', estado: 'PENDIENTE_PAGO' }
  }] }));

  await page.goto('/cliente/historial.html');
  await page.getByRole('link', { name: 'Tom (Gato)' }).click();

  await expect(page).toHaveURL(/historial\.html\?mascota=104$/);
  await expect(page.getByRole('link', { name: 'Ver factura C-000101' }))
    .toHaveAttribute('href', '/cliente/factura.html?consulta=101');
});

test('el panel del cliente enlaza "Ver factura"', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.goto('/paneles/panel-cliente.html');
  await expect(page.getByRole('link', { name: 'Ver factura' })).toHaveAttribute('href', '/cliente/historial.html');
});

test('insumos: se marca "Ya pedido" con stock bajo y se reactiva uno dado de baja', async ({ page }) => {
  await simularSesion(page, VET);
  let listados = 0;
  await page.route('**/api/inventario/insumos', (route) => {
    listados++;
    return responderJson(route, { datos: [
      { id: 101, nombre: 'Jeringa', stock: 200, costo: 850, estado: 'DISPONIBLE', stock_bajo: false, activo: true },
      { id: 108, nombre: 'Solución fisiológica', stock: 3, costo: 1900, estado: 'DISPONIBLE', stock_bajo: true, activo: true },
      { id: 109, nombre: 'Venda elástica', stock: 10, costo: 900, estado: 'DISPONIBLE', stock_bajo: true, activo: listados > 1 }
    ] });
  });
  let metodoPedido = null;
  await page.route('**/api/inventario/insumos/108/pedido', (route) => {
    metodoPedido = route.request().method();
    return responderJson(route, { id: 108, stock: 3, estado: 'YA_PEDIDO', stock_bajo: true });
  });
  await page.route('**/api/inventario/insumos/109/reactivar', (route) =>
    responderJson(route, { id: 109, nombre: 'Venda elástica', activo: true }));

  await page.goto('/panel/insumos.html');

  // Con stock suficiente no se ofrece "Ya pedido"; a uno dado de baja solo se lo reactiva.
  await expect(page.getByRole('button', { name: 'Marcar "Ya pedido" Jeringa' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cargar stock de Venda elástica' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Marcar "Ya pedido" Solución fisiológica' }).click();
  expect(metodoPedido).toBe('POST');
  const fila = page.locator('tr', { hasText: 'Solución fisiológica' });
  await expect(fila.locator('.insignia-pedido')).toHaveText('Ya pedido');
  await expect(fila.getByRole('button', { name: 'Quitar "Ya pedido" de Solución fisiológica' })).toBeVisible();

  await page.getByRole('button', { name: 'Reactivar Venda elástica' }).click();
  await expect(page.getByRole('button', { name: 'Dar de baja Venda elástica' })).toBeVisible();
});

test('productos: uno dado de baja no carga stock y se puede reactivar', async ({ page }) => {
  await simularSesion(page, VET);
  let activo = false;
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: [
    { id: 115, nombre: 'Cama acolchada', categoria: 'ACCESORIO', precio: 28900, stock: 5, vencimiento: null, activo }
  ] }));
  await page.route('**/api/inventario/productos/115/reactivar', (route) => {
    activo = true;
    return responderJson(route, { id: 115, activo: true });
  });

  await page.goto('/panel/productos.html');

  await expect(page.getByLabel('Cantidad a cargar de Cama acolchada')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reactivar Cama acolchada' }).click();
  await expect(page.getByLabel('Cantidad a cargar de Cama acolchada')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Dar de baja Cama acolchada' })).toBeVisible();
});

test('el detalle de producto crea la imagen solo si el producto tiene una', async ({ page }) => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const producto = (imagen) => ({ id: 101, nombre: 'Alimento cachorro 3 kg', categoria: 'ALIMENTO', especie: 'PERRO',
    precio: 15999.9, descripcion: 'Rico.', imagen });
  await page.route('**/api/tienda/productos/101', (route) => responderJson(route, producto(PNG)));
  await page.route('**/api/tienda/productos/102', (route) => responderJson(route, producto(null)));

  await page.goto('/catalogo/producto.html?id=101');
  await expect(page.getByRole('img', { name: 'Imagen de Alimento cachorro 3 kg' })).toBeVisible();
  await expect(page.locator('#producto-sin-imagen')).toBeHidden();

  await page.goto('/catalogo/producto.html?id=102');
  await expect(page.locator('#producto-sin-imagen')).toBeVisible();
  await expect(page.locator('#producto-imagen')).toHaveCount(0);
});
