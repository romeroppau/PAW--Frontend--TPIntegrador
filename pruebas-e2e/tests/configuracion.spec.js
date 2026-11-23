// Configuración de la veterinaria (Entrega 5, rol 3): la pantalla que cambia los parámetros y las
// pantallas que los usan (el horario en la agenda, el stock bajo en reportes).
// La API se simula con el formato de docs/api/contrato.md de Backend, sección "Configuración".
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion, abrirSeccion } = require('./ayudas');

const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO', estado_validacion: null };

function parametro(clave, grupo, nombre, tipo, defecto, extra = {}) {
  const grupos = { TURNOS: 'Turnos', AVISOS: 'Avisos a los clientes', STOCK: 'Stock y vencimientos' };
  return {
    clave, grupo, nombre_grupo: grupos[grupo], nombre, ayuda: `Ayuda de ${nombre}.`, tipo,
    unidad: tipo === 'ENTERO' ? 'días' : null,
    minimo: tipo === 'HORA' ? '06:00' : 1, maximo: tipo === 'HORA' ? '23:59' : 30,
    defecto, valor: defecto, modificado: false, actualizado_en: null, actualizado_por: null, ...extra,
  };
}

function parametros() {
  return [
    parametro('hora_apertura', 'TURNOS', 'Apertura', 'HORA', '08:00'),
    parametro('hora_cierre', 'TURNOS', 'Cierre', 'HORA', '20:00'),
    parametro('dias_aviso_vacuna', 'AVISOS', 'Aviso de vacuna próxima', 'ENTERO', 7),
    parametro('limite_stock_bajo', 'STOCK', 'Stock bajo', 'ENTERO', 10, { unidad: 'unidades', minimo: 0, maximo: 1000 }),
  ];
}

// GET devuelve los parámetros; PUT anota lo que se mandó y responde lo que diga "responderPut"
// (por defecto, los guarda como haría Backend).
async function simularConfiguracion(page, { responderPut } = {}) {
  await simularSesion(page, VETERINARIO);
  const enviados = [];
  let actuales = parametros();
  await page.route('**/api/configuracion', (route) => {
    if (route.request().method() === 'GET') return responderJson(route, { parametros: actuales });
    const { valores } = route.request().postDataJSON();
    enviados.push(valores);
    if (responderPut) return responderPut(route, valores);
    actuales = actuales.map((p) => (p.clave in valores
      ? { ...p, valor: valores[p.clave], modificado: valores[p.clave] !== p.defecto, actualizado_en: '2026-11-20 10:15:00', actualizado_por: 'Vet' }
      : p));
    return responderJson(route, { parametros: actuales });
  });
  return enviados;
}

test('la veterinaria ve los parámetros agrupados con su valor por defecto', async ({ page }) => {
  await simularConfiguracion(page);
  await page.goto('/panel/configuracion.html');

  await expect(page.locator('legend')).toHaveText(['Turnos', 'Avisos a los clientes', 'Stock y vencimientos']);
  await expect(page.getByLabel('Apertura')).toHaveValue('08:00');
  await expect(page.getByLabel('Aviso de vacuna próxima')).toHaveValue('7');
  await expect(page.locator('#ayuda-dias_aviso_vacuna')).toContainText('Entre 1 y 30 días. Por defecto: 7 días.');
  // Con el valor por defecto, no hace falta el botón para volver a él.
  await expect(page.getByRole('button', { name: /Usar el valor por defecto/ })).toHaveCount(0);
});

test('guardar manda solo lo que cambió y muestra quién lo cambió', async ({ page }) => {
  const enviados = await simularConfiguracion(page);
  await page.goto('/panel/configuracion.html');

  await page.getByLabel('Apertura').fill('09:00');
  await page.getByLabel('Aviso de vacuna próxima').fill('5');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.locator('#guardado')).toHaveText('Listo: se guardaron "Apertura" y "Aviso de vacuna próxima". Ya se usa en todo el sistema.');
  expect(enviados).toEqual([{ hora_apertura: '09:00', dias_aviso_vacuna: 5 }]);
  await expect(page.locator('.parametro', { hasText: 'Apertura' })).toContainText('Cambiado por Vet el 20/11/2026.');

  // Sin cambios nuevos no se llama a la API.
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#guardado')).toHaveText('No cambiaste ningún valor.');
  expect(enviados).toHaveLength(1);
});

test('"Usar el valor por defecto" pone el de siempre en el campo', async ({ page }) => {
  await simularConfiguracion(page);
  await page.goto('/panel/configuracion.html');

  await page.getByLabel('Stock bajo').fill('3');
  const volver = page.getByRole('button', { name: 'Usar el valor por defecto (10 unidades)' });
  await volver.click();
  await expect(page.getByLabel('Stock bajo')).toHaveValue('10');
  await expect(volver).toBeHidden();
});

test('si el servidor rechaza un valor, el error se ve en ese campo y no se guarda nada', async ({ page }) => {
  await simularConfiguracion(page, {
    responderPut: (route) => responderJson(route, {
      error: 'Revisá los valores marcados', campos: { hora_cierre: 'El cierre tiene que ser después de la apertura' },
    }, 400),
  });
  await page.goto('/panel/configuracion.html');

  await page.getByLabel('Cierre').fill('07:30');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.locator('#error-hora_cierre')).toHaveText('El cierre tiene que ser después de la apertura');
  await expect(page.getByLabel('Cierre')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('#error-general')).toHaveText('Revisá los valores marcados: no se guardó ninguno.');

  // "Descartar cambios" vuelve a lo guardado.
  await page.getByRole('button', { name: 'Descartar cambios' }).click();
  await expect(page.getByLabel('Cierre')).toHaveValue('20:00');
  await expect(page.locator('#error-hora_cierre')).toHaveText('');
});

test('la agenda usa el horario de atención configurado', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route(/\/api\/pacientes\/turnos\?fecha=/, (route) => responderJson(route, { turnos: [] }));
  await page.route('**/api/pacientes/horario', (route) => responderJson(route, { apertura: '09:00', cierre: '13:00' }));

  await page.goto('/panel/agenda.html');
  const hora = page.locator('#hora');
  await expect(hora).toHaveAttribute('min', '09:00');
  await expect(hora).toHaveAttribute('max', '12:59');
  await expect(page.locator('#ayuda-hora')).toHaveText('Horario de atención: de 09:00 a 13:00.');
});

test('desde el panel se llega a la configuración', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.goto('/paneles/panel-administrador.html');
  await abrirSeccion(page, 'configuracion');
  await page.getByRole('link', { name: 'Horario de atención, avisos y stock bajo' }).click();
  await expect(page).toHaveURL(/\/panel\/configuracion\.html$/);
});
