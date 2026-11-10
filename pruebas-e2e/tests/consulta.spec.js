// Consulta: los mensajes aparecen al lado del botón que los provoca, y los cuadros son los del sitio.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };
const CONSULTA = {
  id: 7, turno_id: 101, mascota_id: 101, motivo: 'CONSULTA', estado: 'ABIERTA', diagnostico: 'Otitis',
  observaciones: null, valor_base: '8000.00', finalizada_en: null, total: '8300.00',
  insumos: [{ id: 1, insumo_id: 103, nombre: 'Gasa estéril', cantidad: 2, costo_unitario: '150.00' }],
  productos: []
};

async function abrir(page, consulta = CONSULTA) {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/pacientes/consultas/7', (route) => responderJson(route, consulta));
  await page.route('**/api/inventario/insumos', (route) => responderJson(route, { datos: [{ id: 101, nombre: 'Jeringa', stock: 5 }] }));
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: [] }));
  await page.goto('/panel/consulta.html?id=7');
  await expect(page.locator('#ficha')).toBeVisible();
}

async function finalizar(page, respuesta, estado, consulta) {
  await page.route('**/api/pacientes/consultas/7/finalizar', (route) => responderJson(route, respuesta, estado));
  await abrir(page, consulta);
  await page.getByRole('button', { name: 'Finalizar consulta' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finalizar' }).click();
}

test('si un insumo se dio de baja, lo avisa debajo del botón y lo marca en la lista', async ({ page }) => {
  await finalizar(page, {
    error: 'Hay insumos o productos dados de baja en la consulta. Quitalos e intentá de nuevo.',
    motivo: 'DADO_DE_BAJA',
    items: [{ tipo: 'INSUMO', id: 103 }]
  }, 409);

  const mensaje = page.locator('#mensaje-finalizar');
  await expect(mensaje).toHaveText('Estos ítems están dados de baja: Gasa estéril. Quitalos de la consulta para poder finalizar.');
  await expect(mensaje).toBeInViewport({ ratio: 1 });
  await expect(page.locator('#filas-insumos tr')).toContainText('Dado de baja');
});

test('sin stock suficiente, sigue diciendo cuánto hay', async ({ page }) => {
  await finalizar(page, { error: 'Stock insuficiente', items: [{ tipo: 'INSUMO', id: 103, stock: 1 }] }, 409);

  await expect(page.locator('#mensaje-finalizar')).toHaveText('No hay stock suficiente de: Gasa estéril (stock disponible: 1).');
});

test('si el total no entra en la factura, explica qué se controla', async ({ page }) => {
  await finalizar(page, { error: 'El total de la consulta no puede superar 99.999.999,99', campos: {} }, 400,
    { ...CONSULTA, valor_base: '99999999.99' });

  const mensaje = page.locator('#mensaje-finalizar');
  await expect(mensaje).toContainText('no puede superar 99.999.999,99. El total es');
  await expect(mensaje).toContainText('suma del valor base, los insumos y los productos');
  await expect(mensaje).toBeInViewport({ ratio: 1 });
});

test('volver desde el cuadro no finaliza la consulta', async ({ page }) => {
  let pedidos = 0;
  await page.route('**/api/pacientes/consultas/7/finalizar', (route) => { pedidos++; return responderJson(route, {}); });
  await abrir(page);

  await page.getByRole('button', { name: 'Finalizar consulta' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Volver' }).click();

  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(pedidos).toBe(0);
});

test('el error al agregar un ítem aparece debajo de su formulario', async ({ page }) => {
  await page.route('**/api/pacientes/consultas/7/insumos', (route) => responderJson(route,
    { error: 'La cantidad total de este ítem en la consulta no puede superar 100000.', campos: {} }, 400));
  await abrir(page);

  await page.locator('#sel-insumos').selectOption('101');
  await page.getByRole('button', { name: 'Agregar insumo' }).click();

  const mensaje = page.locator('#mensaje-insumos');
  await expect(mensaje).toHaveText('La cantidad total de este ítem en la consulta no puede superar 100000.');
  await expect(mensaje).toBeInViewport({ ratio: 1 });
});

test('agregar sin elegir un ítem avisa con el estilo del sitio, no con el del navegador', async ({ page }) => {
  await abrir(page);

  await page.getByRole('button', { name: 'Agregar insumo' }).click();

  await expect(page.locator('#mensaje-insumos')).toHaveText('Elegí un insumo de la lista.');
});

test('al guardar, avisa junto al botón', async ({ page }) => {
  await page.route('**/api/pacientes/consultas/7', (route) => responderJson(route, CONSULTA));
  await abrir(page);

  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.locator('#mensaje-guardar')).toHaveText('Cambios guardados.');
  await expect(page.locator('#mensaje-guardar')).toBeInViewport({ ratio: 1 });
});
