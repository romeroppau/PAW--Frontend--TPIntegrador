// 25/11 (migración 025): el calendario sanitario manda en los turnos de vacunación y desparasitación.
//   - Agenda: el turno de vacunación dice cuál; si no está en el calendario sin dar (o falta una dosis
//     anterior), avisa con el enlace al calendario y no deja guardar.
//   - Calendario (veterinaria): marcar como dada, cambiar la fecha, quitar y agregar.
//   - Consulta: la dosis tiene que estar en los insumos, y el stock se carga sin salir.
//   - Insumos: el campo "¿Es una vacuna o antiparasitario del calendario?".
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const VET = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const MANIANA = new Date(new Date(HOY + 'T12:00:00Z').getTime() + 86400000).toISOString().slice(0, 10);

const PLAN_PERRO = [
  { id: 2, tipo: 'VACUNA', nombre: 'Séxtuple (1.ª dosis)', aplicacion: 'SEXTUPLE', orden: 1, se_repite_cada_meses: null, automatico: true },
  { id: 3, tipo: 'VACUNA', nombre: 'Séxtuple (2.ª dosis)', aplicacion: 'SEXTUPLE', orden: 2, se_repite_cada_meses: null, automatico: true },
  { id: 4, tipo: 'VACUNA', nombre: 'Séxtuple (3.ª dosis)', aplicacion: 'SEXTUPLE', orden: 3, se_repite_cada_meses: null, automatico: true },
  { id: 5, tipo: 'VACUNA', nombre: 'Antirrábica', aplicacion: 'ANTIRRABICA', orden: 1, se_repite_cada_meses: 12, automatico: true },
  { id: 13, tipo: 'VACUNA', nombre: 'Tos de las perreras', aplicacion: 'TOS_PERRERAS', orden: 1, se_repite_cada_meses: 12, automatico: false },
  { id: 1, tipo: 'DESPARASITACION', nombre: 'Desparasitación interna', aplicacion: 'ANTIPARASITARIO', orden: 1, se_repite_cada_meses: 3, automatico: true },
];

const evento = (id, planId, nombre, programada, extra = {}) => ({
  id, tipo: 'VACUNA', nombre, plan_sanitario_id: planId, aplicacion: PLAN_PERRO.find((p) => p.id === planId).aplicacion,
  fecha_programada: programada, fecha_aplicada: null, en_consulta: false, turno: null, estado: 'PENDIENTE', ...extra,
});

// Luna: la 2.ª séxtuple vencida (la 1.ª sin dar) y la antirrábica pendiente.
function calendarioLuna() {
  return {
    mascota: { id: 103, nombre: 'Luna', especie: 'PERRO', fecha_nacimiento: '2026-08-27', duenio: { id: 103, nombre: 'Tomás Aguirre' } },
    vacunas_al_dia: false,
    eventos: [
      evento(105, 2, 'Séxtuple (1.ª dosis)', '2026-10-08', { estado: 'VENCIDO' }),
      evento(106, 3, 'Séxtuple (2.ª dosis)', '2026-10-29', { estado: 'VENCIDO' }),
      evento(108, 5, 'Antirrábica', MANIANA, { estado: 'PROXIMO' }),
    ],
    plan: PLAN_PERRO,
  };
}

