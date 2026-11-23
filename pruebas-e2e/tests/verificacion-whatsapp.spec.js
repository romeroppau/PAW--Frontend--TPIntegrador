// Verificación del WhatsApp (Entrega 5): registrarse y cambiar el número solo con el código que llega
// por WhatsApp. La API se simula con el formato de docs/api/contrato.md de Backend, sección
// "Verificación del WhatsApp".
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const CLIENTE = { id: 102, nombre: 'Cliente de Prueba', email: 'cliente@prueba.huellavet', rol: 'CLIENTE' };
const CUENTA = { id: 102, nombre: 'Cliente de Prueba', email: 'cliente@prueba.huellavet', telefono: '2323555555', rol: 'CLIENTE', organizacion: null };
const ENVIADO = (telefono) => ({
  mensaje: `Te mandamos un código por WhatsApp al ${telefono}.`, telefono, vence_en_minutos: 10, reenviar_en_segundos: 60,
});
const FALTA_CODIGO = { error: 'Datos inválidos', campos: { codigo: 'Escribí el código de 6 números que te llegó por WhatsApp' } };

async function completarRegistro(page) {
  await page.getByLabel('Nombre y apellido').fill('Ana Pérez');
  await page.getByLabel('Email').fill('ana@ejemplo.com');
  await page.getByLabel('Celular con WhatsApp').fill('2323 555555');
  await page.locator('#password').fill('Clave-Segura-2026');
  await page.locator('#confirmacion').fill('Clave-Segura-2026');
}

// ---------- Registro ----------

for (const [pagina, ruta, rol, panel] of [
  ['registro-cliente', 'cliente', 'CLIENTE', '/paneles/panel-cliente.html'],
  ['registro-rescatista', 'rescatista', 'RESCATISTA', '/paneles/panel-rescatista.html'],
]) {
  test(`${pagina}: la cuenta se crea con el código que llega por WhatsApp`, async ({ page }) => {
    await simularSesion(page, null);
    const registros = [];
    const codigos = [];
    await page.route(`**/api/auth/registro/${ruta}`, (route) => {
      const cuerpo = route.request().postDataJSON();
      registros.push(cuerpo);
      if (!cuerpo.codigo) return responderJson(route, FALTA_CODIGO, 400);
      if (cuerpo.codigo !== '482913') return responderJson(route, { error: 'Datos inválidos', campos: { codigo: 'El código no es correcto' } }, 400);
      return responderJson(route, { id: 15, nombre: 'Ana Pérez', email: 'ana@ejemplo.com', rol, csrf: 'x' }, 201);
    });
    await page.route('**/api/auth/registro/codigo', (route) => {
      codigos.push(route.request().postDataJSON());
      return responderJson(route, ENVIADO('2323555555'));
    });
    await page.goto(`/registros/${pagina}.html`);

    // El código no se ve hasta que se pide.
    await expect(page.locator('#campo-codigo')).toBeHidden();
    await completarRegistro(page);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    // Primero va el registro sin código; como solo falta el código, se manda el WhatsApp.
    await expect(page.getByLabel('Código que te llegó por WhatsApp')).toBeFocused();
    expect(registros[0].codigo).toBeUndefined();
    expect(codigos).toEqual([{ telefono: '2323 555555', nombre: 'Ana Pérez' }]);
    await expect(page.locator('#ayuda-codigo')).toContainText('Te mandamos un código por WhatsApp al 2323555555.');
    await expect(page.getByRole('button', { name: /Reenviar código \(\d+ s\)/ })).toBeDisabled();

    // Un código equivocado: el error en su campo, y no se pide otro WhatsApp.
    await page.getByLabel('Código que te llegó por WhatsApp').fill('111111');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page.locator('#error-codigo')).toHaveText('El código no es correcto');
    expect(codigos).toHaveLength(1);

    await page.getByLabel('Código que te llegó por WhatsApp').fill('482913');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();
    await expect(page).toHaveURL(panel);
    expect(registros.at(-1)).toMatchObject({ telefono: '2323 555555', codigo: '482913' });
  });
}

test('registro: si hay otros errores, no se manda el WhatsApp', async ({ page }) => {
  await simularSesion(page, null);
  let codigos = 0;
  await page.route('**/api/auth/registro/cliente', (route) => responderJson(route, { error: 'Ya existe una cuenta con ese email' }, 409));
  await page.route('**/api/auth/registro/codigo', (route) => { codigos++; return responderJson(route, ENVIADO('2323555555')); });
  await page.goto('/registros/registro-cliente.html');
  await completarRegistro(page);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page.locator('#mensaje-error')).toHaveText('Ya existe una cuenta con ese email');
  await expect(page.locator('#campo-codigo')).toBeHidden();
  expect(codigos).toBe(0);
});

