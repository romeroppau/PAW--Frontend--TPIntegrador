// Consulta: lo que ve el veterinario cuando no se puede finalizar.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };
const CONSULTA = {
  id: 7, turno_id: 101, mascota_id: 101, motivo: 'CONSULTA', estado: 'ABIERTA', diagnostico: 'Otitis',
  observaciones: null, valor_base: '8000.00', finalizada_en: null, total: '8300.00',
  insumos: [{ id: 1, insumo_id: 103, nombre: 'Gasa estéril', cantidad: 2, costo_unitario: '150.00' }],
  productos: []
};

async function abrirConsulta(page, respuestaFinalizar, estado) {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/pacientes/consultas/7', (route) => responderJson(route, CONSULTA));
  await page.route('**/api/inventario/insumos', (route) => responderJson(route, { datos: [] }));
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: [] }));
  await page.route('**/api/pacientes/consultas/7/finalizar', (route) => responderJson(route, respuestaFinalizar, estado));
  page.once('dialog', (dialogo) => dialogo.accept());
  await page.goto('/panel/consulta.html?id=7');
  await expect(page.locator('#ficha')).toBeVisible();
  await page.getByRole('button', { name: 'Finalizar consulta' }).click();
}

test('si un insumo se dio de baja, dice cuál hay que quitar', async ({ page }) => {
  await abrirConsulta(page, {
    error: 'Hay insumos o productos dados de baja en la consulta. Quitalos e intentá de nuevo.',
    motivo: 'DADO_DE_BAJA',
    items: [{ tipo: 'INSUMO', id: 103 }]
  }, 409);

  await expect(page.locator('#estado')).toHaveText('Estos ítems están dados de baja: Gasa estéril. Quitalos de la consulta para poder finalizar.');
});

test('sin stock suficiente, sigue diciendo cuánto hay', async ({ page }) => {
  await abrirConsulta(page, { error: 'Stock insuficiente', items: [{ tipo: 'INSUMO', id: 103, stock: 1 }] }, 409);

  await expect(page.locator('#estado')).toHaveText('No hay stock suficiente de: Gasa estéril (stock disponible: 1).');
});
