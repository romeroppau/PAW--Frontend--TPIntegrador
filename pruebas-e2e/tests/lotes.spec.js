// 26/11: lotes de productos (migración 028 de Inventario). Cada producto tiene lotes, cada uno con su
// vencimiento y su stock; se vende primero el que vence antes, y una promoción es de un lote.
//   - Productos: "Lotes" muestra los lotes, retira de un lote y carga en uno que ya existe o en uno nuevo.
//   - Carrito: el descuento vale para las unidades que le quedan al lote; las demás, a precio normal.
//   - Compra y factura: lo que fue con descuento va en su propia línea.
//   - Reportes: "Qué liquidar" es por lote, "Publicitar" manda el lote y se avisan los lotes vencidos.
// La API se simula con el formato de docs/api/contrato.md y contrato-tienda.md (Inventario) y
// contrato-reportes.md (Reportes).
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO', estado_validacion: null };
const CLIENTE = { id: 102, nombre: 'Cliente de Prueba', email: 'c@prueba.huellavet', rol: 'CLIENTE' };

const PIPETA = {
  id: 107, nombre: 'Pipeta antipulgas', categoria: 'MEDICAMENTO', especie: 'GATO', precio: 6500, stock: 21, stock_vendible: 18,
  vencimiento: '2026-12-16', activo: true,
  lotes: [
    { id: 30, codigo: 'FL-1011', vencimiento: '2026-11-01', stock: 3, vencido: true },
    { id: 31, codigo: 'FL-2612', vencimiento: '2026-12-16', stock: 8, vencido: false },
    { id: 32, codigo: null, vencimiento: '2027-06-14', stock: 10, vencido: false },
  ],
};
const COLLAR = { id: 110, nombre: 'Collar de nylon', categoria: 'ACCESORIO', especie: 'PERRO', precio: 5200, stock: 22, stock_vendible: 22, vencimiento: null, activo: true,
  lotes: [{ id: 40, codigo: null, vencimiento: null, stock: 22, vencido: false }] };

async function simularProductos(page) {
  await simularSesion(page, VETERINARIO);
  const pedidos = [];
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: [PIPETA, COLLAR], limite_stock_bajo: 10 }));
  await page.route(/\/api\/inventario\/productos\/\d+\/(stock|retiro)$/, (route) => {
    pedidos.push({ url: new URL(route.request().url()).pathname, cuerpo: route.request().postDataJSON() });
    return responderJson(route, { id: 107, stock: 20 });
  });
  return pedidos;
}

test('productos: el stock dice cuánto está vencido y "Lotes" muestra cada lote, el que vence primero arriba', async ({ page }) => {
  await simularProductos(page);
  await page.goto('/panel/productos.html');

  const fila = page.locator('#filas > tr').first();
  await expect(fila.locator('td').nth(3)).toHaveText('2118 sin vencer');
  await expect(fila.locator('td').nth(4)).toContainText('16/12/2026');
  await expect(fila.locator('td').nth(4)).toContainText('3 vencidas: retiralas');
  // Los accesorios no muestran lotes.
  await expect(page.getByRole('button', { name: 'Ver los lotes de Collar de nylon' })).toHaveCount(0);

  const boton = page.getByRole('button', { name: 'Ver los lotes de Pipeta antipulgas' });
  await expect(boton).toHaveText('Lotes (3)');
  await boton.click();
  await expect(boton).toHaveAttribute('aria-expanded', 'true');
  const lotes = page.locator('#lotes-107 .tabla-lotes tbody tr');
  await expect(lotes).toHaveCount(3);
  await expect(lotes.nth(0)).toContainText('Lote FL-1011');
  await expect(lotes.nth(0)).toContainText('Vencido: no se vende');
  await expect(lotes.nth(2)).toContainText('Lote sin número');
  // Para cargar solo se ofrecen los lotes sin vencer y "Lote nuevo".
  await expect(page.locator('#lote-107 option')).toHaveText([
    'Lote FL-2612 (vence el 16/12/2026, hay 8)', 'Lote sin número (vence el 14/06/2027, hay 10)', 'Lote nuevo',
  ]);

  await boton.click();
  await expect(page.locator('#lotes-107')).toHaveCount(0);
  await expect(page.locator('#filas > tr')).toHaveCount(2);
});