test('registro: si WhatsApp no le llega a ese número, lo dice en el teléfono; cambiar el número pide otro código', async ({ page }) => {
  await simularSesion(page, null);
  let intentos = 0;
  await page.route('**/api/auth/registro/cliente', (route) => responderJson(route, FALTA_CODIGO, 400));
  await page.route('**/api/auth/registro/codigo', (route) => {
    intentos++;
    return intentos === 1
      ? responderJson(route, { error: 'Datos inválidos', campos: { telefono: 'No pudimos mandarte el código por WhatsApp a ese número. Revisá que sea tu celular y que tenga WhatsApp.' } }, 400)
      : responderJson(route, ENVIADO('2323666666'));
  });
  await page.goto('/registros/registro-cliente.html');
  await completarRegistro(page);
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page.locator('#error-telefono')).toHaveText('No pudimos mandarte el código por WhatsApp a ese número. Revisá que sea tu celular y que tenga WhatsApp.');
  await expect(page.locator('#campo-codigo')).toBeHidden();

  await page.getByLabel('Celular con WhatsApp').fill('2323 666666');
  await page.getByRole('button', { name: 'Crear cuenta' }).click();
  await expect(page.locator('#campo-codigo')).toBeVisible();

  // Si se corrige el número después de pedir el código, ese código ya no sirve: se oculta.
  await page.getByLabel('Celular con WhatsApp').fill('2323 777777');
  await expect(page.locator('#campo-codigo')).toBeHidden();
});

// ---------- Cambiar el número en Mis datos ----------

test('mis datos: el número cambia recién al confirmar el código del número nuevo', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  const pedidos = [];
  await page.route('**/api/cuenta', (route) => responderJson(route, CUENTA));
  await page.route('**/api/cuenta/telefono/codigo', (route) => {
    pedidos.push(route.request().postDataJSON());
    return responderJson(route, ENVIADO('2323666666'));
  });
  await page.route('**/api/cuenta/telefono', (route) => {
    const { codigo } = route.request().postDataJSON();
    return codigo === '482913'
      ? responderJson(route, { ...CUENTA, telefono: '2323666666' })
      : responderJson(route, { error: 'Datos inválidos', campos: { codigo: 'El código no es correcto' } }, 400);
  });
  await page.goto('/cuenta/mis-datos.html');

  await page.getByRole('button', { name: 'Cambiar número' }).click();
  const bloque = page.locator('#bloque-telefono');
  await expect(bloque).toBeVisible();
  await expect(page.getByLabel('Celular nuevo con WhatsApp')).toBeFocused();
  await expect(bloque.getByRole('button', { name: 'Confirmar número' })).toBeHidden();

  await page.getByLabel('Celular nuevo con WhatsApp').fill('2323 666666');
  await bloque.getByRole('button', { name: 'Enviar código por WhatsApp' }).click();
  expect(pedidos).toEqual([{ telefono: '2323 666666' }]);
  await expect(page.locator('#ayuda-codigo')).toContainText('Te mandamos un código por WhatsApp al 2323666666.');

  // Código equivocado: el número no cambia.
  await page.getByLabel('Código que te llegó por WhatsApp').fill('000000');
  await bloque.getByRole('button', { name: 'Confirmar número' }).click();
  await expect(page.locator('#error-codigo')).toHaveText('El código no es correcto');
  await expect(page.getByLabel('Teléfono', { exact: true })).toHaveValue('2323555555');

  await page.getByLabel('Código que te llegó por WhatsApp').fill('482913');
  await bloque.getByRole('button', { name: 'Confirmar número' }).click();
  await expect(bloque).toBeHidden();
  await expect(page.getByLabel('Teléfono', { exact: true })).toHaveValue('2323666666');
  await expect(page.locator('#ok-telefono')).toHaveText('Listo: tu WhatsApp ahora es 2323666666.');
});

test('mis datos: los errores al pedir el código (mismo número, esperar) y cancelar', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  let veces = 0;
  await page.route('**/api/cuenta', (route) => responderJson(route, CUENTA));
  await page.route('**/api/cuenta/telefono/codigo', (route) => {
    veces++;
    return veces === 1
      ? responderJson(route, { error: 'Datos inválidos', campos: { telefono: 'Ese ya es tu número' } }, 400)
      : responderJson(route, { error: 'Esperá 40 segundos para pedir otro código', espera_segundos: 40 }, 429);
  });
  await page.goto('/cuenta/mis-datos.html');
  await page.getByRole('button', { name: 'Cambiar número' }).click();
  const bloque = page.locator('#bloque-telefono');

  await page.getByLabel('Celular nuevo con WhatsApp').fill('2323 555555');
  await bloque.getByRole('button', { name: 'Enviar código por WhatsApp' }).click();
  await expect(page.locator('#error-telefono')).toHaveText('Ese ya es tu número');

  await page.getByLabel('Celular nuevo con WhatsApp').fill('2323 666666');
  await bloque.getByRole('button', { name: 'Enviar código por WhatsApp' }).click();
  await expect(page.locator('#error-telefono-general')).toHaveText('Esperá 40 segundos para pedir otro código');
  await expect(bloque.getByRole('button', { name: /Reenviar código \(\d+ s\)/ })).toBeDisabled();

  await bloque.getByRole('button', { name: 'Cancelar' }).click();
  await expect(bloque).toBeHidden();
  await expect(page.getByRole('button', { name: 'Cambiar número' })).toBeFocused();
});
