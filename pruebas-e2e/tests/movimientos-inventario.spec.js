// Productos → Movimientos e Insumos → Movimientos (Entrega 5): filtro por ítem y por fechas, y el motivo
// enlazado a la consulta o a la factura. Y "Solo stock bajo" en los dos listados, con el límite
// configurado. La API se simula con el formato de docs/api/contrato.md y contrato-insumos.md (Inventario).
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO', estado_validacion: null };

const PRODUCTOS = [
  { id: 7, nombre: 'Collar reflectivo', categoria: 'ACCESORIO', especie: 'PERRO', precio: 8500, stock: 14, vencimiento: null, activo: true },
  { id: 8, nombre: 'Antipulgas gatos', categoria: 'MEDICAMENTO', especie: 'GATO', precio: 9900, stock: 3, vencimiento: null, activo: true },
];

const MOV_PRODUCTOS = [
  { id: 3, fecha: '2026-11-20 10:30:00', tipo: 'SALIDA', motivo: 'VENTA', cantidad: 2, producto_id: 7, producto: 'Collar reflectivo', usuario: null, consulta_id: null, compra: 'V-000123' },
  { id: 2, fecha: '2026-11-18 16:00:00', tipo: 'SALIDA', motivo: 'CONSULTA', cantidad: 1, producto_id: 8, producto: 'Antipulgas gatos', usuario: 'Vet', consulta_id: 57, compra: null },
  { id: 1, fecha: '2026-11-10 09:00:00', tipo: 'ENTRADA', motivo: 'CARGA_VETERINARIO', cantidad: 20, producto_id: 7, producto: 'Collar reflectivo', usuario: 'Vet', consulta_id: null, compra: null },
];

// Hoy en Argentina, como lo calcula la página (no con la fecha de la computadora, que en CI está en UTC).
const hoy = () => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
};

test('productos: los movimientos enlazan a la consulta y a la factura, y filtran por producto y fechas', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: PRODUCTOS, limite_stock_bajo: 10 }));
  const pedidos = [];
  await page.route(/\/api\/inventario\/productos\/movimientos(\?.*)?$/, (route) => {
    const url = new URL(route.request().url());
    pedidos.push(Object.fromEntries(url.searchParams));
    const producto = url.searchParams.get('producto');
    return responderJson(route, { datos: MOV_PRODUCTOS.filter((m) => !producto || String(m.producto_id) === producto) });
  });

  await page.goto('/panel/productos-movimientos.html?producto=7');
  await expect(page.locator('#item')).toHaveValue('7');
  await expect(page.locator('#mov-hasta')).toHaveValue(hoy());
  await expect(page.locator('#filas tr')).toHaveCount(2);
  expect(pedidos[0]).toMatchObject({ producto: '7', hasta: hoy() });
  expect(pedidos[0].desde).toMatch(/^\d{4}-\d{2}-\d{2}$/);

  const venta = page.getByRole('link', { name: /Venta: ver la factura/ });
  await expect(venta).toHaveAttribute('href', '/tienda/factura.html?numero=V-000123');
  await expect(page.locator('#filas')).toContainText('Carga de stock');

  // Todos los productos y sin fechas: se ve el uso en una consulta, enlazado.
  await page.selectOption('#item', '');
  await expect(page).toHaveURL(/productos-movimientos\.html$/);
  await page.fill('#mov-desde', '');
  await page.fill('#mov-hasta', '');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page.locator('#filas tr')).toHaveCount(3);
  expect(pedidos.at(-1)).toEqual({});
  await expect(page.getByRole('link', { name: /Usado en una consulta: ver la consulta/ })).toHaveAttribute('href', '/panel/consulta.html?id=57');
});

test('las fechas al revés avisan sin pedir a la API', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/inventario/insumos', (route) => responderJson(route, { datos: [], limite_stock_bajo: 10 }));
  let pedidos = 0;
  await page.route(/\/api\/inventario\/insumos\/movimientos(\?.*)?$/, (route) => { pedidos++; return responderJson(route, { datos: [] }); });

  await page.goto('/panel/insumo-movimientos.html');
  await expect(page.locator('#estado')).toHaveText('No hay movimientos de insumos con ese filtro.');
  await page.fill('#mov-desde', '2026-10-30');
  await page.fill('#mov-hasta', '2026-10-01');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page.locator('#error-fechas')).toHaveText('La fecha "Desde" no puede ser posterior a "Hasta".');
  expect(pedidos).toBe(1);
});

test('el enlace viejo de un producto (movimientos.html?id=) lleva a la pantalla nueva', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: PRODUCTOS }));
  await page.route(/\/api\/inventario\/productos\/movimientos(\?.*)?$/, (route) => responderJson(route, { datos: [] }));
  await page.goto('/panel/movimientos.html?id=8');
  await expect(page).toHaveURL(/\/panel\/productos-movimientos\.html\?producto=8$/);
  await expect(page.locator('#item')).toHaveValue('8');
});

