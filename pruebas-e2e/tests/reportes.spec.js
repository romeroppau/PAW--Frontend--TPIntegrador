// Panel de reportes (Entrega 5, rol 4). El stock y los movimientos ya no son una pestaña de Reportes
// (24/11): están en "Productos" e "Insumos" del menú (ver movimientos-inventario.spec.js). Los enlaces
// viejos a #stock… llevan ahí.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO', estado_validacion: null };

async function simularApi(page) {
  await simularSesion(page, VETERINARIO);
  await page.route(/\/api\/inventario\/(productos|insumos)(\/movimientos)?(\?.*)?$/, (route) => responderJson(route, { datos: [], limite_stock_bajo: 10 }));
  await page.route(/\/api\/reportes\//, (route) => responderJson(route, {}));
}

test('Reportes ya no tiene la pestaña de stock', async ({ page }) => {
  await simularApi(page);
  await page.goto('/panel/reportes.html');
  await expect(page.getByRole('tab')).toHaveText(['Qué promocionar', 'Qué liquidar', 'Promociones publicadas', 'Turnos atendidos']);
});

for (const [hash, destino] of [
  ['#stock-movimientos', '/panel/productos-movimientos.html'],
  ['#stock-insumos', '/panel/insumos.html'],
  ['#stock-productos', '/panel/productos.html'],
]) {
  test(`el enlace viejo ${hash} lleva a ${destino}`, async ({ page }) => {
    await simularApi(page);
    await page.goto('/panel/reportes.html' + hash);
    await expect(page).toHaveURL(new RegExp(destino.replace(/\./g, '\\.') + '$'));
  });
}
