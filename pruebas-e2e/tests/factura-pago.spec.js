// Marcar la factura de una consulta como pagada (27/11, devolución del profesor: "la factura queda
// pendiente de pago y no hay forma de pagarla"). La veterinaria elige el medio y confirma; el cliente
// ve cómo se pagó. La API se simula con el formato de docs/api/contrato-consultas.md de Pacientes.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const CLIENTE = { id: 102, nombre: 'Cliente', email: 'c@prueba.huellavet', rol: 'CLIENTE' };
const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };

const FACTURA = {
  numero: 'C-000101', subtotal_base: '15000.00', subtotal_insumos: '0.00', subtotal_productos: '0.00',
  total: '15000.00', estado: 'PENDIENTE_PAGO', fecha: '2026-11-10 10:42:00', medio_pago: null, pagada_en: null,
  consulta: { id: 7, fecha: '2026-11-10', hora: '10:00', motivo: 'CONSULTA', diagnostico: 'Control.', valor_base: '15000.00', insumos: [], productos: [] },
  mascota: { id: 104, nombre: 'Tom' },
  cliente: { id: 102, nombre: 'Cliente' },
};
const PAGADA = { ...FACTURA, estado: 'PAGADA', medio_pago: 'TRANSFERENCIA', pagada_en: '2026-11-27 11:05:00' };

test('la veterinaria marca la factura como pagada eligiendo el medio de pago', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/pacientes/consultas/7/factura', (route) => responderJson(route, FACTURA));
  let cuerpo = null;
  await page.route('**/api/pacientes/consultas/7/factura/pago', (route) => {
    cuerpo = route.request().postDataJSON();
    return responderJson(route, PAGADA);
  });
  await page.goto('/cliente/factura.html?consulta=7');

  await expect(page.locator('#estado-factura')).toHaveText('Pendiente de pago');
  const form = page.locator('#form-pago');
  await expect(form).toBeVisible();

  // Sin medio: error propio (no el del navegador) y no se manda nada.
  await form.getByRole('button', { name: 'Marcar como pagada' }).click();
  await expect(page.locator('#error-medio_pago')).toHaveText('Elegí el medio de pago: efectivo, transferencia o tarjeta');
  expect(cuerpo).toBeNull();

  await page.getByLabel('Medio de pago').selectOption('TRANSFERENCIA');
  await form.getByRole('button', { name: 'Marcar como pagada' }).click();
  const dialogo = page.getByRole('dialog');
  await expect(dialogo).toContainText('¿Marcar la factura C-000101');
  await expect(dialogo).toContainText('como pagada en transferencia?');
  await dialogo.getByRole('button', { name: 'Marcar como pagada' }).click();

  await expect(page.locator('#estado-pago')).toHaveText('Listo: la factura C-000101 quedó pagada en transferencia.');
  expect(cuerpo).toEqual({ medio_pago: 'TRANSFERENCIA' });
  await expect(page.locator('#estado-factura')).toHaveText('Pagada');
  await expect(page.locator('#pago')).toHaveText('Transferencia, el 27/11/2026');
  await expect(form).toBeHidden();
  await expect(page.locator('#nota-pago')).toBeHidden();
});

test('si al confirmar ya estaba pagada (409), se muestra como quedó', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  let pagada = false;
  await page.route('**/api/pacientes/consultas/7/factura', (route) => responderJson(route, pagada ? PAGADA : FACTURA));
  await page.route('**/api/pacientes/consultas/7/factura/pago', (route) => {
    pagada = true;
    return responderJson(route, { error: 'La factura ya está pagada', campos: {} }, 409);
  });
  await page.goto('/cliente/factura.html?consulta=7');

  await page.getByLabel('Medio de pago').selectOption('EFECTIVO');
  await page.locator('#form-pago').getByRole('button', { name: 'Marcar como pagada' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Marcar como pagada' }).click();

  await expect(page.locator('#estado-pago')).toHaveText('La factura ya estaba pagada.');
  await expect(page.locator('#estado-factura')).toHaveText('Pagada');
  await expect(page.locator('#form-pago')).toBeHidden();
});

test('el cliente no ve el botón: ve "Se abona en la veterinaria" y, pagada, el medio', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  let factura = FACTURA;
  await page.route('**/api/pacientes/consultas/7/factura', (route) => responderJson(route, factura));
  await page.goto('/cliente/factura.html?consulta=7');
  await expect(page.locator('#nota-pago')).toBeVisible();
  await expect(page.locator('#form-pago')).toBeHidden();
  await expect(page.locator('#dato-pago')).toBeHidden();

  factura = PAGADA;
  await page.reload();
  await expect(page.locator('#pago')).toHaveText('Transferencia, el 27/11/2026');
  await expect(page.locator('#form-pago')).toBeHidden();
});
