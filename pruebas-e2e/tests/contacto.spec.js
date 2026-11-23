// Datos de la veterinaria (dirección, teléfono, WhatsApp, email y redes): los carga ella en
// Configuración y las páginas los leen de GET /api/configuracion/contacto (js/contacto.js).
// Contrato: docs/api/contrato.md de Backend, sección "Configuración".
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const CLIENTE = { id: 102, nombre: 'Sofía Benítez', email: 'cliente@prueba.huellavet', rol: 'CLIENTE' };
const CONTACTO = {
  direccion: 'Mitre 250, Mercedes',
  telefono: '2324 42-1234',
  whatsapp: '2324 555-555',
  email: 'hola@huellavet.com.ar',
  instagram: 'https://www.instagram.com/huellavet',
  facebook: null,
  youtube: null,
  enlaces: { telefono: 'tel:+542324421234', whatsapp: 'https://wa.me/5492324555555' },
};

const simularContacto = (page, datos = CONTACTO) =>
  page.route('**/api/configuracion/contacto', (route) => responderJson(route, datos));

test('la portada y el pie usan los datos que cargó la veterinaria', async ({ page }) => {
  await simularSesion(page, null);
  await simularContacto(page);
  await page.goto('/index.html');

  await expect(page.locator('.hero-intro address')).toHaveText('Mitre 250, Mercedes');
  await expect(page.getByRole('link', { name: 'Reservar turno' }))
    .toHaveAttribute('href', 'https://wa.me/5492324555555?text=Hola%2C%20quiero%20reservar%20un%20turno');

  const pie = page.locator('footer.pie');
  await expect(pie.getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', 'https://www.instagram.com/huellavet');
  // Las redes sin cargar no se muestran.
  await expect(pie.getByRole('link', { name: 'Facebook' })).toBeHidden();
  await expect(pie.getByRole('link', { name: 'YouTube' })).toBeHidden();
  await expect(pie.getByRole('link', { name: '2324 42-1234' })).toHaveAttribute('href', 'tel:+542324421234');
  await expect(pie.getByRole('link', { name: 'hola@huellavet.com.ar' })).toHaveAttribute('href', 'mailto:hola@huellavet.com.ar');
  await expect(pie).toContainText('Mitre 250, Mercedes');
});

test('sin redes cargadas no aparece "Seguinos", y ningún ícono lleva a "#"', async ({ page }) => {
  await simularSesion(page, null);
  await simularContacto(page, { ...CONTACTO, instagram: null, email: null });
  await page.goto('/login/login.html');

  const pie = page.locator('footer.pie');
  await expect(pie).toContainText('Mitre 250, Mercedes');
  await expect(pie.getByRole('heading', { name: 'Seguinos' })).toBeHidden();
  await expect(pie.locator('a[href="#"]:visible')).toHaveCount(0);
});

test('si la API no responde, quedan los datos de siempre (y tampoco hay íconos a "#")', async ({ page }) => {
  await simularSesion(page, null);
  await page.route('**/api/configuracion/contacto', (route) => route.fulfill({ status: 500, body: '' }));
  await page.goto('/index.html');

  await expect(page.locator('.hero-intro address')).toHaveText('Av. San Martín 1450, Luján');
  await expect(page.locator('footer.pie a[href="#"]:visible')).toHaveCount(0);
});

test('Contactanos del panel, el mapa y el WhatsApp de la barra usan los datos configurados', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await simularContacto(page);
  await page.goto('/paneles/panel-cliente.html');

  const contacto = page.locator('#contacto');
  await expect(contacto).toContainText('Mitre 250, Mercedes');
  await expect(contacto.getByRole('link', { name: '2324 42-1234' })).toHaveAttribute('href', 'tel:+542324421234');
  await expect(contacto.getByRole('link', { name: 'hola@huellavet.com.ar' })).toBeVisible();
  await expect(contacto.getByRole('link', { name: 'Escribinos por WhatsApp' }))
    .toHaveAttribute('href', 'https://wa.me/5492324555555?text=Hola%2C%20tengo%20una%20consulta');
  await expect(contacto.getByRole('link', { name: 'Cómo llegar' })).toHaveAttribute('href', /query=Mitre%20250%2C%20Mercedes/);
  await expect(contacto.locator('iframe')).toHaveAttribute('src', /maps\?q=Mitre%20250%2C%20Mercedes/);

  await expect(page.locator('#menu').getByRole('link', { name: 'Pedir turno por WhatsApp', includeHidden: true }))
    .toHaveAttribute('href', 'https://wa.me/5492324555555?text=Hola%2C%20quiero%20solicitar%20un%20turno');
});

