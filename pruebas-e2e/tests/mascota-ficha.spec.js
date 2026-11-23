// Ficha de la mascota (cliente/mascota.html): datos, dueño (la veterinaria), un vistazo a las
// vacunas y accesos; y los enlaces desde el nombre de la mascota.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const CLIENTE = { id: 102, nombre: 'Cliente de Prueba', email: 'c@prueba.huellavet', rol: 'CLIENTE' };
const RESCATISTA = { id: 104, nombre: 'Rescatista Aprobada', email: 'r@prueba.huellavet', rol: 'RESCATISTA' };
const VET = { id: 101, nombre: 'Veterinaria de Prueba', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };
const FIRULAIS = {
  id: 101, nombre: 'Firulais', especie: 'PERRO', raza: 'Mestizo', fecha_nacimiento: '2023-11-23', edad_meses: 36,
  peso_kg: '18.50', tiene_foto: false, activo: true, duenio: { id: 102, nombre: 'Cliente de Prueba', telefono: '2323555555' },
};
const CALENDARIO = {
  vacunas_al_dia: false,
  eventos: [
    { id: 1, tipo: 'VACUNA', nombre: 'Antirrábica', fecha_programada: '2026-11-10', fecha_aplicada: null, estado: 'VENCIDO' },
    { id: 2, tipo: 'VACUNA', nombre: 'Séxtuple (refuerzo anual)', fecha_programada: '2027-01-15', fecha_aplicada: null, estado: 'PENDIENTE' },
    { id: 3, tipo: 'VACUNA', nombre: 'Séxtuple (1.ª dosis)', fecha_programada: '2024-01-04', fecha_aplicada: '2024-01-04', estado: 'APLICADO' },
  ],
};

async function rutas(page) {
  await page.route('**/api/pacientes/mascotas/101', (route) => responderJson(route, FIRULAIS));
  await page.route('**/api/pacientes/mascotas/101/calendario-sanitario', (route) => responderJson(route, { mascota: FIRULAIS, ...CALENDARIO }));
}

test('ficha de la mascota (cliente): datos, vistazo a las vacunas y accesos', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await rutas(page);
  await page.goto('/cliente/mascota.html?id=101');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Firulais');
  await expect(page.locator('#especie-raza')).toHaveText('Perro · Mestizo');
  await expect(page.getByRole('img', { name: 'Sin foto' })).toBeVisible();
  await expect(page.locator('#nacimiento')).toHaveText('23/11/2023');
  await expect(page.locator('#edad')).toHaveText('3 años');
  await expect(page.locator('#peso')).toHaveText('18,5 kg');
  await expect(page.locator('#dato-duenio')).toBeHidden();

  await expect(page.locator('#estado-vacunas')).toHaveText('Tiene 1 vacuna vencida: Antirrábica, desde el 10/11/2026.');
  await expect(page.locator('#proxima-vacuna')).toHaveText('Próxima: Séxtuple (refuerzo anual), el 15/01/2027.');
  await expect(page.getByRole('link', { name: 'Ver calendario completo' })).toHaveAttribute('href', '/cliente/calendario.html?mascota=101');
  await expect(page.getByRole('link', { name: 'Historial clínico' })).toHaveAttribute('href', '/cliente/historial.html?mascota=101');
  await expect(page.getByRole('link', { name: 'Editar datos' })).toBeVisible();
});

test('ficha de la mascota (veterinaria): con el dueño y sin "Editar"', async ({ page }) => {
  await simularSesion(page, VET);
  await rutas(page);
  await page.route('**/api/pacientes/mascotas/101/calendario-sanitario', (route) => responderJson(route, { mascota: FIRULAIS, vacunas_al_dia: true, eventos: [CALENDARIO.eventos[2]] }));
  await page.goto('/cliente/mascota.html?id=101');

  await expect(page.getByRole('link', { name: 'Ver los datos de Cliente de Prueba' })).toHaveAttribute('href', '/panel/cliente.html?id=102');
  await expect(page.locator('#estado-vacunas')).toHaveText('Tiene las vacunas al día.');
  await expect(page.locator('#proxima-vacuna')).toHaveText('');
  await expect(page.getByRole('link', { name: 'Editar datos' })).toBeHidden();
  await expect(page.getByRole('link', { name: '← Ficha de mascotas' })).toBeVisible();
});

test('ficha de la mascota (rescatista): sus datos, sin calendario ni historial', async ({ page }) => {
  await simularSesion(page, RESCATISTA);
  let pidioCalendario = false;
  await page.route('**/api/pacientes/mascotas/101', (route) => responderJson(route, { ...FIRULAIS, duenio: { id: 104, nombre: 'Rescatista Aprobada' } }));
  await page.route('**/api/pacientes/mascotas/101/calendario-sanitario', (route) => { pidioCalendario = true; return responderJson(route, {}, 403); });
  await page.goto('/cliente/mascota.html?id=101');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Firulais');
  await expect(page.locator('#bloque-vacunas')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Historial clínico' })).toBeHidden();
  await expect(page.getByRole('link', { name: 'Calendario sanitario' })).toBeHidden();
  expect(pidioCalendario).toBe(false);
});

test('ficha de la mascota: si no existe (o es de otro), lo dice', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/pacientes/mascotas/555', (route) => responderJson(route, { error: 'Mascota no encontrada' }, 404));
  await page.goto('/cliente/mascota.html?id=555');
  await expect(page.locator('#estado')).toHaveText('No encontramos esa mascota.');
});

test('el nombre de la mascota lleva a su ficha (Mascotas, Agenda y ficha del cliente)', async ({ page }) => {
  await simularSesion(page, VET);
  const duenio = { id: 102, nombre: 'Cliente de Prueba', telefono: '2323555555' };
  await page.route('**/api/pacientes/mascotas*', (route) => responderJson(route, { mascotas: [{ ...FIRULAIS, duenio }] }));
  await page.goto('/cliente/mascotas.html');
  await expect(page.getByRole('link', { name: 'Ver la ficha de Firulais' })).toHaveAttribute('href', '/cliente/mascota.html?id=101');

  await page.route('**/api/pacientes/horario', (route) => responderJson(route, { apertura: '08:00', cierre: '20:00' }));
  await page.route('**/api/pacientes/turnos?*', (route) => responderJson(route, { turnos: [
    { id: 1, hora: '09:00', estado: 'PROGRAMADO', motivo: 'CONSULTA', mascota: { id: 101, nombre: 'Firulais', especie: 'PERRO' }, duenio },
  ] }));
  await page.goto('/panel/agenda.html');
  await expect(page.getByRole('link', { name: 'Ver la ficha de Firulais' })).toHaveAttribute('href', '/cliente/mascota.html?id=101');

  await page.route('**/api/clientes/102', (route) => responderJson(route, { id: 102, nombre: 'Cliente de Prueba', email: 'c@x.com', telefono: null, rol: 'CLIENTE', organizacion: null }));
  await page.goto('/panel/cliente.html?id=102');
  await expect(page.getByRole('link', { name: 'Ver la ficha de Firulais' })).toHaveAttribute('href', '/cliente/mascota.html?id=101');
});
