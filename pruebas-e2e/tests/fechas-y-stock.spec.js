// 25/11: los filtros "Desde / Hasta" de lo que ya pasó (ventas, mis compras, movimientos de stock,
// turnos atendidos) no aceptan fechas posteriores a hoy; "Retirar" stock en Productos y stock,
// como en insumos; y el vencimiento de los productos en DD/MM/AAAA.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const VET = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO', estado_validacion: null };
const CLIENTE = { id: 102, nombre: 'Cliente de Prueba', email: 'c@prueba.huellavet', rol: 'CLIENTE' };

// Hoy y mañana en Argentina, como los usa la página ("2026-11-25").
const diaArgentina = (dias = 0) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
  .format(new Date(Date.now() + dias * 86400000));

const paginaVacia = { pagina: 1, por_pagina: 20, hay_mas: false, desde: null, hasta: null, datos: [] };

// Los dos campos tienen hoy como máximo; una fecha futura escrita a mano avisa y no se pide nada.
async function revisarFiltro(page, { desde, hasta, error, filtrar, pedidos }) {
  const hoy = diaArgentina();
  await expect(desde).toHaveAttribute('max', hoy);
  await expect(hasta).toHaveAttribute('max', hoy);
  const antes = pedidos();
  await desde.fill(diaArgentina(-3));
  await hasta.fill(diaArgentina(1));
  await filtrar.click();
  await expect(error).toHaveText('La fecha no puede ser posterior a hoy.');
  expect(pedidos()).toBe(antes);
}

test('ventas (entregados): las fechas llegan como mucho hasta hoy', async ({ page }) => {
  await simularSesion(page, VET);
  let pedidos = 0;
  await page.route('**/api/inventario/compras/resumen', (route) => responderJson(route, { para_retirar: 0, vencen_hoy: 0 }));
  await page.route('**/api/inventario/compras?*', (route) => { pedidos++; return responderJson(route, paginaVacia); });
  await page.goto('/panel/ventas.html');
  // Se espera el pedido de la pestaña, para que no llegue en medio de la prueba.
  const entregados = page.waitForResponse((r) => r.url().includes('estado=ENTREGADA'));
  await page.getByRole('tab', { name: 'Entregados' }).click();
  await entregados;

  await revisarFiltro(page, {
    desde: page.getByLabel('Desde'), hasta: page.getByLabel('Hasta'), error: page.locator('#estado'),
    filtrar: page.getByRole('button', { name: 'Filtrar' }), pedidos: () => pedidos,
  });
});

test('mis compras: las fechas llegan como mucho hasta hoy', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, { items: [], total: 0 }));
  let pedidos = 0;
  await page.route('**/api/tienda/compras?*', (route) => { pedidos++; return responderJson(route, paginaVacia); });
  await page.goto('/tienda/compras.html');
  await expect.poll(() => pedidos).toBe(1);

  await revisarFiltro(page, {
    desde: page.getByLabel('Desde'), hasta: page.getByLabel('Hasta'), error: page.locator('#estado'),
    filtrar: page.getByRole('button', { name: 'Filtrar' }), pedidos: () => pedidos,
  });
});

for (const [pantalla, lista, movimientos] of [
  ['/panel/productos-movimientos.html', '**/api/inventario/productos', /\/api\/inventario\/productos\/movimientos(\?.*)?$/],
  ['/panel/insumo-movimientos.html', '**/api/inventario/insumos', /\/api\/inventario\/insumos\/movimientos(\?.*)?$/],
]) {
  test(`movimientos (${pantalla}): las fechas llegan como mucho hasta hoy`, async ({ page }) => {
    await simularSesion(page, VET);
    await page.route(lista, (route) => responderJson(route, { datos: [], limite_stock_bajo: 10 }));
    let pedidos = 0;
    await page.route(movimientos, (route) => { pedidos++; return responderJson(route, { datos: [] }); });
    await page.goto(pantalla);
    await expect.poll(() => pedidos).toBe(1);

    await revisarFiltro(page, {
      desde: page.locator('#mov-desde'), hasta: page.locator('#mov-hasta'), error: page.locator('#error-fechas'),
      filtrar: page.getByRole('button', { name: 'Filtrar' }), pedidos: () => pedidos,
    });
  });
}

test('turnos atendidos: las fechas llegan como mucho hasta hoy', async ({ page }) => {
  await simularSesion(page, VET);
  let pedidos = 0;
  await page.route(/\/api\/reportes\/turnos-atendidos(\?.*)?$/, (route) => {
    pedidos++;
    return responderJson(route, { turnos: [], resumen: { cantidad_turnos: 0, total_facturado: 0 } });
  });
  await page.goto('/panel/reportes.html#turnos-atendidos');
  await expect.poll(() => pedidos).toBe(1);

  await revisarFiltro(page, {
    desde: page.locator('#turnos-desde'), hasta: page.locator('#turnos-hasta'), error: page.locator('#error-turnos'),
    filtrar: page.locator('#filtro-turnos').getByRole('button', { name: 'Filtrar' }), pedidos: () => pedidos,
  });
});

test('productos y stock: retirar stock a mano y el vencimiento en DD/MM/AAAA', async ({ page }) => {
  await simularSesion(page, VET);
  let stock = 5;
  const retiros = [];
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: [
    { id: 115, nombre: 'Pipeta antipulgas', categoria: 'MEDICAMENTO', precio: 9900, stock, vencimiento: '2027-03-05', activo: true },
  ], limite_stock_bajo: 3 }));
  await page.route('**/api/inventario/productos/115/retiro', (route) => {
    const { cantidad } = route.request().postDataJSON();
    retiros.push(cantidad);
    if (cantidad > stock) return responderJson(route, { error: 'Stock insuficiente', stock }, 409);
    stock -= cantidad;
    return responderJson(route, { id: 115, stock });
  });

  await page.goto('/panel/productos.html');
  const fila = page.locator('tr', { hasText: 'Pipeta antipulgas' });
  await expect(fila).toContainText('05/03/2027');
  await expect(fila).not.toContainText('2027-03-05');

  // Retira 2: la tabla se recarga con el stock nuevo.
  await page.getByLabel('Cantidad de Pipeta antipulgas').fill('2');
  await page.getByRole('button', { name: 'Retirar unidades de Pipeta antipulgas' }).click();
  await expect(fila.locator('td').nth(3)).toHaveText('3');

  // Más de lo que hay: avisa cuántas quedan y el stock no cambia.
  await page.getByLabel('Cantidad de Pipeta antipulgas').fill('10');
  await page.getByRole('button', { name: 'Retirar unidades de Pipeta antipulgas' }).click();
  await expect(page.locator('#estado')).toHaveText('Pipeta antipulgas: Stock insuficiente (hay 3).');
  await expect(fila.locator('td').nth(3)).toHaveText('3');
  expect(retiros).toEqual([2, 10]);
});
