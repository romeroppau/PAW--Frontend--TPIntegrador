// Mis turnos del cliente: los próximos y los de los últimos 30 días.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const CLIENTE = { id: 102, nombre: 'Cliente', email: 'c@prueba.huellavet', rol: 'CLIENTE' };
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const dia = (n) => new Date(new Date(HOY + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);

function turno(id, fecha, estado, mascota = 'Firulais') {
  return {
    id, fecha, hora: '10:00', motivo: 'CONSULTA', estado,
    mascota: { id: 101, nombre: mascota, especie: 'PERRO' },
    duenio: { id: 102, nombre: 'Cliente', telefono: null },
    veterinario: { id: 101, nombre: 'Vet' }, consulta_id: estado === 'ATENDIDO' ? 7 : null
  };
}

test('separa los turnos próximos de los anteriores, y los atendidos enlazan al historial', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/pacientes/turnos', (route) => responderJson(route, { turnos: [
    turno(1, dia(-10), 'ATENDIDO'),
    turno(2, dia(-3), 'CANCELADO', 'Michi'),
    turno(3, dia(2), 'PROGRAMADO'),
    turno(4, dia(5), 'CANCELADO', 'Michi')
  ] }));

  await page.goto('/cliente/turnos.html');

  await expect(page.locator('#filas-proximos > tr')).toHaveCount(1);
  await expect(page.locator('#filas-proximos tr[data-id="3"]')).toContainText('Programado');
  // Anteriores: el más reciente primero. Un cancelado futuro también va acá: ya no es un turno próximo.
  await expect(page.locator('#filas-anteriores > tr')).toHaveCount(3);
  await expect(page.locator('#filas-anteriores > tr').first()).toHaveAttribute('data-id', '4');
  // Las dos listas están en pestañas, con la cantidad de cada una.
  await expect(page.getByRole('tab', { name: 'Próximos (1)' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Anteriores y cancelados (3)' }).click();
  await expect(page.locator('tr[data-id="1"]').getByRole('link', { name: /Ver la consulta de Firulais/ }))
    .toHaveAttribute('href', '/cliente/historial.html?mascota=101');
  await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute('href', /wa\.me\/5491139010486/);
});

test('sin turnos lo dice en cada sección', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/pacientes/turnos', (route) => responderJson(route, { turnos: [] }));

  await page.goto('/cliente/turnos.html');

  await expect(page.locator('#vacio-proximos')).toHaveText('No tenés turnos próximos.');
  await expect(page.locator('#vacio-anteriores')).toHaveText('No tuviste turnos en los últimos 30 días.');
});

test('los filtros por mascota y estado valen para las dos pestañas y se limpian', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  // Michi con su propio id: el filtro agrupa por mascota (id), como con los datos reales.
  const deMichi = (t) => ({ ...t, mascota: { id: 202, nombre: 'Michi', especie: 'GATO' } });
  await page.route('**/api/pacientes/turnos', (route) => responderJson(route, { turnos: [
    turno(1, dia(-10), 'ATENDIDO'),
    deMichi(turno(2, dia(-3), 'CANCELADO')),
    turno(3, dia(2), 'PROGRAMADO'),
    deMichi(turno(4, dia(5), 'PROGRAMADO'))
  ] }));

  await page.goto('/cliente/turnos.html');
  await expect(page.locator('#filtro-mascota option')).toHaveText(['Todas', 'Firulais', 'Michi']);

  await page.selectOption('#filtro-mascota', { label: 'Michi' });
  await expect(page.locator('#filas-proximos > tr')).toHaveCount(1);
  await expect(page.getByRole('tab', { name: 'Próximos (1)' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Anteriores y cancelados (1)' })).toBeVisible();

  await page.selectOption('#filtro-estado', 'ATENDIDO');
  await expect(page.locator('#vacio-proximos')).toHaveText('Ningún turno próximo coincide con los filtros.');

  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(page.getByRole('tab', { name: 'Próximos (2)' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Anteriores y cancelados (2)' })).toBeVisible();
});

test('el turno del chequeo de una adopción en curso aparece entre los próximos', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/pacientes/turnos', (route) => responderJson(route, { turnos: [turno(3, dia(4), 'PROGRAMADO')] }));
  await page.route('**/api/adopciones/mis-postulaciones', (route) => responderJson(route, { postulaciones: [{
    id: 7, estado: 'ELEGIDA', fecha: '2026-11-15 18:20:00',
    adopcion: { id: 31, estado: 'CHEQUEO_PENDIENTE', turno_chequeo: { fecha: dia(2), hora: '10:00', estado: 'PROGRAMADO' } },
    publicacion: { id: 1, titulo: 'Pipa', mascota: { id: 902, nombre: 'Pipa' } },
  }] }));

  await page.goto('/cliente/turnos.html');
  const filas = page.locator('#filas-proximos > tr');
  await expect(filas).toHaveCount(2);
  // Ordenados por fecha: el chequeo (en 2 días) antes que el otro turno (en 4).
  await expect(filas.first()).toContainText('Pipa (en adopción)');
  await expect(filas.first()).toContainText('Chequeo de adopción');
});

test('el veterinario no entra a "Mis turnos"', async ({ page }) => {
  await simularSesion(page, { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' });
  await page.goto('/cliente/turnos.html');
  await expect(page).toHaveURL(/\/login\/login\.html$/);
});