test('agenda: la vacuna tiene que estar en el calendario; si no, avisa y no deja guardar', async ({ page }) => {
  await simularSesion(page, VET);
  await page.route(/\/api\/pacientes\/turnos\?fecha=/, (route) => responderJson(route, { fecha: HOY, turnos: [] }));
  await page.route('**/api/pacientes/mascotas', (route) => responderJson(route, { mascotas: [
    { id: 103, nombre: 'Luna', especie: 'PERRO', duenio: { id: 103, nombre: 'Tomás Aguirre' } },
  ] }));
  await page.route('**/api/pacientes/mascotas/103/calendario-sanitario', (route) => responderJson(route, calendarioLuna()));
  const cuerpos = [];
  await page.route('**/api/pacientes/turnos', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    cuerpos.push(route.request().postDataJSON());
    return responderJson(route, { turno: {
      id: 120, fecha: MANIANA, hora: '10:30', motivo: 'VACUNACION', estado: 'PROGRAMADO',
      mascota: { id: 103, nombre: 'Luna', especie: 'PERRO' }, duenio: { id: 103, nombre: 'Tomás Aguirre', telefono: null },
      veterinario: { id: 101, nombre: 'Vet' }, consulta_id: null, precio: null,
      evento_sanitario: { id: 108, nombre: 'Antirrábica', aplicacion: 'ANTIRRABICA' },
    } }, 201);
  });

  await page.goto('/panel/agenda.html');
  await page.getByRole('button', { name: 'Nuevo turno' }).click();
  await page.selectOption('#mascota_id', '103');
  await page.fill('#turno-fecha', MANIANA);
  await page.fill('#hora', '10:30');
  await expect(page.locator('#campo-plan')).toBeHidden();
  await page.selectOption('#motivo', 'VACUNACION');

  // La lista dice cómo está cada vacuna en el calendario.
  await expect(page.locator('#plan_sanitario_id option', { hasText: 'Tos de las perreras' })).toHaveText('Tos de las perreras (no está en el calendario)');
  await expect(page.locator('#plan_sanitario_id option', { hasText: 'Séxtuple (2.ª dosis)' })).toHaveText('Séxtuple (2.ª dosis) (vencida el 29/10/2026)');

  // No está en el calendario: aviso con el enlace, y no se guarda.
  await page.selectOption('#plan_sanitario_id', '13');
  await expect(page.locator('#aviso-plan')).toContainText('En el calendario de Luna no figura que se le tenga que dar: Tos de las perreras. Cargala primero en el calendario.');
  await expect(page.getByRole('link', { name: 'Abrir el calendario de Luna' })).toHaveAttribute('href', '/cliente/calendario.html?mascota=103');
  await expect(page.getByRole('button', { name: 'Guardar turno' })).toBeDisabled();

  // La 2.ª séxtuple con la 1.ª sin dar: tampoco.
  await page.selectOption('#plan_sanitario_id', '3');
  await expect(page.locator('#aviso-plan')).toContainText('Antes de Séxtuple (2.ª dosis) tiene que darse Séxtuple (1.ª dosis)');
  await expect(page.getByRole('button', { name: 'Guardar turno' })).toBeDisabled();

  // La antirrábica está pendiente: se guarda con cuál.
  await page.selectOption('#plan_sanitario_id', '5');
  await expect(page.locator('#aviso-plan')).toBeEmpty();
  await page.getByRole('button', { name: 'Guardar turno' }).click();
  await expect(page.locator('#seccion-turno')).toBeHidden();
  expect(cuerpos).toEqual([{ mascota_id: 103, fecha: MANIANA, hora: '10:30', motivo: 'VACUNACION', plan_sanitario_id: 5 }]);
});

