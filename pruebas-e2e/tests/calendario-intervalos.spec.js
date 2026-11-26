// 26/11: días mínimos entre dosis (Configuración → Vacunas) y "Marcar como dada" sin dosis repetidas.
//   - Dar una dosis ya no agrega sola la siguiente: la fila dada sugiere la próxima ("Agregar la próxima").
//   - "Agregar al calendario": el campo de fecha no deja elegir antes de la fecha mínima del ítem.
//   - Si la API rechaza por los días mínimos (409), el mensaje se ve en la fila.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const VET = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const masDias = (dias) => new Date(new Date(HOY + 'T12:00:00Z').getTime() + dias * 86400000).toISOString().slice(0, 10);
const aTexto = (iso) => iso.split('-').reverse().join('/');

const PLAN = [
  { id: 2, tipo: 'VACUNA', nombre: 'Séxtuple (1.ª dosis)', aplicacion: 'SEXTUPLE', orden: 1, se_repite_cada_meses: null, automatico: true, fecha_minima: null },
  { id: 3, tipo: 'VACUNA', nombre: 'Séxtuple (2.ª dosis)', aplicacion: 'SEXTUPLE', orden: 2, se_repite_cada_meses: null, automatico: true, fecha_minima: masDias(15) },
  { id: 5, tipo: 'VACUNA', nombre: 'Antirrábica', aplicacion: 'ANTIRRABICA', orden: 1, se_repite_cada_meses: 12, automatico: true, fecha_minima: masDias(300) },
  { id: 1, tipo: 'DESPARASITACION', nombre: 'Desparasitación interna', aplicacion: 'ANTIPARASITARIO', orden: 1, se_repite_cada_meses: 3, automatico: true, fecha_minima: null },
];

function calendario(eventos) {
  return {
    mascota: { id: 103, nombre: 'Luna', especie: 'PERRO', fecha_nacimiento: '2025-08-27', duenio: { id: 103, nombre: 'Tomás Aguirre' } },
    vacunas_al_dia: true, eventos, plan: PLAN,
  };
}

const dada = (id, planId, nombre, fecha, extra = {}) => ({
  id, tipo: 'VACUNA', nombre, plan_sanitario_id: planId, aplicacion: PLAN.find((p) => p.id === planId).aplicacion,
  fecha_programada: fecha, fecha_aplicada: fecha, en_consulta: false, turno: null, estado: 'APLICADO', proxima_sugerida: null, ...extra,
});

test('una dosis dada sugiere la próxima, que se agrega con la fecha sugerida (no se agrega sola)', async ({ page }) => {
  await simularSesion(page, VET);
  const sugerida = masDias(330);
  const eventos = [
    dada(201, 2, 'Séxtuple (1.ª dosis)', masDias(-6)),
    dada(202, 5, 'Antirrábica', masDias(-35), { proxima_sugerida: sugerida }),
  ];
  const cuerpos = [];
  await page.route(/\/api\/pacientes\/mascotas\/103\/calendario-sanitario$/, (route) => {
    if (route.request().method() === 'POST') {
      cuerpos.push(route.request().postDataJSON());
      return responderJson(route, calendario([...eventos.map((e) => ({ ...e, proxima_sugerida: null })),
        { ...dada(203, 5, 'Antirrábica', sugerida), fecha_aplicada: null, estado: 'PENDIENTE' }]));
    }
    return responderJson(route, calendario(eventos));
  });
  await page.route(/\/api\/pacientes\/mascotas(\?.*)?$/, (route) => responderJson(route, { mascotas: [] }));

  await page.goto('/cliente/calendario.html?mascota=103');
  const filaAntirrabica = page.locator('tr[data-id="202"]');
  await expect(filaAntirrabica).toContainText('Próxima sugerida: ' + aTexto(sugerida));
  // La serie de cachorro (no se repite) no sugiere nada.
  await expect(page.locator('tr[data-id="201"]').getByRole('button')).toHaveCount(0);

  await filaAntirrabica.getByRole('button', { name: /Agregar la próxima dosis de Antirrábica/ }).click();
  await expect(filaAntirrabica.locator('input[type="date"]')).toHaveValue(sugerida);
  await filaAntirrabica.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.locator('tr[data-id="203"]')).toContainText('Pendiente');
  expect(cuerpos).toEqual([{ plan_sanitario_id: 5, fecha_programada: sugerida }]);
});

test('"Agregar al calendario" no deja elegir antes de la fecha mínima y dice desde cuándo', async ({ page }) => {
  await simularSesion(page, VET);
  await page.route(/\/api\/pacientes\/mascotas\/103\/calendario-sanitario$/, (route) =>
    responderJson(route, calendario([dada(201, 2, 'Séxtuple (1.ª dosis)', masDias(-6))])));
  await page.route(/\/api\/pacientes\/mascotas(\?.*)?$/, (route) => responderJson(route, { mascotas: [] }));

  await page.goto('/cliente/calendario.html?mascota=103');
  const fecha = page.locator('#fecha_programada');
  await page.selectOption('#plan_sanitario_id', '3');
  await expect(fecha).toHaveAttribute('min', masDias(15));
  await expect(fecha).toHaveValue(masDias(15));
  await expect(page.locator('#ayuda-fecha_programada')).toHaveText(`Por la dosis anterior, se puede dar desde el ${aTexto(masDias(15))} (días mínimos de Configuración → Vacunas).`);

  // Sin dosis anterior: desde hoy, sin ayuda.
  await page.selectOption('#plan_sanitario_id', '1');
  await expect(fecha).toHaveAttribute('min', HOY);
  await expect(page.locator('#ayuda-fecha_programada')).toHaveText('');
});

test('si los días mínimos no se cumplen al marcar como dada, el mensaje de la API se ve en la fila', async ({ page }) => {
  await simularSesion(page, VET);
  const mensaje = `Entre dos dosis tienen que pasar al menos 330 días: Antirrábica se dio el ${aTexto(masDias(-35))}. Los días se cambian en Configuración → Vacunas.`;
  await page.route(/\/api\/pacientes\/mascotas\/103\/calendario-sanitario$/, (route) => responderJson(route, calendario([
    dada(202, 5, 'Antirrábica', masDias(-35)),
    { ...dada(204, 5, 'Antirrábica', masDias(10)), fecha_aplicada: null, estado: 'PROXIMO' },
  ])));
  await page.route(/\/api\/pacientes\/mascotas\/103\/calendario-sanitario\/204\/dada$/, (route) =>
    responderJson(route, { error: mensaje, campos: { fecha_aplicada: mensaje } }, 409));
  await page.route(/\/api\/pacientes\/mascotas(\?.*)?$/, (route) => responderJson(route, { mascotas: [] }));

  await page.goto('/cliente/calendario.html?mascota=103');
  const fila = page.locator('tr[data-id="204"]');
  await fila.getByRole('button', { name: 'Marcar como dada: Antirrábica' }).click();
  await fila.getByRole('button', { name: 'Guardar' }).click();
  await expect(fila.locator('.campo-error')).toHaveText(mensaje);
});
