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

test('el veterinario no entra a "Mis turnos"', async ({ page }) => {
  await simularSesion(page, { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' });
  await page.goto('/cliente/turnos.html');
  await expect(page).toHaveURL(/\/login\/login\.html$/);
});
