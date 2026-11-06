// Mascotas: el cliente da de alta, edita y da de baja sus mascotas; el veterinario las ve todas.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const CLIENTE = { id: 102, nombre: 'Cliente', email: 'c@prueba.huellavet', rol: 'CLIENTE' };
const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };
const DUENIO = { id: 102, nombre: 'Cliente de Prueba', telefono: '1155550102' };

function mascota(id, nombre, extra = {}) {
  return {
    id, nombre, especie: 'PERRO', raza: null, fecha_nacimiento: '2023-11-05', edad_meses: 36,
    peso_kg: '18.50', tiene_foto: false, activo: true, duenio: DUENIO, ...extra
  };
}

// Simula GET /api/pacientes/mascotas con una lista que las pruebas pueden cambiar, y anota las búsquedas.
async function simularListado(page, lista) {
  const busquedas = [];
  await page.route(/\/api\/pacientes\/mascotas(\?.*)?$/, (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    busquedas.push(new URL(route.request().url()).searchParams.get('buscar'));
    return responderJson(route, { mascotas: lista });
  });
  return busquedas;
}

test('el cliente ve sus mascotas con la edad y los enlaces a su calendario e historial', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await simularListado(page, [mascota(101, 'Firulais'), mascota(102, 'Michi', { especie: 'GATO', edad_meses: 14, peso_kg: null })]);

  await page.goto('/cliente/mascotas.html');
  await expect(page.locator('#filas > tr')).toHaveCount(2);
  await expect(page.locator('tr[data-id="101"]')).toContainText('3 años');
  await expect(page.locator('tr[data-id="102"]')).toContainText('1 año y 2 meses');
  await expect(page.locator('tr[data-id="101"]').getByRole('link', { name: /Calendario/ })).toHaveAttribute('href', '/cliente/calendario.html?mascota=101');
  await expect(page.locator('#nueva')).toBeVisible();
});

test('dar de alta: los errores del servidor se ven en cada campo y, al corregir, la lista se actualiza sin recargar', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  const lista = [mascota(101, 'Firulais')];
  await simularListado(page, lista);
  const cuerpos = [];
  await page.route('**/api/pacientes/mascotas', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const cuerpo = route.request().postDataJSON();
    cuerpos.push(cuerpo);
    if (cuerpo.nombre === '') {
      return responderJson(route, { error: 'Revisá los datos de la mascota', campos: { nombre: 'El nombre es obligatorio' } }, 400);
    }
    lista.push(mascota(105, cuerpo.nombre, { especie: cuerpo.especie }));
    return responderJson(route, lista.at(-1), 201);
  });

  await page.goto('/cliente/mascotas.html');
  await page.evaluate(() => { window.sinRecargar = true; });
  await page.getByRole('button', { name: 'Nueva mascota' }).click();
  await page.selectOption('#especie', 'GATO');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#error-nombre')).toHaveText('El nombre es obligatorio');
  await expect(page.locator('#nombre')).toHaveAttribute('aria-invalid', 'true');

  await page.fill('#nombre', 'Pelusa');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#estado')).toHaveText('Pelusa quedó guardada.');
  await expect(page.locator('#filas > tr')).toHaveCount(2);
  await expect(page.locator('#seccion-form')).toBeHidden();
  expect(cuerpos.at(-1)).toEqual({ nombre: 'Pelusa', especie: 'GATO', raza: '', fecha_nacimiento: '', peso_kg: null });
  expect(await page.evaluate(() => window.sinRecargar)).toBe(true);
});

test('editar carga los datos de la mascota y guarda con PUT', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await simularListado(page, [mascota(101, 'Firulais', { raza: 'Mestizo' })]);
  let cuerpo = null;
  await page.route('**/api/pacientes/mascotas/101', (route) => {
    if (route.request().method() !== 'PUT') return route.fallback();
    cuerpo = route.request().postDataJSON();
    return responderJson(route, mascota(101, cuerpo.nombre));
  });

  await page.goto('/cliente/mascotas.html');
  await page.getByRole('button', { name: 'Editar Firulais' }).click();
  await expect(page.locator('#titulo-form')).toHaveText('Editar a Firulais');
  await expect(page.locator('#raza')).toHaveValue('Mestizo');
  await expect(page.locator('#peso_kg')).toHaveValue('18.50');

  await page.fill('#nombre', 'Firulais II');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('#estado')).toHaveText('Firulais II quedó guardada.');
  expect(cuerpo).toMatchObject({ nombre: 'Firulais II', especie: 'PERRO', raza: 'Mestizo', peso_kg: 18.5 });
});

test('si no se puede dar de baja (turnos programados), el motivo se ve en la fila', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await simularListado(page, [mascota(103, 'Luna')]);
  await page.route('**/api/pacientes/mascotas/103', (route) => route.request().method() === 'DELETE'
    ? responderJson(route, { error: 'La mascota tiene turnos programados: pedile a la veterinaria que los cancele', campos: {} }, 409)
    : route.fallback());

  await page.goto('/cliente/mascotas.html');
  page.once('dialog', (dialogo) => dialogo.accept());
  await page.getByRole('button', { name: 'Dar de baja a Luna' }).click();
  await expect(page.locator('tr[data-id="103"] [role="alert"]')).toHaveText(/turnos programados/);
});

test('el veterinario ve todas las mascotas con su dueño, busca, y no puede modificarlas', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  const busquedas = await simularListado(page, [mascota(101, 'Firulais')]);

  await page.goto('/cliente/mascotas.html');
  await expect(page.locator('h1')).toHaveText('Mascotas');
  await expect(page.locator('tr[data-id="101"]')).toContainText('Cliente de Prueba');
  await expect(page.locator('#nueva')).toBeHidden();
  await expect(page.locator('tr[data-id="101"] button')).toHaveCount(0);

  await page.fill('#buscar', 'firu');
  await expect.poll(() => busquedas.at(-1)).toBe('firu');
});