test('productos: "Solo stock bajo" usa el límite configurado y se combina con el buscador', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: PRODUCTOS, limite_stock_bajo: 3 }));

  await page.goto('/panel/productos.html');
  const casilla = page.getByLabel('Solo stock bajo (3 o menos)');
  await expect(page.locator('#filas tr')).toHaveCount(2);
  await casilla.check();
  await expect(page.locator('#filas tr')).toHaveCount(1);
  await expect(page.locator('#filas')).toContainText('Antipulgas gatos');
  await page.fill('#buscar', 'collar');
  await expect(page.locator('#filas tr')).toHaveCount(0);
  await expect(page.locator('#estado')).toHaveText('Ningún producto con stock bajo se llama "collar".');
  await casilla.uncheck();
  await expect(page.locator('#filas tr')).toHaveCount(1);
  await expect(page.locator('#filas a', { hasText: 'Movimientos' })).toHaveAttribute('href', '/panel/productos-movimientos.html?producto=7');
});

test('insumos: "Solo stock bajo" y el texto usan el límite configurado', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/inventario/insumos', (route) => responderJson(route, { limite_stock_bajo: 15, datos: [
    { id: 101, nombre: 'Jeringa 3 ml', stock: 200, costo: 150, estado: 'DISPONIBLE', stock_bajo: false, activo: true },
    { id: 102, nombre: 'Gasas', stock: 12, costo: 90, estado: 'DISPONIBLE', stock_bajo: true, activo: true },
  ] }));

  await page.goto('/panel/insumos.html');
  await expect(page.locator('main')).toContainText('Los insumos con 15 unidades o menos se marcan con stock bajo');
  await page.getByLabel('Solo stock bajo (15 o menos)').check();
  await expect(page.locator('#filas tr')).toHaveCount(1);
  await expect(page.locator('#filas')).toContainText('Gasas');
});

test('el menú de la veterinaria separa Productos, Insumos, Tienda y Reportes', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: [] }));
  await page.goto('/panel/productos.html');
  for (const [texto, href] of [
    ['Productos y stock', '/panel/productos.html'],
    ['Movimientos', '/panel/productos-movimientos.html'],
    ['Ventas y pedidos para retirar', '/panel/ventas.html'],
  ]) {
    await expect(page.locator(`a[href="${href}"]`, { hasText: texto }).first()).toBeAttached();
  }
  await expect(page.locator('a[href^="/panel/reportes.html#stock"]')).toHaveCount(0);
});

test('desde la factura de una venta se vuelve a los movimientos, con el mismo filtro', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: PRODUCTOS }));
  await page.route(/\/api\/inventario\/productos\/movimientos(\?.*)?$/, (route) => responderJson(route, { datos: MOV_PRODUCTOS }));
  await page.route(/\/api\/tienda\/compras\/.+\/factura$/, (route) => responderJson(route, { error: 'Compra no encontrada' }, 404));

  await page.goto('/panel/productos-movimientos.html?producto=7');
  await page.getByRole('link', { name: /Venta: ver la factura/ }).click();
  await expect(page).toHaveURL(/\/tienda\/factura\.html\?numero=V-000123$/);
  await expect(page.locator('#volver')).toHaveText('← Volver a movimientos');
  await expect(page.locator('#volver')).toHaveAttribute('href', '/panel/productos-movimientos.html?producto=7');
});

test('desde "Usado en una consulta" se entra a la consulta y "Volver" lleva a los movimientos', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: PRODUCTOS }));
  await page.route(/\/api\/inventario\/productos\/movimientos(\?.*)?$/, (route) => responderJson(route, { datos: MOV_PRODUCTOS }));
  await page.route(/\/api\/pacientes\/consultas\/57$/, (route) => responderJson(route, { error: 'Consulta no encontrada' }, 404));

  await page.goto('/panel/productos-movimientos.html?producto=8');
  await page.getByRole('link', { name: /Usado en una consulta: ver la consulta/ }).click();
  await expect(page).toHaveURL(/\/panel\/consulta\.html\?id=57$/);
  await expect(page.locator('#volver')).toHaveText('← Volver a movimientos');
  await expect(page.locator('#volver')).toHaveAttribute('href', '/panel/productos-movimientos.html?producto=8');
});

test('abierta desde otro lado, la consulta vuelve a la agenda', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route(/\/api\/pacientes\/consultas\/57$/, (route) => responderJson(route, { error: 'Consulta no encontrada' }, 404));
  await page.goto('/panel/consulta.html?id=57');
  await expect(page.locator('#volver')).toHaveText('← Volver a la agenda');
  await expect(page.locator('#volver')).toHaveAttribute('href', '/panel/agenda.html');
});