test('calendario: la veterinaria marca como dada, agrega y quita', async ({ page }) => {
  await simularSesion(page, VET);
  let calendario = calendarioLuna();
  const pedidos = [];
  await page.route(/\/api\/pacientes\/mascotas(\?.*)?$/, (route) => responderJson(route, { mascotas: [{ id: 103, nombre: 'Luna', especie: 'PERRO', duenio: { id: 103, nombre: 'Tomás Aguirre' } }] }));
  await page.route(/\/api\/pacientes\/mascotas\/103\/calendario-sanitario(\/.*)?$/, (route) => {
    const r = route.request();
    if (r.method() === 'GET') return responderJson(route, calendario);
    const ruta = new URL(r.url()).pathname.replace('/api/pacientes/mascotas/103/calendario-sanitario', '');
    pedidos.push([r.method(), ruta, r.postDataJSON()]);
    if (r.method() === 'POST' && ruta === '/105/dada') {
      calendario = { ...calendario, eventos: calendario.eventos.map((e) => (e.id === 105 ? { ...e, fecha_aplicada: HOY, estado: 'APLICADO' } : e)) };
    } else if (r.method() === 'POST' && ruta === '') {
      calendario = { ...calendario, eventos: [...calendario.eventos, evento(130, 13, 'Tos de las perreras', MANIANA)] };
    } else if (r.method() === 'DELETE') {
      calendario = { ...calendario, eventos: calendario.eventos.filter((e) => e.id !== 130) };
    }
    return responderJson(route, calendario);
  });

  await page.goto('/cliente/calendario.html?mascota=103');
  await expect(page.locator('#col-acciones')).toBeVisible();

  // Marcar como dada (por ejemplo, en otra veterinaria): pide la fecha, que no puede ser futura.
  await page.getByRole('button', { name: 'Marcar como dada: Séxtuple (1.ª dosis)' }).click();
  const fecha = page.getByLabel('Fecha en que se dio Séxtuple (1.ª dosis)');
  await expect(fecha).toHaveAttribute('max', HOY);
  await page.locator('tr[data-id="105"]').getByRole('button', { name: 'Guardar' }).click();
  await expect(page.locator('tr[data-id="105"]')).toContainText('(cargada a mano)');
  await expect(page.locator('#estado')).toHaveText('Séxtuple (1.ª dosis): marcada como dada.');

  // Agregar: solo se ofrecen las que no tiene sin dar; las opcionales lo dicen.
  await expect(page.locator('#form-agregar option', { hasText: 'Antirrábica' })).toHaveCount(0);
  await page.selectOption('#form-agregar select', { label: 'Tos de las perreras (opcional)' });
  await page.fill('#fecha_programada', MANIANA);
  await page.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(page.locator('tr[data-id="130"]')).toContainText('Tos de las perreras');

  // Quitar, con confirmación.
  await page.getByRole('button', { name: 'Quitar del calendario: Tos de las perreras' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Quitar' }).click();
  await expect(page.locator('tr[data-id="130"]')).toHaveCount(0);

  expect(pedidos).toEqual([
    ['POST', '/105/dada', { fecha_aplicada: HOY }],
    ['POST', '', { plan_sanitario_id: 13, fecha_programada: MANIANA }],
    ['DELETE', '/130', null],
  ]);
});

test('consulta: la vacuna va en los insumos, y sin stock se carga desde ahí', async ({ page }) => {
  await simularSesion(page, VET);
  let stock = 0;
  let enConsulta = false;
  const consulta = () => ({
    id: 8, turno_id: 120, mascota_id: 102, motivo: 'VACUNACION', estado: 'ABIERTA', diagnostico: 'Sano',
    observaciones: null, valor_base: '15000.00', finalizada_en: null, total: '15000.00', productos: [],
    insumos: enConsulta ? [{ id: 1, insumo_id: 191, nombre: 'Vacuna leucemia felina (dosis)', cantidad: 1, costo_unitario: '9800.00', aplicacion: 'LEUCEMIA_FELINA', stock }] : [],
    evento_sanitario: { id: 140, nombre: 'Leucemia felina (2.ª dosis)', aplicacion: 'LEUCEMIA_FELINA',
      insumos: [{ id: 191, nombre: 'Vacuna leucemia felina (dosis)', stock }] },
  });
  await page.route('**/api/pacientes/consultas/8', (route) => responderJson(route, consulta()));
  await page.route('**/api/pacientes/consultas/8/insumos', (route) => { enConsulta = true; return responderJson(route, consulta(), 201); });
  await page.route('**/api/inventario/insumos', (route) => responderJson(route, { datos: [{ id: 191, nombre: 'Vacuna leucemia felina (dosis)', stock, activo: true }] }));
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: [] }));
  const cargas = [];
  await page.route('**/api/inventario/insumos/191/stock', (route) => {
    cargas.push(route.request().postDataJSON());
    stock += route.request().postDataJSON().cantidad;
    return responderJson(route, { id: 191, stock });
  });

  await page.goto('/panel/consulta.html?id=8');
  const bloque = page.locator('#bloque-calendario');
  await expect(bloque).toContainText('Esta consulta es para Leucemia felina (2.ª dosis): cargá la dosis en los insumos.');
  await expect(bloque).toContainText('Sin stock');

  // Sin stock: se carga ahí mismo, y aparece "Agregar 1".
  await page.getByLabel('Cantidad a cargar de Vacuna leucemia felina (dosis)').fill('3');
  await page.getByRole('button', { name: 'Cargar stock de Vacuna leucemia felina (dosis)' }).click();
  await expect(page.locator('#mensaje-calendario')).toHaveText('Stock cargado: Vacuna leucemia felina (dosis) tiene 3 ahora.');
  await expect(page.locator('#sel-insumos option', { hasText: 'Vacuna leucemia' })).toHaveText('Vacuna leucemia felina (dosis) (stock: 3)');

  await page.getByRole('button', { name: 'Agregar Vacuna leucemia felina (dosis) a la consulta' }).click();
  await expect(bloque).toContainText('La dosis ya está en los insumos (Vacuna leucemia felina (dosis)).');
  expect(cargas).toEqual([{ cantidad: 3 }]);
});

test('insumos: el alta manda qué vacuna es', async ({ page }) => {
  await simularSesion(page, VET);
  const cuerpos = [];
  await page.route('**/api/inventario/insumos', (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    cuerpos.push(route.request().postDataJSON());
    return responderJson(route, { id: 200 }, 201);
  });
  await page.route('**/panel/insumos.html', (route) => route.fulfill({ body: 'listado', contentType: 'text/html' }));

  await page.goto('/panel/insumo-form.html');
  await page.fill('#nombre', 'Vacuna antirrábica marca B');
  await page.fill('#costo', '4500');
  await page.fill('#stock', '10');
  await page.selectOption('#aplicacion', 'ANTIRRABICA');
  await page.getByRole('button', { name: /Guardar/ }).click();
  await expect.poll(() => cuerpos.length).toBe(1);
  expect(cuerpos[0]).toEqual({ nombre: 'Vacuna antirrábica marca B', costo: 4500, aplicacion: 'ANTIRRABICA', stock: 10 });
});
