// Promociones (Entrega 5): la veterinaria publicita un producto desde "Qué liquidar" de Reportes y
// el producto aparece en la tienda con el precio rebajado. La API se simula con el formato de
// docs/api/contrato-tienda.md de Inventario, sección "Promociones", y contrato-reportes.md de Reportes.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion, PRODUCTOS } = require('./ayudas');

const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO', estado_validacion: null };
const CLIENTE = { id: 102, nombre: 'Cliente de Prueba', email: 'c@prueba.huellavet', rol: 'CLIENTE' };

const COLLAR_EN_PROMO = { ...PRODUCTOS[1], promocion: { porcentaje: 20, precio: 6800, hasta: '2026-12-10' } };

// "dentro de n días" en YYYY-MM-DD (hora local, como la calcula reportes.js).
function dentroDe(dias) {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const aTexto = (iso) => iso.split('-').reverse().join('/');

// ---------- Tienda ----------

test('el catálogo muestra la sección Promociones y el precio rebajado en la tarjeta', async ({ page }) => {
  await simularSesion(page, null);
  await page.route('**/api/tienda/promociones', (route) => responderJson(route, { datos: [COLLAR_EN_PROMO] }));
  await page.route('**/api/tienda/productos?*', (route) => responderJson(route, {
    datos: [PRODUCTOS[0], COLLAR_EN_PROMO], pagina: 1, por_pagina: 12, total: 2,
  }));
  await page.goto('/catalogo/catalogo.html');

  const seccion = page.locator('#promociones');
  await expect(seccion).toBeVisible();
  await expect(seccion.getByRole('heading', { name: 'Promociones' })).toBeVisible();
  await expect(seccion.locator('.tarjeta-producto')).toHaveCount(1);
  const precio = seccion.locator('.precio');
  await expect(precio.locator('del')).toHaveText('$ 8.500,00');
  await expect(precio.locator('ins')).toHaveText('$ 6.800,00');
  await expect(precio).toContainText('20 % off');
  await expect(precio).toContainText('Promoción hasta el 10/12');

  // En la lista de siempre, el producto sin promoción tiene un solo precio.
  const alimento = page.locator('#lista .tarjeta-producto', { hasText: 'Alimento cachorro' });
  await expect(alimento.locator('.precio')).toHaveText('$ 15.999,90');
  await expect(alimento.locator('del')).toHaveCount(0);
});

test('sin promociones, la sección no se muestra', async ({ page }) => {
  await simularSesion(page, null);
  await page.route('**/api/tienda/promociones', (route) => responderJson(route, { datos: [] }));
  await page.route('**/api/tienda/productos?*', (route) => responderJson(route, { datos: PRODUCTOS, pagina: 1, por_pagina: 12, total: 3 }));
  await page.goto('/catalogo/catalogo.html');

  await expect(page.locator('#lista .tarjeta-producto')).toHaveCount(3);
  await expect(page.locator('#promociones')).toBeHidden();
});

test('el detalle del producto muestra la promoción', async ({ page }) => {
  await simularSesion(page, null);
  await page.route('**/api/tienda/productos/102', (route) => responderJson(route, { ...COLLAR_EN_PROMO, descripcion: 'Con banda reflectiva.' }));
  await page.goto('/catalogo/producto.html?id=102');

  const precio = page.locator('#producto-precio');
  await expect(precio.locator('ins')).toHaveText('$ 6.800,00');
  await expect(precio.locator('del')).toHaveText('$ 8.500,00');
  await expect(precio).toContainText('20 % off');
});

test('el carrito muestra el precio con descuento y el de antes', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, {
    items: [{
      producto_id: 102, nombre: 'Collar reflectivo', precio_unitario: 6800, precio_sin_descuento: 8500, descuento: 20,
      cantidad: 2, subtotal: 13600, stock: 10, a_la_venta: true, tiene_imagen: false,
    }],
    total: 13600, minutos_para_pagar: 15, dias_habiles_para_retirar: 5, retirar_hasta_si_compra_hoy: '2026-11-27',
  }));
  await page.goto('/tienda/carrito.html');

  await expect(page.locator('.item-unitario')).toHaveText('$ 6.800,00 c/u (antes $ 8.500,00, 20 % off)');
});

// ---------- Reportes: "Publicitar" ----------

async function simularReportes(page, { responderPost } = {}) {
  await simularSesion(page, VETERINARIO);
  const vence = dentroDe(12);
  await page.route('**/api/reportes/sugerencias', (route) => responderJson(route, {
    fecha_referencia: dentroDe(0),
    que_promocionar: { franja_sugerida: null, franjas: [] },
    que_liquidar: [
      { producto_id: 107, nombre: 'Pipeta antipulgas', fecha_vencimiento: vence, dias_restantes: 12, stock: 18, precio: 6500, descuento_sugerido: 15, precio_sugerido: 5525, sugerencia: '' },
    ],
  }));
  let vigentes = [];
  const pedidos = [];
  await page.route('**/api/inventario/promociones', (route) => {
    if (route.request().method() === 'GET') return responderJson(route, { datos: vigentes });
    const cuerpo = route.request().postDataJSON();
    pedidos.push(cuerpo);
    if (responderPost) return responderPost(route, cuerpo);
    const promo = {
      id: 3, producto_id: 107, nombre: 'Pipeta antipulgas', precio: 6500, porcentaje: cuerpo.porcentaje,
      precio_promocion: Math.round(6500 * (100 - cuerpo.porcentaje)) / 100, hasta: cuerpo.hasta, stock: 18,
      vencimiento: vence, a_la_venta: true, creada_en: '2026-11-20 18:05:00', creada_por: 'Vet',
    };
    vigentes = [promo];
    return responderJson(route, promo, 201);
  });
  const terminadas = [];
  await page.route('**/api/inventario/promociones/*', (route) => {
    terminadas.push(route.request().url().split('/').pop());
    vigentes = [];
    return route.fulfill({ status: 204 });
  });
  return { vence, pedidos, terminadas };
}

