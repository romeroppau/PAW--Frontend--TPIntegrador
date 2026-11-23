// Panel de reportes (Entrega 5, rol 4): las listas largas de a 25 con "Mostrar más" y "Mostrar menos".
// La API se simula (ver ayudas.js) con el formato de docs/api/contrato-reportes.md del repo Reportes.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO', estado_validacion: null };

// 60 movimientos: 25 + 25 + 10.
const MOVIMIENTOS = Array.from({ length: 60 }, (_, i) => ({
  id: i + 1, fecha: `2026-11-${String((i % 28) + 1).padStart(2, '0')} 10:00:00`, tipo: 'SALIDA', motivo: 'VENTA',
  producto_id: 101, insumo_id: null, cantidad: 1,
}));

test('en movimientos se muestran más filas y "Mostrar menos" vuelve a las primeras 25', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route(/\/api\/reportes\/stock(\?.*)?$/, (route) => responderJson(route, {
    productos: [{ id: 101, nombre: 'Alimento cachorro 3 kg', stock: 30, fecha_vencimiento: null }],
    insumos: [], movimientos: MOVIMIENTOS, resumen: { productos_stock_bajo: 0, insumos_stock_bajo: 0 },
  }));

  await page.goto('/panel/reportes.html#stock-movimientos');
  const filas = page.locator('#filas-movimientos tr');
  const menos = page.locator('#panel-stock-movimientos').getByRole('button', { name: 'Mostrar menos' });
  await expect(filas).toHaveCount(25);
  await expect(menos).toBeHidden();

  await page.locator('#mas-movimientos').click();
  await page.locator('#mas-movimientos').click();
  await expect(filas).toHaveCount(60);
  await expect(page.locator('#mas-movimientos')).toBeHidden();

  await menos.click();
  await expect(filas).toHaveCount(25);
  await expect(page.locator('#cont-movimientos')).toHaveText('Mostrando 25 de 60');
  await expect(menos).toBeHidden();
  await expect(page.locator('#mas-movimientos')).toHaveText('Mostrar 25 más');
});

test('stock avisa que el filtro de fechas está en Movimientos', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route(/\/api\/reportes\/stock(\?.*)?$/, (route) => responderJson(route, {
    productos: [], insumos: [], movimientos: [], resumen: { productos_stock_bajo: 0, insumos_stock_bajo: 0 },
  }));

  await page.goto('/panel/reportes.html#stock-productos');
  await expect(page.locator('#panel-stock')).toContainText('Para filtrar por fechas lo que entró y salió, abrí Movimientos.');
  await page.getByRole('tab', { name: 'Movimientos', exact: true }).click();
  await expect(page.locator('#mov-desde')).toBeVisible();
});

test('el stock bajo usa el límite que configuró la veterinaria', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route(/\/api\/reportes\/stock(\?.*)?$/, (route) => responderJson(route, {
    productos: [
      { id: 101, nombre: 'Alimento cachorro 3 kg', stock: 5, fecha_vencimiento: null },
      { id: 102, nombre: 'Collar reflectivo', stock: 2, fecha_vencimiento: null },
    ],
    insumos: [], movimientos: [], resumen: { productos_stock_bajo: 1, insumos_stock_bajo: 0, limite_stock_bajo: 3 },
  }));

  await page.goto('/panel/reportes.html#stock-productos');
  const soloBajo = page.locator('label:has(#bajo-productos)');
  await expect(soloBajo).toHaveText('Solo stock bajo (3 o menos)');
  await soloBajo.click();
  await expect(page.locator('#filas-stock-productos tr')).toHaveCount(1);
  await expect(page.locator('#filas-stock-productos')).toContainText('Collar reflectivo');
});
