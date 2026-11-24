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

// "¡No te lo pierdas!": dos subtítulos, "Productos en descuento" y "Turnos en descuento".
const EN_PROMO = (p, porcentaje) => ({ ...p, promocion: { porcentaje, precio: p.precio * (100 - porcentaje) / 100, hasta: '2026-12-31' } });
const FRANJA = { id: 3, dia_semana: 2, franja: 'TARDE', porcentaje: 20, hasta: '2026-12-31', nombre: 'Martes a la tarde', precio: 15000, precio_promocion: 12000 };

test('"¡No te lo pierdas!": los productos en descuento, con enlace al detalle, y los turnos en descuento', async ({ page }) => {
  await simularSesion(page, null);
  const promos = [EN_PROMO(PRODUCTOS[1], 20), EN_PROMO(PRODUCTOS[2], 10), EN_PROMO(PRODUCTOS[0], 30), EN_PROMO({ ...PRODUCTOS[0], id: 109, nombre: 'Vitaminas' }, 5)];
  await page.route('**/api/tienda/promociones', (route) => responderJson(route, { datos: promos }));
  await page.route('**/api/pacientes/promociones-turnos', (route) => responderJson(route, { precio_consulta: 15000, datos: [FRANJA] }));

  await page.goto('/index.html');
  const seccion = page.locator('#seccion-destacados');
  await expect(seccion.getByRole('heading', { name: '¡No te lo pierdas!' })).toBeVisible();
  await expect(seccion.getByRole('heading', { name: 'Productos en descuento' })).toBeVisible();
  // Hasta 3 productos, y el enlace a todas las promociones porque hay más.
  await expect(page.locator('#destacados article')).toHaveCount(3);
  await expect(page.getByRole('link', { name: 'Ver detalle de Collar reflectivo' })).toHaveAttribute('href', '/catalogo/producto.html?id=102');
  await expect(page.getByRole('link', { name: 'Ver todas las promociones de la tienda' })).toBeVisible();
  await expect(seccion.getByRole('heading', { name: 'Turnos en descuento' })).toBeVisible();
  await expect(page.locator('#lista-promo-turnos')).toContainText('Martes a la tarde $ 12.000,00');
});

test('sin productos en descuento queda solo el bloque de turnos; sin nada, la sección no se muestra', async ({ page }) => {
  await simularSesion(page, null);
  let franjas = [FRANJA];
  await page.route('**/api/tienda/promociones', (route) => responderJson(route, { datos: [] }));
  await page.route('**/api/pacientes/promociones-turnos', (route) => responderJson(route, { precio_consulta: 15000, datos: franjas }));

  await page.goto('/index.html');
  await expect(page.locator('#promo-turnos')).toBeVisible();
  await expect(page.locator('#productos-descuento')).toBeHidden();

  franjas = [];
  await page.reload();
  await expect(page.locator('#seccion-destacados')).toBeHidden();
});

test('si la tienda no responde, la sección de destacados no se muestra', async ({ page }) => {
  await simularSesion(page, null);
  await page.route(/\/api\/tienda\//, (route) => responderJson(route, { error: 'x' }, 500));
  await page.route('**/api/pacientes/promociones-turnos', (route) => responderJson(route, { error: 'x' }, 500));

  await page.goto('/index.html');
  await expect(page.locator('#seccion-destacados')).toBeHidden();
});

test('la portada muestra el horario de atención que configuró la veterinaria', async ({ page }) => {
  await simularSesion(page, null);
  await page.route('**/api/pacientes/horario', (route) => responderJson(route, { apertura: '09:30', cierre: '18:00' }));
  await page.goto('/index.html');
  await expect(page.locator('.hero-ubicacion')).toContainText('Atendemos de lunes a sábado de 09:30 a 18:00');
});

test('la portada muestra la foto de la fachada, con su texto alternativo', async ({ page }) => {
  await simularSesion(page, null);
  await page.goto('/index.html');
  // En el celular la sección "¿Dónde nos encontramos?" está oculta: se revisa la imagen igual.
  const foto = page.locator('img.foto-fachada');
  await expect(foto).toHaveAttribute('src', '/img/fachada.jpg');
  await expect(foto).toHaveAttribute('alt', /Fachada de la veterinaria HuellaVet/);
  await expect(page.locator('.imagen-provisoria.fachada')).toHaveCount(0);
});
