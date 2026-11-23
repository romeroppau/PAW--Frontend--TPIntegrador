// Portada: datos de contacto reales y productos destacados tomados del catálogo.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion, PRODUCTOS } = require('./ayudas');

test('la portada no tiene textos de ejemplo y el botón abre el WhatsApp de la veterinaria', async ({ page }) => {
  await simularSesion(page, null);
  await page.route(/\/api\/tienda\/productos/, (route) => responderJson(route, { datos: PRODUCTOS }));

  await page.goto('/index.html');
  await expect(page.locator('main address')).toHaveText('Av. San Martín 1450, Luján');
  await expect(page.getByRole('link', { name: 'Reservar turno' })).toHaveAttribute('href', /wa\.me\/5491139010486/);
  await expect(page.locator('body')).not.toContainText('Calle Falsa');
  await expect(page.locator('body')).not.toContainText('de ejemplo');
});

test('los destacados son productos disponibles del catálogo, con enlace al detalle', async ({ page }) => {
  await simularSesion(page, null);
  const productos = [{ ...PRODUCTOS[0], disponible: false }, PRODUCTOS[1], PRODUCTOS[2]];
  await page.route(/\/api\/tienda\/productos/, (route) => responderJson(route, { datos: productos }));

  await page.goto('/index.html');
  await expect(page.locator('#destacados article')).toHaveCount(2);
  await expect(page.locator('#destacados')).not.toContainText('Alimento cachorro');
  await expect(page.locator('#destacados')).toContainText('Collar reflectivo');
  await expect(page.getByRole('link', { name: 'Ver detalle de Collar reflectivo' })).toHaveAttribute('href', '/catalogo/producto.html?id=102');
});

test('si el catálogo no responde, la sección de destacados no se muestra', async ({ page }) => {
  await simularSesion(page, null);
  await page.route(/\/api\/tienda\/productos/, (route) => responderJson(route, { error: 'x' }, 500));

  await page.goto('/index.html');
  await expect(page.locator('#seccion-destacados')).toBeHidden();
});

test('la portada muestra el horario de atención que configuró la veterinaria', async ({ page }) => {
  await simularSesion(page, null);
  await page.route('**/api/pacientes/horario', (route) => responderJson(route, { apertura: '09:30', cierre: '18:00' }));
  await page.goto('/index.html');
  await expect(page.locator('.hero-ubicacion')).toContainText('Atendemos de lunes a sábado de 09:30 a 18:00');
});
