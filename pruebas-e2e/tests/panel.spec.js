// Panel del veterinario: la guardia de acceso y el listado de productos.
// (La guardia es solo comodidad de interfaz: la autorización real la hace el backend.)
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion, PRODUCTOS } = require('./ayudas');

test('sin sesión, el panel redirige al login', async ({ page }) => {
  await simularSesion(page, null);
  await page.goto('/panel/productos.html');
  await expect(page).toHaveURL(/\/login\/login\.html$/);
});

test('un cliente no puede ver el panel del veterinario', async ({ page }) => {
  await simularSesion(page, { id: 2, nombre: 'Cliente', email: 'c@prueba.huellavet', rol: 'CLIENTE' });
  await page.goto('/panel/productos.html');
  await expect(page).toHaveURL(/\/login\/login\.html$/);
});

test('el veterinario ve el listado de productos', async ({ page }) => {
  await simularSesion(page, { id: 1, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' });
  await page.route('**/api/inventario/productos', (route) =>
    responderJson(route, { datos: PRODUCTOS.map((p) => ({ ...p, stock: 5, activo: true })) }));

  await page.goto('/panel/productos.html');
  await expect(page.locator('#filas > tr')).toHaveCount(3);
  await expect(page.locator('#filas')).toContainText('Alimento balanceado');
});
