// Menú de quien no inició sesión (24/11, js/barra-rol.js MENU_PUBLICO): el mismo diseño que el de un
// rol, con Tienda, Adopción, Reseñas y Contactanos. Y la sección Contactanos de la portada.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

test('sin sesión, la barra tiene Tienda, Adopción, Reseñas y Contactanos, con el diseño de la del panel', async ({ page }) => {
  await simularSesion(page, null);
  await page.goto('/index.html');
  const barra = page.locator('nav.panel-nav');
  await expect(barra.locator('summary')).toHaveText(['Tienda', 'Adopción', 'Reseñas']);
  await expect(barra.getByRole('link', { name: 'Contactanos' })).toHaveAttribute('href', '/index.html#contacto');
  await expect(page.locator('#sesion').getByRole('link')).toHaveText(['Inicia sesión', 'Registro']);
  await expect(page.locator('header.encabezado')).toHaveCount(0);

  await page.locator('#menu-tienda summary').click();
  await expect(page.locator('#menu-tienda .panel-opciones').getByRole('link'))
    .toHaveText(['Promociones', 'Ver catálogo de productos', 'Medicamentos', 'Alimento balanceado', 'Accesorios']);
  await expect(page.locator('#menu')).not.toContainText('Mis compras');

  await page.locator('#menu-adopcion summary').click();
  await expect(page.locator('#menu-adopcion').getByRole('link', { name: 'Mis postulaciones' }))
    .toHaveAttribute('href', '/login/login.html?volver=%2Fadopciones%2Fadopciones.html%23seccion-mias');
  await page.locator('#menu-resenas summary').click();
  await expect(page.locator('#menu-resenas').getByRole('link', { name: 'Escribir reseña' }))
    .toHaveAttribute('href', '/login/login.html?volver=%2Fresenas%2Fescribir.html');
});

test('sin sesión, el login no muestra pestañas, y la tienda tiene Promociones y el catálogo', async ({ page }) => {
  await simularSesion(page, null);
  await page.goto('/login/login.html');
  await expect(page.locator('nav.panel-nav')).toBeVisible();
  await expect(page.locator('nav.pestanas-seccion')).toHaveCount(0);

  await page.route('**/api/tienda/promociones', (route) => responderJson(route, { datos: [] }));
  await page.goto('/catalogo/promociones.html');
  await expect(page.locator('nav.pestanas-seccion').getByRole('link')).toHaveText(['Promociones', 'Ver catálogo de productos']);
});

test('la portada tiene la sección Contactanos, con el horario configurado y el mapa', async ({ page }) => {
  await simularSesion(page, null);
  await page.route('**/api/pacientes/horario', (route) => responderJson(route, { apertura: '09:30', cierre: '18:00' }));
  await page.goto('/index.html');
  const contacto = page.locator('#contacto');
  await expect(contacto.getByRole('heading', { name: 'Contactanos' })).toBeVisible();
  await expect(contacto).toContainText('Av. San Martín 1450, Luján');
  await expect(contacto.getByRole('link', { name: '11 3901-0486' })).toHaveAttribute('href', 'tel:+541139010486');
  await expect(page.locator('#horario-atencion')).toHaveText('De 09:30 a 18:00');
  await expect(contacto.getByRole('link', { name: 'Escribinos por WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\//);
  await expect(contacto.locator('iframe')).toHaveAttribute('title', 'Mapa: HuellaVet, Av. San Martín 1450, Luján');

  await page.locator('nav.panel-nav').getByRole('link', { name: 'Contactanos' }).click();
  await expect(contacto).toBeInViewport();
});

test('con sesión, la barra pública se cambia por la del rol', async ({ page }) => {
  await simularSesion(page, { id: 102, nombre: 'Sofía', email: 'c@x', rol: 'CLIENTE' });
  await page.goto('/index.html');
  await expect(page.locator('#menu-cuenta')).toBeAttached();
  await expect(page.locator('nav.panel-nav')).toHaveCount(1);
  await expect(page.locator('#sesion')).not.toContainText('Inicia sesión');
});
