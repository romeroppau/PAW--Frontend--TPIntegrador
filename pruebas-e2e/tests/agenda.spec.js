// Agenda del veterinario: ver los turnos del día, cambiar de día y cambiar el estado de un turno
// sin recargar la página (segunda interacción con fetch de la consigna).
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };

// "Hoy" igual que en la página: el día de Argentina, AAAA-MM-DD.
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const MANIANA = new Date(new Date(HOY + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);

function turno(id, hora, mascota, estado, extra = {}) {
  return {
    id, fecha: HOY, hora, motivo: 'CONSULTA', estado,
    mascota: { id: id, nombre: mascota, especie: 'PERRO' },
    duenio: { id: 102, nombre: 'Cliente de Prueba', telefono: '1155550102' },
    veterinario: { id: 101, nombre: 'Vet' },
    consulta_id: null,
    ...extra
  };
}

const TURNOS_HOY = [
  turno(101, '08:00', 'Firulais', 'PROGRAMADO'),
  turno(102, '08:30', 'Luna', 'ATENDIDO', { consulta_id: 7 }),
  turno(103, '09:00', 'Michi', 'CANCELADO')
];

// Simula GET /api/pacientes/turnos?fecha=... y anota qué fechas se pidieron.
async function simularAgenda(page, turnosPorFecha) {
  const pedidas = [];
  await page.route(/\/api\/pacientes\/turnos\?fecha=/, (route) => {
    const fecha = new URL(route.request().url()).searchParams.get('fecha');
    pedidas.push(fecha);
    return responderJson(route, { fecha, turnos: turnosPorFecha[fecha] ?? [] });
  });
  return pedidas;
}

test('un cliente no puede ver la agenda', async ({ page }) => {
  await simularSesion(page, { id: 2, nombre: 'Cliente', email: 'c@prueba.huellavet', rol: 'CLIENTE' });
  await page.goto('/panel/agenda.html');
  await expect(page).toHaveURL(/\/login\/login\.html$/);
});

test('muestra los turnos de hoy con su estado y las acciones que corresponden', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await simularAgenda(page, { [HOY]: TURNOS_HOY });

  await page.goto('/panel/agenda.html');
  await expect(page.locator('#filas > tr')).toHaveCount(3);
  await expect(page.locator('#resumen')).toHaveText('3 turnos · Programado: 1 · Atendido: 1 · Cancelado: 1');

  const programado = page.locator('tr[data-id="101"]');
  await expect(programado).toContainText('Programado');
  await expect(programado.getByRole('link', { name: /Atender a Firulais/ })).toHaveAttribute('href', '/panel/consulta.html?turno=101');

  // El atendido enlaza a su consulta; el cancelado no tiene acciones.
  await expect(page.locator('tr[data-id="102"]').getByRole('link', { name: /Ver consulta/ })).toHaveAttribute('href', '/panel/consulta.html?id=7');
  await expect(page.locator('tr[data-id="103"] button')).toHaveCount(0);
});

