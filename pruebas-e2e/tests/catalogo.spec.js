// Catálogo público: búsqueda en vivo, filtros y detalle.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion, PRODUCTOS } = require('./ayudas');

test.beforeEach(async ({ page }) => {
  await simularSesion(page, null);

  // GET /api/tienda/productos: filtra los productos de ejemplo según los parámetros, como la API real.
  await page.route('**/api/tienda/productos?*', (route) => {
    const q = new URL(route.request().url()).searchParams;
    const pagina = Number(q.get('pagina') || 1);
    const buscar = (q.get('buscar') || '').toLowerCase();
    const datos = pagina > 1 ? [] : PRODUCTOS.filter((p) =>
      (!buscar || p.nombre.toLowerCase().includes(buscar))
      && (!q.get('categoria') || p.categoria === q.get('categoria'))
      && (!q.get('especie') || [q.get('especie'), 'TODAS'].includes(p.especie)));
    return responderJson(route, { datos, pagina, por_pagina: 12, total: datos.length });
  });
});

test('muestra los productos con el texto de la categoría, no el código', async ({ page }) => {
  await page.goto('/catalogo/catalogo.html');
  const tarjetas = page.locator('#lista > li');
  await expect(tarjetas).toHaveCount(3);
  await expect(tarjetas.first()).toContainText('Alimento balanceado');
  await expect(tarjetas.first()).not.toContainText('ALIMENTO');
});

test('la búsqueda filtra mientras se escribe, sin recargar la página', async ({ page }) => {
  await page.goto('/catalogo/catalogo.html');
  await expect(page.locator('#lista > li')).toHaveCount(3);

  const pedido = page.waitForRequest((r) => r.url().includes('buscar=collar'));
  await page.locator('#buscar').fill('collar');
  await pedido;

  await expect(page.locator('#lista > li')).toHaveCount(1);
  await expect(page.locator('#lista')).toContainText('Collar reflectivo');
});

test('el filtro de categoría manda el código a la API', async ({ page }) => {
  await page.goto('/catalogo/catalogo.html');

  const pedido = page.waitForRequest((r) => r.url().includes('categoria=MEDICAMENTO'));
  await page.locator('#categoria').selectOption({ label: 'Medicamentos' });
  await pedido;

  await expect(page.locator('#lista > li')).toHaveCount(1);
  await expect(page.locator('#lista')).toContainText('Antipulgas gatos');
});

test('sin resultados muestra un mensaje', async ({ page }) => {
  await page.goto('/catalogo/catalogo.html');
  await page.locator('#buscar').fill('no existe nada');
  await expect(page.locator('#estado')).toContainText('No se encontraron productos');
});

test('un producto inexistente muestra "no encontrado"', async ({ page }) => {
  await page.route('**/api/tienda/productos/999999', (route) =>
    responderJson(route, { error: 'Producto no encontrado' }, 404));
  await page.goto('/catalogo/producto.html?id=999999');
  await expect(page.getByText('No encontramos ese producto')).toBeVisible();
});
