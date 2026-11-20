// Campana de notificaciones (js/notificaciones.js): la fecha de cada aviso va en día/mes/año.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

test('la campana muestra la fecha de cada aviso como día/mes/año', async ({ page }) => {
  await simularSesion(page, { id: 102, nombre: 'Cliente de Prueba', email: 'c@prueba.huellavet', rol: 'CLIENTE' });
  await page.route('**/api/notificaciones', (route) => responderJson(route, {
    no_leidas: 1,
    datos: [{ id: 1, mensaje: 'Recibimos el pago de tu pedido V-000105.', fecha: '2026-11-20 16:36:00', leida: false }],
  }));
  await page.goto('/index.html');

  // En celular la campana está dentro del menú hamburguesa.
  const menu = page.locator('#menu-boton');
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Notificaciones, 1 sin leer' }).click();
  const aviso = page.locator('.campana-item').first();
  await expect(aviso).toContainText('Recibimos el pago de tu pedido V-000105.');
  await expect(aviso.locator('small')).toHaveText('20/11/2026 16:36');
});
