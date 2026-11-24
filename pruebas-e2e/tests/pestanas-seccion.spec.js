// Pestañas de las secciones del menú (js/barra-rol.js): cada página de una sección con varias
// páginas muestra todas como pestañas, con la actual marcada. Salen del mismo menú del rol.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO', estado_validacion: null };
const CLIENTE = { id: 103, nombre: 'Cliente Dos', email: 'c2@prueba.huellavet', rol: 'CLIENTE' };

test.beforeEach(async ({ page }) => {
  // Las pantallas piden sus datos; con listas vacías alcanza para ver las pestañas.
  await page.route(/\/api\/(inventario|pacientes|tienda|resenas|clientes|cuenta)\//, (route) =>
    responderJson(route, { datos: [], mascotas: [], compras: [], turnos: [], limite_stock_bajo: 10 }));
});

const nav = (page) => page.locator('nav.pestanas-seccion');

test('Productos: "Productos y stock" y "Movimientos", con la actual marcada', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.goto('/panel/productos.html');
  await expect(nav(page)).toHaveAttribute('aria-label', 'Secciones de Productos');
  await expect(nav(page).getByRole('link')).toHaveText(['Productos y stock', 'Movimientos']);
  await expect(nav(page).locator('[aria-current="page"]')).toHaveText('Productos y stock');

  await nav(page).getByRole('link', { name: 'Movimientos' }).click();
  await expect(page).toHaveURL(/\/panel\/productos-movimientos\.html$/);
  await expect(nav(page).locator('[aria-current="page"]')).toHaveText('Movimientos');
});

test('Insumos y Mis pacientes también tienen sus pestañas', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.goto('/panel/insumo-movimientos.html');
  await expect(nav(page).getByRole('link')).toHaveText(['Insumos y stock', 'Movimientos']);
  await page.goto('/panel/clientes.html');
  await expect(nav(page).getByRole('link')).toHaveText(['Clientes', 'Ficha de mascotas', 'Historial clínico', 'Calendario sanitario']);
  await expect(nav(page).locator('[aria-current="page"]')).toHaveText('Clientes');
});

test('una sección de una sola página, o con sus propias pestañas, no agrega otras', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.goto('/panel/ventas.html');
  await expect(nav(page)).toHaveCount(0);
  await page.goto('/panel/reportes.html#liquidar');
  await expect(nav(page)).toHaveCount(0);
});

test('el cliente: Turnos sin el enlace de WhatsApp, y Mis mascotas', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.goto('/cliente/descuentos.html');
  await expect(nav(page).getByRole('link')).toHaveText(['Mis turnos', 'Ver descuentos']);
  await expect(nav(page).locator('[aria-current="page"]')).toHaveText('Ver descuentos');
  await page.goto('/cliente/calendario.html');
  await expect(nav(page).getByRole('link')).toHaveText(['Fichas de mis mascotas', 'Historial clínico y facturas', 'Calendario sanitario']);
});
