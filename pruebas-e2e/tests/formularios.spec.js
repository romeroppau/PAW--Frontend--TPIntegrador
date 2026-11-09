// Formularios: los errores se muestran con el estilo del sitio, y el menú lleva a una pantalla útil.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };

test('el login vacío avisa debajo de cada campo y no llama a la API', async ({ page }) => {
  let pedidos = 0;
  await simularSesion(page, null);
  await page.route('**/api/auth/login', (route) => { pedidos++; return responderJson(route, {}); });

  await page.goto('/login/login.html');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();

  await expect(page.locator('#error-email')).toHaveText('Ingresá tu email');
  await expect(page.locator('#error-password')).toHaveText('Ingresá tu contraseña');
  expect(pedidos).toBe(0);
});

for (const pagina of ['registro-cliente', 'registro-rescatista']) {
  test(`${pagina}: el error de cada campo viene del servidor, sin cartel del navegador`, async ({ page }) => {
    await simularSesion(page, null);
    await page.route('**/api/auth/registro/**', (route) => responderJson(route,
      { error: 'Datos inválidos', campos: { nombre: 'El nombre es obligatorio' } }, 400));

    await page.goto(`/registros/${pagina}.html`);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.locator('#error-nombre')).toHaveText('El nombre es obligatorio');
  });
}

test('"Atender consulta" del menú lleva a la agenda', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/pacientes/turnos**', (route) => responderJson(route, { fecha: '2026-11-09', turnos: [] }));

  await page.goto('/paneles/panel-administrador.html');
  await page.getByRole('link', { name: 'Atender consulta' }).click();

  await expect(page).toHaveURL(/\/panel\/agenda\.html$/);
});
