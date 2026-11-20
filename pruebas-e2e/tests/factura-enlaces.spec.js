// Enlace a la factura en los turnos atendidos (Entrega 5, recomendación del profesor): desde Mis
// turnos del cliente, la agenda y el reporte de turnos atendidos, y "Volver" a la pantalla de origen.
// La API se simula con el formato de los contratos de Pacientes (mascotas-turnos y consultas) y Reportes.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const CLIENTE = { id: 102, nombre: 'Cliente', email: 'c@prueba.huellavet', rol: 'CLIENTE' };
const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const dia = (n) => new Date(new Date(HOY + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);

function turno(id, fecha, estado, extra = {}) {
  return {
    id, fecha, hora: '10:00', motivo: 'CONSULTA', estado,
    mascota: { id: 104, nombre: 'Tom', especie: 'GATO' },
    duenio: { id: 102, nombre: 'Cliente', telefono: null },
    veterinario: { id: 101, nombre: 'Vet' }, consulta_id: null, ...extra,
  };
}

const FACTURA = {
  numero: 'C-000101', subtotal_base: '15000.00', subtotal_insumos: '0.00', subtotal_productos: '0.00',
  total: '15000.00', estado: 'PENDIENTE_PAGO', fecha: '2026-11-10 10:42:00',
  consulta: { id: 7, fecha: '2026-11-10', hora: '10:00', motivo: 'CONSULTA', diagnostico: 'Control.', valor_base: '15000.00', insumos: [], productos: [] },
  mascota: { id: 104, nombre: 'Tom' },
  cliente: { id: 102, nombre: 'Cliente' },
};

test('en Mis turnos, un turno atendido enlaza a su factura y la factura vuelve a Mis turnos', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/pacientes/turnos', (route) => responderJson(route, { turnos: [
    turno(1, dia(-10), 'ATENDIDO', { consulta_id: 7 }),
    turno(2, dia(-3), 'CANCELADO'),
  ] }));
  await page.route('**/api/pacientes/consultas/7/factura', (route) => responderJson(route, FACTURA));
  await page.goto('/cliente/turnos.html');

  const atendido = page.locator('#filas-anteriores tr[data-id="1"]');
  await expect(atendido.getByRole('link', { name: 'Ver la consulta de Tom en su historial clínico' })).toBeVisible();
  const factura = atendido.getByRole('link', { name: /^Ver la factura del turno de Tom/ });
  await expect(factura).toHaveAttribute('href', '/cliente/factura.html?consulta=7');
  // Un turno cancelado no tiene factura.
  await expect(page.locator('#filas-anteriores tr[data-id="2"] a')).toHaveCount(0);

  await factura.click();
  await expect(page.locator('#factura')).toContainText('C-000101');
  const volver = page.locator('#volver');
  await expect(volver).toHaveText('← Volver a mis turnos');
  await volver.click();
  await expect(page).toHaveURL(/\/cliente\/turnos\.html$/);
});

test('en la agenda, un atendido tiene "Ver consulta" y "Ver factura"; uno en atención, solo la consulta', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route(/\/api\/pacientes\/turnos\?fecha=/, (route) => responderJson(route, { turnos: [
    turno(101, HOY, 'ATENDIDO', { consulta_id: 7 }),
    turno(102, HOY, 'EN_ATENCION', { consulta_id: 8, hora: '10:30' }),
  ] }));
  await page.route('**/api/pacientes/horario', (route) => responderJson(route, { apertura: '08:00', cierre: '20:00' }));
  await page.route('**/api/pacientes/consultas/7/factura', (route) => responderJson(route, FACTURA));
  await page.goto('/panel/agenda.html');

  const atendido = page.locator('tr[data-id="101"]');
  await expect(atendido.getByRole('link', { name: 'Ver consulta de Tom' })).toBeVisible();
  await expect(atendido.getByRole('link', { name: 'Ver la factura de Tom (10:00)' })).toHaveAttribute('href', '/cliente/factura.html?consulta=7');
  await expect(page.locator('tr[data-id="102"]').getByRole('link', { name: /factura/ })).toHaveCount(0);

  await atendido.getByRole('link', { name: 'Ver la factura de Tom (10:00)' }).click();
  await expect(page.locator('#volver')).toHaveText('← Volver a la agenda');
});

test('en el reporte de turnos atendidos, el número de factura es un enlace', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route(/\/api\/reportes\/turnos-atendidos(\?.*)?$/, (route) => responderJson(route, {
    turnos: [
      { turno_id: 1, fecha: dia(-2), mascota_nombre: 'Tom', motivo: 'CONSULTA', diagnostico: 'Control.', cantidad_insumos: 0, cantidad_productos: 0, consulta_id: 7, factura_numero: 'C-000101', total: '15000.00' },
      { turno_id: 2, fecha: dia(-1), mascota_nombre: 'Luna', motivo: 'VACUNA', diagnostico: null, cantidad_insumos: 1, cantidad_productos: 0, consulta_id: 9, factura_numero: null, total: null },
    ],
    resumen: { cantidad_turnos: 2, total_facturado: 15000 },
  }));
  await page.goto('/panel/reportes.html#turnos-atendidos');

  await expect(page.getByRole('link', { name: 'Ver la factura C-000101' })).toHaveAttribute('href', '/cliente/factura.html?consulta=7');
  // Sin factura, se ve una raya y no hay enlace.
  await expect(page.locator('#filas-turnos tr', { hasText: 'Luna' }).getByRole('link')).toHaveCount(0);
});