test('productos: retirar de un lote y cargar en uno que ya existe o en uno nuevo', async ({ page }) => {
  const pedidos = await simularProductos(page);
  await page.goto('/panel/productos.html');

  // "Cargar" en la fila de un medicamento abre los lotes con la cantidad escrita (no carga sin lote).
  await page.getByLabel('Cantidad de Pipeta antipulgas').fill('5');
  await page.getByRole('button', { name: 'Cargar stock de Pipeta antipulgas' }).click();
  await expect(page.locator('#cantidad-lote-107')).toHaveValue('5');
  await expect(page.locator('#cantidad-lote-107')).toBeFocused();
  expect(pedidos).toEqual([]);

  // Retirar las vencidas de su lote.
  await page.getByLabel('Cantidad a retirar del lote fl-1011').fill('3');
  await page.getByRole('button', { name: 'Retirar del lote fl-1011 de Pipeta antipulgas' }).click();
  await expect.poll(() => pedidos.length).toBe(1);

  // Cargar en un lote que ya existe…
  await page.getByRole('button', { name: 'Ver los lotes de Pipeta antipulgas' }).click();
  await page.locator('#cantidad-lote-107').fill('4');
  await page.locator('#lote-107').selectOption('31');
  await expect(page.locator('#codigo-lote-107')).toBeHidden();
  await page.getByRole('button', { name: 'Cargar stock en el lote de Pipeta antipulgas' }).click();
  await expect.poll(() => pedidos.length).toBe(2);

  // … y en uno nuevo, con número y vencimiento.
  await page.getByRole('button', { name: 'Ver los lotes de Pipeta antipulgas' }).click();
  await page.locator('#cantidad-lote-107').fill('12');
  await page.locator('#lote-107').selectOption('nuevo');
  await page.getByLabel('Número de lote (opcional)').fill('FL-0328');
  await page.getByLabel('Vence (vacío: no vence)').fill('2028-03-31');
  await page.getByRole('button', { name: 'Cargar stock en el lote de Pipeta antipulgas' }).click();
  await expect.poll(() => pedidos.length).toBe(3);

  expect(pedidos).toEqual([
    { url: '/api/inventario/productos/107/retiro', cuerpo: { cantidad: 3, lote_id: 30 } },
    { url: '/api/inventario/productos/107/stock', cuerpo: { cantidad: 4, lote_id: 31 } },
    { url: '/api/inventario/productos/107/stock', cuerpo: { cantidad: 12, lote: { codigo: 'FL-0328', vencimiento: '2028-03-31' } } },
  ]);
});

test('productos: un accesorio carga el stock en la fila, sin elegir lote', async ({ page }) => {
  const pedidos = await simularProductos(page);
  await page.goto('/panel/productos.html');
  await page.getByLabel('Cantidad de Collar de nylon').fill('6');
  await page.getByRole('button', { name: 'Cargar stock de Collar de nylon' }).click();
  await expect.poll(() => pedidos).toEqual([{ url: '/api/inventario/productos/110/stock', cuerpo: { cantidad: 6 } }]);
});

test('el formulario: el alta pide el vencimiento y el número del primer lote; la edición no los muestra', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  const cuerpos = [];
  await page.route('**/api/inventario/productos', (route) => {
    cuerpos.push(route.request().postDataJSON());
    return responderJson(route, { id: 120 }, 201);
  });
  await page.route('**/api/inventario/productos/107', (route) => responderJson(route, { ...PIPETA, descripcion: null }));

  await page.goto('/panel/producto-form.html');
  await page.getByLabel('Nombre').fill('Pipeta nueva');
  await page.getByLabel('Categoría').selectOption('MEDICAMENTO');
  await page.getByLabel('Especie').selectOption('GATO');
  await page.getByLabel('Precio').fill('7000');
  await page.getByLabel('Stock inicial').fill('10');
  await page.getByLabel('Vencimiento del primer lote').fill('2027-05-31');
  await page.getByLabel('Número del primer lote (opcional)').fill(' FL-0531 ');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => cuerpos.length).toBe(1);
  expect(cuerpos[0]).toMatchObject({ stock: 10, vencimiento: '2027-05-31', lote: 'FL-0531' });

  await page.goto('/panel/producto-form.html?id=107');
  await expect(page.getByLabel('Nombre')).toHaveValue('Pipeta antipulgas');
  await expect(page.locator('#campo-vencimiento')).toBeHidden();
  await expect(page.locator('#campo-lote')).toBeHidden();
});

test('carrito: la promoción es de un lote; si lleva más de las que quedan, las demás van a precio normal', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, {
    items: [{
      producto_id: 107, nombre: 'Pipeta antipulgas', precio_unitario: 5200, precio_sin_descuento: 6500, descuento: 20,
      promocion_quedan: 3, cantidad_promocion: 3, cantidad: 5, subtotal: 28600, stock: 18, a_la_venta: true, tiene_imagen: false,
    }],
    total: 28600, minutos_para_pagar: 15, dias_habiles_para_retirar: 5, retirar_hasta_si_compra_hoy: '2026-12-03',
  }));
  await page.goto('/tienda/carrito.html');

  await expect(page.locator('.item-carrito')).toContainText('3 con 20 % off (las que quedan en promoción) y 2 a $ 6.500,00.');
  await expect(page.locator('.item-subtotal')).toHaveText('$ 28.600,00');
});