test('cancelar un turno cambia su fila sin recargar la página', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await simularAgenda(page, { [HOY]: TURNOS_HOY });
  let pedidos = 0;
  await page.route('**/api/pacientes/turnos/101/cancelar', (route) => {
    pedidos++;
    return responderJson(route, { turno: { ...TURNOS_HOY[0], estado: 'CANCELADO' } });
  });

  await page.goto('/panel/agenda.html');
  await page.evaluate(() => { window.sinRecargar = true; });  // se pierde si la página se recarga
  await page.locator('tr[data-id="101"]').getByRole('button', { name: /Cancelar/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar turno' }).click();

  await expect(page.locator('tr[data-id="101"]')).toContainText('Cancelado');
  await expect(page.locator('tr[data-id="101"] button')).toHaveCount(0);
  await expect(page.locator('#resumen')).toHaveText('3 turnos · Atendido: 1 · Cancelado: 2');
  expect(pedidos).toBe(1);
  expect(await page.evaluate(() => window.sinRecargar)).toBe(true);
});

test('si el servidor rechaza el cambio, el error se ve en la fila', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await simularAgenda(page, { [HOY]: TURNOS_HOY });
  await page.route('**/api/pacientes/turnos/101/ausente', (route) =>
    responderJson(route, { error: 'El turno no está programado', campos: {} }, 409));

  await page.goto('/panel/agenda.html');
  await page.locator('tr[data-id="101"]').getByRole('button', { name: /Ausente/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Marcar ausente' }).click();

  await expect(page.locator('tr[data-id="101"] [role="alert"]')).toHaveText('El turno no está programado');
  await expect(page.locator('tr[data-id="101"]')).toContainText('Programado');
});

test('"Siguiente" trae los turnos de mañana sin recargar y deja la fecha en la URL', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  const pedidas = await simularAgenda(page, { [HOY]: TURNOS_HOY, [MANIANA]: [] });

  await page.goto('/panel/agenda.html');
  await expect(page.locator('#filas > tr')).toHaveCount(3);
  await page.evaluate(() => { window.sinRecargar = true; });

  await page.getByRole('button', { name: 'Día siguiente' }).click();
  await expect(page.locator('#estado')).toHaveText('No hay turnos para este día.');
  await expect(page).toHaveURL(new RegExp('\\?fecha=' + MANIANA + '$'));
  expect(pedidas).toEqual([HOY, MANIANA]);
  expect(await page.evaluate(() => window.sinRecargar)).toBe(true);
});

test('"Nuevo turno" lo carga y muestra su día en la agenda, sin recargar; un horario ocupado se ve en el campo hora', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  const turnosManiana = [];
  await simularAgenda(page, { [HOY]: TURNOS_HOY, [MANIANA]: turnosManiana });
  await page.route('**/api/pacientes/mascotas', (route) => responderJson(route, { mascotas: [
    { id: 101, nombre: 'Firulais', especie: 'PERRO', duenio: { id: 102, nombre: 'Cliente de Prueba' } }
  ] }));
  const cuerpos = [];
  await page.route('**/api/pacientes/turnos', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const cuerpo = route.request().postDataJSON();
    cuerpos.push(cuerpo);
    if (cuerpo.hora === '08:00') {
      return responderJson(route, { error: 'Ya hay un turno a esa hora', campos: { hora: 'Ya tenés un turno a esa hora' } }, 409);
    }
    const nuevo = turno(110, cuerpo.hora, 'Firulais', 'PROGRAMADO', { fecha: cuerpo.fecha, motivo: cuerpo.motivo });
    turnosManiana.push(nuevo);
    return responderJson(route, { turno: nuevo }, 201);
  });

  await page.goto('/panel/agenda.html');
  await expect(page.locator('#filas > tr')).toHaveCount(3);
  await page.evaluate(() => { window.sinRecargar = true; });

  await page.getByRole('button', { name: 'Nuevo turno' }).click();
  await expect(page.locator('#mascota_id option')).toHaveCount(2);
  await expect(page.locator('#turno-fecha')).toHaveValue(HOY);
  await page.selectOption('#mascota_id', '101');
  await page.fill('#hora', '08:00');
  await page.getByRole('button', { name: 'Guardar turno' }).click();
  await expect(page.locator('#error-hora')).toHaveText('Ya tenés un turno a esa hora');

  await page.fill('#turno-fecha', MANIANA);
  await page.fill('#hora', '10:30');
  await page.selectOption('#motivo', 'VACUNACION');
  await page.getByRole('button', { name: 'Guardar turno' }).click();

  await expect(page.locator('#seccion-turno')).toBeHidden();
  await expect(page).toHaveURL(new RegExp('\\?fecha=' + MANIANA + '$'));
  await expect(page.locator('tr[data-id="110"]')).toContainText('Vacunación');
  await expect(page.locator('#estado')).toContainText('Turno cargado: Firulais');
  expect(cuerpos.at(-1)).toEqual({ mascota_id: 101, fecha: MANIANA, hora: '10:30', motivo: 'VACUNACION' });
  expect(await page.evaluate(() => window.sinRecargar)).toBe(true);
});
