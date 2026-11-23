// Horario de atención cortado (dos franjas, por ejemplo de 09:00 a 13:00 y de 16:00 a 19:00) y de
// 00:00 a 23:59: lo configura la veterinaria y lo muestran la portada, Contactanos y la agenda.
// API: GET /api/pacientes/horario (contrato-mascotas-turnos.md de Pacientes).
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const CORTADO = {
  apertura: '09:00', cierre: '19:00',
  franjas: [{ apertura: '09:00', cierre: '13:00' }, { apertura: '16:00', cierre: '19:00' }],
};
const CLIENTE = { id: 102, nombre: 'Sofía Benítez', email: 'cliente@prueba.huellavet', rol: 'CLIENTE' };
const VETERINARIO = { id: 101, nombre: 'Dra. Laura Martínez', email: 'vet@prueba.huellavet', rol: 'VETERINARIO' };

test('la portada y Contactanos muestran las dos franjas', async ({ page }) => {
  await simularSesion(page, null);
  await page.route('**/api/pacientes/horario', (route) => responderJson(route, CORTADO));
  await page.goto('/index.html');
  await expect(page.locator('.hero-ubicacion')).toContainText('Atendemos de lunes a sábado de 09:00 a 13:00 y de 16:00 a 19:00');

  await simularSesion(page, CLIENTE);
  await page.goto('/paneles/panel-cliente.html');
  await expect(page.locator('#horario-atencion')).toHaveText('De 09:00 a 13:00 y de 16:00 a 19:00');
});

test('la agenda explica el horario cortado al cargar un turno', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route(/\/api\/pacientes\/turnos\?fecha=/, (route) => responderJson(route, { turnos: [] }));
  await page.route('**/api/pacientes/horario', (route) => responderJson(route, CORTADO));
  await page.goto('/panel/agenda.html');

  const hora = page.locator('#hora');
  await expect(hora).toHaveAttribute('min', '09:00');
  await expect(hora).toHaveAttribute('max', '18:59');
  await expect(page.locator('#ayuda-hora')).toHaveText('Horario de atención: de 09:00 a 13:00 y de 16:00 a 19:00.');
});

test('una respuesta vieja (sin franjas) se sigue entendiendo', async ({ page }) => {
  await simularSesion(page, null);
  await page.route('**/api/pacientes/horario', (route) => responderJson(route, { apertura: '00:00', cierre: '23:59' }));
  await page.goto('/index.html');
  await expect(page.locator('.hero-ubicacion')).toContainText('de 00:00 a 23:59');
});

test('Configuración: el segundo horario se puede dejar vacío', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  const hora = (clave, nombre, defecto, extra = {}) => ({
    clave, grupo: 'TURNOS', nombre_grupo: 'Turnos', nombre, ayuda: `Ayuda de ${nombre}.`, tipo: 'HORA', formato: null, unidad: null,
    minimo: '00:00', maximo: '23:59', defecto, valor: defecto, modificado: false, actualizado_en: null, actualizado_por: null, ...extra,
  });
  let enviado = null;
  await page.route('**/api/configuracion', (route) => {
    if (route.request().method() === 'PUT') {
      enviado = route.request().postDataJSON().valores;
      return responderJson(route, { error: 'x', campos: {} }, 500);
    }
    return responderJson(route, { parametros: [
      hora('hora_apertura', 'Primer horario: desde', '08:00'),
      hora('hora_cierre', 'Primer horario: hasta', '20:00'),
      hora('hora_apertura_2', 'Segundo horario: desde', ''),
      hora('hora_cierre_2', 'Segundo horario: hasta', ''),
    ] });
  });
  await page.goto('/panel/configuracion.html#turnos');

  await expect(page.getByLabel('Primer horario: desde')).toHaveAttribute('required', '');
  await expect(page.getByLabel('Segundo horario: desde')).not.toHaveAttribute('required', '');
  await expect(page.getByLabel('Segundo horario: desde')).toHaveValue('');
  await expect(page.locator('#ayuda-hora_apertura_2')).toContainText('Por defecto: vacío.');

  await page.getByLabel('Primer horario: hasta').fill('13:00');
  await page.getByLabel('Segundo horario: desde').fill('16:00');
  await page.getByLabel('Segundo horario: hasta').fill('19:00');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect.poll(() => enviado).toEqual({ hora_cierre: '13:00', hora_apertura_2: '16:00', hora_cierre_2: '19:00' });
});
