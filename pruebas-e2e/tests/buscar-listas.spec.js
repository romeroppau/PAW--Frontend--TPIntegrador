// Buscador por nombre en los listados de la veterinaria: productos e insumos. Filtra mientras se
// escribe lo que ya trajo la API, sin distinguir mayúsculas ni tildes.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };

test('productos: busca por nombre mientras se escribe', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  let pedidos = 0;
  await page.route('**/api/inventario/productos', (route) => {
    pedidos++;
    return responderJson(route, { datos: [
      { id: 101, nombre: 'Alimento cachorro 3 kg', categoria: 'ALIMENTO', especie: 'PERRO', precio: 15999.9, stock: 20, vencimiento: null, activo: true },
      { id: 102, nombre: 'Antipulgás gatos', categoria: 'MEDICAMENTO', especie: 'GATO', precio: 4500, stock: 5, vencimiento: null, activo: true },
      { id: 103, nombre: 'Collar reflectivo', categoria: 'ACCESORIO', especie: 'PERRO', precio: 8500, stock: 0, vencimiento: null, activo: false },
    ] });
  });
  await page.goto('/panel/productos.html');
  const filas = page.locator('#filas tr');
  await expect(filas).toHaveCount(3);

  await page.getByLabel('Buscar un producto por nombre').fill('ANTIPULGAS');
  await expect(filas).toHaveCount(1);
  await expect(filas.first()).toContainText('Antipulgás gatos');

  // También encuentra los dados de baja.
  await page.getByLabel('Buscar un producto por nombre').fill('collar');
  await expect(filas).toHaveCount(1);

  await page.getByLabel('Buscar un producto por nombre').fill('xyz');
  await expect(filas).toHaveCount(0);
  await expect(page.locator('#estado')).toHaveText('Ningún producto se llama "xyz".');

  await page.getByLabel('Buscar un producto por nombre').fill('');
  await expect(filas).toHaveCount(3);
  expect(pedidos).toBe(1);   // no vuelve a pedir la lista
});

test('insumos: busca por nombre mientras se escribe', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/inventario/insumos', (route) => responderJson(route, { datos: [
    { id: 101, nombre: 'Jeringa descartable 3 ml', stock: 200, costo: 150, estado: 'DISPONIBLE', activo: true },
    { id: 102, nombre: 'Guantes de látex (par)', stock: 8, costo: 220, estado: 'EN_FALTA', activo: true },
  ] }));
  await page.goto('/panel/insumos.html');
  const filas = page.locator('#filas tr');
  await expect(filas).toHaveCount(2);

  await page.getByLabel('Buscar un insumo por nombre').fill('latex');
  await expect(filas).toHaveCount(1);
  await expect(filas.first()).toContainText('Guantes de látex');

  await page.getByLabel('Buscar un insumo por nombre').fill('bisturí');
  await expect(page.locator('#estado')).toHaveText('Ningún insumo se llama "bisturí".');
});
