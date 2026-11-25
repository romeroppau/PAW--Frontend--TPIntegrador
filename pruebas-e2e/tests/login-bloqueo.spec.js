// Login con la cuenta bloqueada (25/11): 5 intentos fallidos la bloquean 15 minutos. El servidor responde
// 429 con los segundos que faltan; la pantalla lo dice y no deja escribir la contraseña hasta que pase.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const BLOQUEADA = {
  error: 'Tu cuenta quedó bloqueada por 15 minutos por demasiados intentos fallidos. Probá de nuevo en 15 minutos.',
  bloqueada: true, segundos_restantes: 900,
};

test('con la cuenta bloqueada avisa hasta qué hora y no deja escribir la contraseña', async ({ page }) => {
  await simularSesion(page, null);
  let pedidos = 0;
  await page.route('**/api/auth/login', (route) => { pedidos++; return responderJson(route, BLOQUEADA, 429); });

  await page.goto('/login/login.html');
  await page.fill('#email', 'cliente@prueba.huellavet');
  await page.fill('#password', 'La-Correcta-2026');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();

  await expect(page.locator('#mensaje-error')).toContainText('Tu cuenta quedó bloqueada por demasiados intentos fallidos');
  await expect(page.locator('#mensaje-error')).toContainText('(en 15 minutos)');
  await expect(page.locator('#password')).toBeDisabled();
  await expect(page.locator('#password')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: true })).toBeDisabled();
  expect(pedidos).toBe(1);

  // Otra cuenta: se puede volver a intentar.
  await page.fill('#email', 'otra@prueba.huellavet');
  await expect(page.locator('#password')).toBeEnabled();
  await expect(page.locator('#mensaje-error')).toBeHidden();
});

test('cuando termina el bloqueo se puede volver a escribir la contraseña', async ({ page }) => {
  await simularSesion(page, null);
  await page.route('**/api/auth/login', (route) => responderJson(route, { ...BLOQUEADA, segundos_restantes: 2 }, 429));
  await page.goto('/login/login.html');
  await page.fill('#email', 'cliente@prueba.huellavet');
  await page.fill('#password', 'x');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.locator('#password')).toBeDisabled();
  await expect(page.locator('#password')).toBeEnabled({ timeout: 5000 });
  await expect(page.locator('#mensaje-error')).toBeHidden();
});

test('una contraseña incorrecta (sin bloqueo) sigue diciendo el mensaje de siempre', async ({ page }) => {
  await simularSesion(page, null);
  await page.route('**/api/auth/login', (route) => responderJson(route, { error: 'Email o contraseña incorrectos' }, 401));
  await page.goto('/login/login.html');
  await page.fill('#email', 'cliente@prueba.huellavet');
  await page.fill('#password', 'mal');
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  await expect(page.locator('#mensaje-error')).toHaveText('Email o contraseña incorrectos');
  await expect(page.locator('#password')).toBeEnabled();
});