test('el detalle de un producto consulta por el WhatsApp configurado', async ({ page }) => {
  await simularSesion(page, null);
  await simularContacto(page);
  await page.route('**/api/tienda/productos/101', (route) => responderJson(route, {
    id: 101, nombre: 'Collar reflectivo', categoria: 'ACCESORIO', especie: 'PERRO', precio: 8500, vencimiento: null, disponible: true, stock: 5,
  }));
  await page.goto('/catalogo/producto.html?id=101');

  await expect(page.getByRole('link', { name: 'Consultar por WhatsApp' }))
    .toHaveAttribute('href', /^https:\/\/wa\.me\/5492324555555\?text=Hola%2C%20quiero%20consultar%20por%20Collar%20reflectivo/);
});

test('Configuración: los datos de la veterinaria se editan como texto y se pueden dejar vacíos', async ({ page }) => {
  await simularSesion(page, { id: 101, nombre: 'Dra. Laura Martínez', email: 'vet@prueba.huellavet', rol: 'VETERINARIO' });
  const texto = (clave, nombre, formato, defecto, extra = {}) => ({
    clave, grupo: 'CONTACTO', nombre_grupo: 'Datos de la veterinaria', nombre, ayuda: `Ayuda de ${nombre}.`,
    tipo: 'TEXTO', formato, unidad: null, minimo: defecto === '' ? 0 : 5, maximo: 255,
    defecto, valor: defecto, modificado: false, actualizado_en: null, actualizado_por: null, ...extra,
  });
  let enviado = null;
  await page.route('**/api/configuracion', (route) => {
    if (route.request().method() === 'PUT') {
      enviado = route.request().postDataJSON().valores;
      return responderJson(route, { error: 'Revisá los valores marcados', campos: { facebook: 'Tiene que ser un enlace https de facebook.com' } }, 400);
    }
    return responderJson(route, { parametros: [
      texto('direccion', 'Dirección', 'TEXTO', 'Av. San Martín 1450, Luján'),
      texto('instagram', 'Instagram', 'URL', '', { valor: 'https://www.instagram.com/huellavet', modificado: true, actualizado_en: '2026-11-23 10:00:00', actualizado_por: 'Dra. Laura Martínez' }),
      texto('facebook', 'Facebook', 'URL', ''),
    ] });
  });
  await page.goto('/panel/configuracion.html');

  await expect(page.locator('legend')).toHaveText(['Datos de la veterinaria']);
  await expect(page.getByLabel('Dirección')).toHaveValue('Av. San Martín 1450, Luján');
  await expect(page.locator('#ayuda-direccion')).toHaveText('Ayuda de Dirección. Por defecto: Av. San Martín 1450, Luján.');
  await expect(page.getByLabel('Instagram')).toHaveAttribute('type', 'url');
  await expect(page.getByRole('button', { name: 'Usar el valor por defecto (vacío)' })).toBeVisible();

  await page.getByLabel('Facebook').fill('https://www.instagram.com/otra');
  await page.locator('[data-defecto="instagram"]').click();
  await expect(page.getByLabel('Instagram')).toHaveValue('');
  await page.getByRole('button', { name: 'Guardar' }).click();
  expect(enviado).toEqual({ instagram: '', facebook: 'https://www.instagram.com/otra' });
  await expect(page.locator('#error-facebook')).toHaveText('Tiene que ser un enlace https de facebook.com');
});