test('"Publicitar" propone el descuento sugerido hasta el vencimiento y publica la promoción', async ({ page }) => {
  const { vence, pedidos, terminadas } = await simularReportes(page);
  await page.goto('/panel/reportes.html#promociones');

  await expect(page.locator('#vacio-promociones')).toBeVisible();
  await page.getByRole('tab', { name: 'Qué liquidar' }).click();
  await page.getByRole('button', { name: 'Publicitar Pipeta antipulgas' }).click();

  const dialogo = page.getByRole('dialog', { name: 'Publicitar' });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByLabel('Descuento (%)')).toHaveValue('15');
  await expect(dialogo.getByLabel('Hasta (inclusive)')).toHaveValue(vence);
  await expect(dialogo.locator('#publicitar-precio')).toHaveText('Precio en la tienda: $5.525,00');

  await dialogo.getByLabel('Descuento (%)').fill('30');
  await expect(dialogo.locator('#publicitar-precio')).toHaveText('Precio en la tienda: $4.550,00');
  await dialogo.getByRole('button', { name: 'Publicitar' }).click();

  await expect(dialogo).toBeHidden();
  expect(pedidos).toEqual([{ producto_id: 107, porcentaje: 30, hasta: vence }]);
  await expect(page.locator('#aviso-promociones')).toHaveText(`Listo: "Pipeta antipulgas" ya está en las promociones de la tienda, con 30 % hasta el ${aTexto(vence)}.`);
  // La fila de "Qué liquidar" ya no ofrece Publicitar, y la promoción aparece en la lista.
  await expect(page.getByRole('button', { name: 'Publicitar Pipeta antipulgas' })).toHaveCount(0);
  await expect(page.locator('#filas-liquidar')).toContainText(`30 % hasta el ${aTexto(vence).slice(0, 5)}`);
  await page.getByRole('tab', { name: 'Promociones publicadas' }).click();
  await expect(page.locator('#filas-promociones tr')).toHaveCount(1);
  await expect(page.locator('#filas-promociones')).toContainText('$4.550,00 (antes $6.500,00)');

  // Terminar pide confirmación y la saca de la lista.
  await page.getByRole('button', { name: 'Terminar la promoción de Pipeta antipulgas' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Terminar la promoción' }).click();
  // El aviso se ve en la pestaña abierta.
  await expect(page.locator('#aviso-publicadas')).toHaveText('Se terminó la promoción de "Pipeta antipulgas".');
  expect(terminadas).toEqual(['3']);
  await expect(page.locator('#vacio-promociones')).toBeVisible();
  await page.getByRole('tab', { name: 'Qué liquidar' }).click();
  await expect(page.getByRole('button', { name: 'Publicitar Pipeta antipulgas' })).toBeVisible();
});

test('si Inventario rechaza el descuento, el error se ve en el campo y el cuadro sigue abierto', async ({ page }) => {
  await simularReportes(page, {
    responderPost: (route) => responderJson(route, {
      error: 'Datos inválidos',
      campos: { hasta: 'El producto vence el 02/12/2026: la promoción no puede durar más que eso' },
    }, 400),
  });
  await page.goto('/panel/reportes.html#liquidar');

  await page.getByRole('button', { name: 'Publicitar Pipeta antipulgas' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Publicitar' });
  await dialogo.getByRole('button', { name: 'Publicitar' }).click();

  await expect(dialogo.locator('#error-hasta')).toHaveText('El producto vence el 02/12/2026: la promoción no puede durar más que eso');
  await expect(dialogo.getByLabel('Hasta (inclusive)')).toHaveAttribute('aria-invalid', 'true');
  await expect(dialogo.locator('#error-general')).toHaveText('Revisá los datos marcados.');

  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialogo).toBeHidden();
  await expect(page.getByRole('button', { name: 'Publicitar Pipeta antipulgas' })).toBeFocused();
});

test('las sugerencias son tres pestañas, con un solo pedido, y los enlaces viejos (#sugerencias) siguen andando', async ({ page }) => {
  let pedidos = 0;
  await simularReportes(page);
  page.on('request', (r) => { if (r.url().endsWith('/api/reportes/sugerencias')) pedidos++; });
  await page.goto('/panel/reportes.html#sugerencias');

  await expect(page.getByRole('tablist', { name: 'Secciones de reportes' }).getByRole('tab'))
    .toHaveText(['Qué promocionar', 'Qué liquidar', 'Promociones publicadas', 'Turnos atendidos']);
  await expect(page.getByRole('tab', { name: 'Qué promocionar' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: 'Qué liquidar' })).toBeHidden();

  await page.getByRole('tab', { name: 'Qué liquidar' }).click();
  await expect(page).toHaveURL(/#liquidar$/);
  await expect(page.getByRole('heading', { name: 'Qué liquidar' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Qué promocionar' })).toBeHidden();
  await page.getByRole('tab', { name: 'Promociones publicadas' }).click();
  await expect(page.getByRole('heading', { name: 'Promociones publicadas' })).toBeVisible();
  expect(pedidos).toBe(1);
});