test('catálogo: la promoción dice hasta cuándo o hasta agotar las unidades del lote', async ({ page }) => {
  await simularSesion(page, null);
  await page.route('**/api/tienda/promociones', (route) => responderJson(route, { datos: [
    { id: 107, nombre: 'Pipeta antipulgas', categoria: 'MEDICAMENTO', especie: 'GATO', precio: 6500, vencimiento: '2026-12-16', disponible: true,
      promocion: { porcentaje: 20, precio: 5200, hasta: '2026-12-10', quedan: 8 } },
  ] }));
  await page.goto('/catalogo/promociones.html');
  await expect(page.locator('.tarjeta-producto .precio')).toContainText('Promoción hasta el 10/12/2026 o hasta agotar las 8 unidades');
});

test('compra: lo que fue con descuento va en su propia línea', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route(/\/api\/tienda\/compras\/V-000210$/, (route) => responderJson(route, {
    numero: 'V-000210', estado: 'PAGADA', fecha: '2026-11-26 10:30:00', total: 28600, pagar_antes_de: null, segundos_para_pagar: null,
    retirar_hasta: '2026-12-03', dias_habiles_para_retirar: 5, tiene_factura: true, motivo_cancelacion: null, politica_reintegro: null, reintegro: null,
    entregada_en: null, operacion_mp: '123',
    items: [
      { producto_id: 107, nombre: 'Pipeta antipulgas', precio_unitario: 5200, cantidad: 3, subtotal: 15600, en_promocion: true },
      { producto_id: 107, nombre: 'Pipeta antipulgas', precio_unitario: 6500, cantidad: 2, subtotal: 13000, en_promocion: false },
    ],
  }));
  await page.goto('/tienda/compra.html?numero=V-000210');
  const filas = page.locator('#filas tr');
  await expect(filas).toHaveCount(2);
  await expect(filas.nth(0)).toContainText('Pipeta antipulgas (con descuento)');
  await expect(filas.nth(1).locator('td').first()).toHaveText('Pipeta antipulgas');
});

test('reportes: "Qué liquidar" es por lote, "Publicitar" manda el lote y se avisan los lotes vencidos', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  const d = new Date();
  d.setDate(d.getDate() + 12);
  const vence = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.route('**/api/reportes/sugerencias', (route) => responderJson(route, {
    fecha_referencia: '2026-11-26',
    que_promocionar: { franja_sugerida: null, franjas: [] },
    que_liquidar: [
      { producto_id: 107, nombre: 'Pipeta antipulgas', lote_id: 31, lote: 'FL-2612', fecha_vencimiento: vence, dias_restantes: 12,
        stock: 8, precio: 6500, descuento_sugerido: 15, precio_sugerido: 5525, sugerencia: '' },
    ],
    lotes_vencidos: [
      { producto_id: 107, nombre: 'Pipeta antipulgas', lote_id: 30, lote: 'FL-1011', fecha_vencimiento: '2026-11-01', stock: 3,
        sugerencia: 'Pipeta antipulgas, lote FL-1011: venció el 01/11/2026 y quedan 3. Ya no se vende: retiralo del stock.' },
    ],
  }));
  await page.route('**/api/pacientes/promociones-turnos', (route) => responderJson(route, { datos: [] }));
  const pedidos = [];
  await page.route('**/api/inventario/promociones', (route) => {
    if (route.request().method() === 'GET') return responderJson(route, { datos: [] });
    pedidos.push(route.request().postDataJSON());
    return responderJson(route, { id: 5, porcentaje: 15, hasta: vence }, 201);
  });

  await page.goto('/panel/reportes.html#liquidar');
  await expect(page.locator('#caja-vencidos')).toContainText('Pipeta antipulgas, lote FL-1011: venció el 01/11/2026 y quedan 3.');
  await expect(page.locator('#filas-liquidar tr').first()).toContainText('Lote FL-2612');

  await page.getByRole('button', { name: 'Publicitar Pipeta antipulgas (lote fl-2612)' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Publicitar' });
  await expect(dialogo).toContainText('Pipeta antipulgas, lote fl-2612: $6.500,00, quedan 8.');
  await dialogo.getByRole('button', { name: 'Publicitar' }).click();
  await expect.poll(() => pedidos).toEqual([{ producto_id: 107, lote_id: 31, porcentaje: 15, hasta: vence }]);
});
