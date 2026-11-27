// Precio de la consulta y franjas promocionadas (Entrega 5): la veterinaria publicita desde "Qué
// promocionar" las franjas con menos turnos, cada turno guarda su precio al sacarse, la consulta lo
// toma sin poder cambiarlo y los clientes ven los turnos con descuento. La API se simula con el
// formato de los contratos de Pacientes (contrato-mascotas-turnos.md y contrato-consultas.md) y de
// Reportes (a_promocionar).
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };
const CLIENTE = { id: 102, nombre: 'Cliente', email: 'c@prueba.huellavet', rol: 'CLIENTE' };
const HOY = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const dia = (n) => new Date(new Date(HOY + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);
const LEJOS = dia(60);

// El próximo martes (desde mañana): la franja promocionada de estas pruebas es "martes a la tarde".
const MARTES = (() => {
  for (let i = 1; i <= 7; i++) if (new Date(dia(i) + 'T12:00:00Z').getUTCDay() === 2) return dia(i);
})();

const PROMO_MARTES = {
  id: 3, dia_semana: 2, franja: 'TARDE', porcentaje: 20, hasta: LEJOS,
  nombre: 'Martes a la tarde', precio: 15000, precio_promocion: 12000,
};

// ---------- Reportes: publicitar una franja ----------

test('"Qué promocionar": las 5 franjas con menos turnos se publicitan con el descuento sugerido', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  const franja = (d, f, n) => ({ dia_semana: d, franja: f, cantidad_turnos: n });
  await page.route('**/api/reportes/sugerencias', (route) => responderJson(route, {
    que_promocionar: {
      franja_sugerida: { ...franja('Martes', 'tarde', 0), sugerencia: 'Los Martes a la tarde hubo 0 turnos en 4 semanas: conviene promocionarlos' },
      franjas: [franja('Lunes', 'mañana', 9), franja('Martes', 'tarde', 0), franja('Sábado', 'mañana', 1)],
      precio_consulta: 15000,
      a_promocionar: [
        { ...franja('Martes', 'tarde', 0), dia_numero: 2, franja_codigo: 'TARDE', descuento_sugerido: 25, precio_sugerido: 11250 },
        { ...franja('Sábado', 'mañana', 1), dia_numero: 6, franja_codigo: 'MANIANA', descuento_sugerido: 15, precio_sugerido: 12750 },
      ],
    },
    que_liquidar: [],
  }));
  await page.route('**/api/inventario/promociones', (route) => responderJson(route, { datos: [] }));
  let vigentes = [];
  const enviados = [];
  const terminadas = [];
  await page.route('**/api/pacientes/promociones-turnos', (route) => {
    if (route.request().method() === 'GET') return responderJson(route, { precio_consulta: 15000, datos: vigentes });
    const cuerpo = route.request().postDataJSON();
    enviados.push(cuerpo);
    vigentes = [{ ...PROMO_MARTES, porcentaje: cuerpo.porcentaje, hasta: cuerpo.hasta, precio_promocion: 15000 * (100 - cuerpo.porcentaje) / 100 }];
    return responderJson(route, vigentes[0], 201);
  });
  await page.route('**/api/pacientes/promociones-turnos/*', (route) => {
    terminadas.push(route.request().url().split('/').pop());
    vigentes = [];
    return route.fulfill({ status: 204 });
  });
  await page.goto('/panel/reportes.html');

  await expect(page.locator('#precio-consulta')).toHaveText('$15.000,00');
  // Lunes a la mañana no está entre las 5: ni descuento ni botón.
  await expect(page.locator('#filas-franjas tr', { hasText: 'Lunes' }).getByRole('button')).toHaveCount(0);
  await expect(page.locator('#filas-franjas tr', { hasText: 'Sábado' })).toContainText('15 %');

  await page.getByRole('button', { name: 'Publicitar Martes a la tarde' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Publicitar una franja' });
  await expect(dialogo.getByLabel('Descuento en la consulta (%)')).toHaveValue('25');
  await expect(dialogo.locator('#franja-precio')).toHaveText('La consulta en esa franja: $11.250,00');
  await dialogo.getByLabel('Descuento en la consulta (%)').fill('20');
  await dialogo.getByRole('button', { name: 'Publicitar' }).click();

  await expect(dialogo).toBeHidden();
  expect(enviados).toHaveLength(1);
  expect(enviados[0]).toMatchObject({ dia_semana: 2, franja: 'TARDE', porcentaje: 20 });
  await expect(page.locator('#aviso-franjas')).toContainText('Listo: Martes a la tarde tiene 20 % de descuento en la consulta');
  await expect(page.getByRole('button', { name: 'Publicitar Martes a la tarde' })).toHaveCount(0);
  // Las publicadas están en su propia pestaña, y desde ahí se terminan.
  await page.getByRole('tab', { name: 'Promociones publicadas' }).click();
  await expect(page.locator('#filas-promo-turnos')).toContainText('$12.000,00 (antes $15.000,00)');

  await page.getByRole('button', { name: 'Terminar la promoción de Martes a la tarde' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Terminar la promoción' }).click();
  await expect(page.locator('#aviso-publicadas')).toHaveText('Se terminó la promoción de Martes a la tarde.');
  expect(terminadas).toEqual(['3']);
  await page.getByRole('tab', { name: 'Qué promocionar' }).click();
  await expect(page.getByRole('button', { name: 'Publicitar Martes a la tarde' })).toBeVisible();
});

// ---------- Agenda: el precio del turno ----------

test('al cargar un turno, la agenda dice el precio de la consulta y si la franja está en promoción', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route(/\/api\/pacientes\/turnos\?fecha=/, (route) => responderJson(route, { turnos: [{
    id: 50, fecha: HOY, hora: '15:00', motivo: 'CONSULTA', estado: 'PROGRAMADO',
    mascota: { id: 1, nombre: 'Tom', especie: 'GATO' }, duenio: { id: 102, nombre: 'Cliente', telefono: null },
    veterinario: { id: 101, nombre: 'Vet' }, consulta_id: null, precio: { base: 15000, descuento: 20, final: 12000 },
  }] }));
  await page.route('**/api/pacientes/promociones-turnos', (route) => responderJson(route, { precio_consulta: 15000, datos: [PROMO_MARTES] }));
  await page.route('**/api/pacientes/mascotas', (route) => responderJson(route, { mascotas: [] }));
  await page.goto('/panel/agenda.html');

  // El turno que se sacó con descuento lo muestra.
  await expect(page.locator('tr[data-id="50"]')).toContainText('20 % off');

  await page.getByRole('button', { name: 'Nuevo turno' }).click();
  await page.locator('#turno-fecha').fill(MARTES);
  await page.locator('#hora').fill('15:00');
  await expect(page.locator('#precio-turno')).toHaveText('Martes a la tarde está en promoción: la consulta sale $ 12.000,00 (20 % off, antes $ 15.000,00).');
  await page.locator('#hora').fill('10:00');
  await expect(page.locator('#precio-turno')).toHaveText('Precio de la consulta: $ 15.000,00.');
});

// ---------- Consulta y factura ----------

test('la consulta toma el precio del turno con su descuento y no se puede cambiar', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  const consulta = {
    id: 7, turno_id: 50, mascota_id: 1, motivo: 'CONSULTA', estado: 'ABIERTA', diagnostico: null, observaciones: null,
    valor_base: '12000.00', precio_lista: '15000.00', descuento: 20, finalizada_en: null, total: '12000.00', insumos: [], productos: [],
  };
  let cuerpo = null;
  await page.route('**/api/pacientes/consultas/7', (route) => {
    if (route.request().method() === 'PUT') {
      cuerpo = route.request().postDataJSON();
      return responderJson(route, { ...consulta, diagnostico: cuerpo.diagnostico });
    }
    return responderJson(route, consulta);
  });
  await page.route('**/api/inventario/insumos', (route) => responderJson(route, { datos: [] }));
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: [] }));
  await page.goto('/panel/consulta.html?id=7');

  const valor = page.getByLabel('Valor de la consulta ($)');
  await expect(valor).toHaveValue('12000.00');
  await expect(valor).not.toBeEditable();
  await expect(page.locator('#ayuda-valor-base')).toHaveText('Es el precio del turno con el 20 % de descuento de su franja (sin descuento: $15.000,00). No se cambia.');

  await page.getByLabel('Diagnóstico').fill('Control');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect.poll(() => cuerpo).not.toBeNull();
  expect(cuerpo).toEqual({ diagnostico: 'Control', observaciones: '' });
});

test('la factura dice el descuento de la franja', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/pacientes/consultas/7/factura', (route) => responderJson(route, {
    numero: 'C-000107', subtotal_base: '12000.00', subtotal_insumos: '0.00', subtotal_productos: '0.00', total: '12000.00',
    estado: 'PENDIENTE_PAGO', fecha: '2026-11-24 15:30:00',
    consulta: { id: 7, fecha: '2026-11-24', hora: '15:00', motivo: 'CONSULTA', diagnostico: 'Control', valor_base: '12000.00',
      precio_lista: '15000.00', descuento: 20, insumos: [], productos: [] },
    mascota: { id: 1, nombre: 'Tom' }, cliente: { id: 102, nombre: 'Cliente' },
  }));
  await page.goto('/cliente/factura.html?consulta=7');
  await expect(page.locator('#factura')).toContainText('Consulta veterinaria (20 % de descuento; sin descuento: $ 15.000,00)');
});

// ---------- Clientes ----------

test('Mis turnos muestra el precio de cada turno que viene (los descuentos están en "Ver descuentos")', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/pacientes/promociones-turnos', (route) => responderJson(route, { precio_consulta: 15000, datos: [PROMO_MARTES] }));
  await page.route('**/api/pacientes/turnos', (route) => responderJson(route, { turnos: [{
    id: 60, fecha: MARTES, hora: '15:00', motivo: 'CONSULTA', estado: 'PROGRAMADO',
    mascota: { id: 1, nombre: 'Tom', especie: 'GATO' }, duenio: { id: 102, nombre: 'Cliente', telefono: null },
    veterinario: { id: 101, nombre: 'Vet' }, consulta_id: null, precio: { base: 15000, descuento: 20, final: 12000 },
  }] }));
  await page.goto('/cliente/turnos.html');

  await expect(page.locator('tr[data-id="60"]')).toContainText('$ 12.000,00 (20 % off, antes $ 15.000,00)');
  await expect(page.locator('#promo-turnos')).toHaveCount(0);
});

test('"Ver descuentos" del menú Turnos lleva a los turnos con descuento', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  let datos = [PROMO_MARTES];
  await page.route('**/api/pacientes/promociones-turnos', (route) => responderJson(route, { precio_consulta: 15000, datos }));
  await page.route('**/api/pacientes/turnos', (route) => responderJson(route, { turnos: [] }));
  await page.goto('/cliente/turnos.html');

  await expect(page.locator('a[href="/cliente/descuentos.html"]').first()).toHaveText('Ver descuentos');
  await page.goto('/cliente/descuentos.html');
  await expect(page.getByRole('heading', { name: 'Turnos con descuento' })).toBeVisible();
  await expect(page.locator('#lista-promo-turnos')).toContainText('Martes a la tarde $ 12.000,00');
  await expect(page.locator('#lista-promo-turnos')).toContainText('20 % off');

  datos = [];
  await page.reload();
  await expect(page.locator('#estado')).toHaveText('Por ahora no hay días ni horarios con descuento.');
});

test('el panel del cliente también muestra "¡No te lo pierdas!" con los turnos en descuento', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/promociones', (route) => responderJson(route, { datos: [] }));
  await page.route('**/api/pacientes/promociones-turnos', (route) => responderJson(route, { precio_consulta: 15000, datos: [PROMO_MARTES] }));
  await page.goto('/paneles/panel-cliente.html');

  await expect(page.getByRole('heading', { name: 'Turnos en descuento' })).toBeVisible();
  await expect(page.locator('#lista-promo-turnos')).toContainText('Martes a la tarde');
});

// 27/11: una franja con promoción vigente la muestra aunque ya no esté entre las 5 con menos turnos
// (con la promoción se llenó), y no ofrece "Publicitar".
test('"Qué promocionar": la promoción vigente se ve aunque la franja ya no sea candidata', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  const franja = (d, f, n) => ({ dia_semana: d, franja: f, cantidad_turnos: n });
  await page.route('**/api/reportes/sugerencias', (route) => responderJson(route, {
    que_promocionar: {
      franja_sugerida: { ...franja('Martes', 'mañana', 5), sugerencia: 'Los Martes a la mañana hubo 5 turnos en 4 semanas: conviene promocionarlos' },
      franjas: [franja('Lunes', 'mañana', 12), franja('Lunes', 'tarde', 8), franja('Martes', 'mañana', 5)],
      precio_consulta: 15000,
      a_promocionar: [
        { ...franja('Lunes', 'tarde', 8), dia_numero: 1, franja_codigo: 'TARDE', descuento_sugerido: 10, precio_sugerido: 13500 },
        { ...franja('Martes', 'mañana', 5), dia_numero: 2, franja_codigo: 'MANIANA', descuento_sugerido: 10, precio_sugerido: 13500 },
      ],
    },
    que_liquidar: [],
  }));
  await page.route('**/api/inventario/promociones', (route) => responderJson(route, { datos: [] }));
  const promo = (id, d, f, nombre) => ({ id, dia_semana: d, franja: f, porcentaje: 10, hasta: '2026-12-25', nombre, precio: 15000, precio_promocion: 13500 });
  await page.route('**/api/pacientes/promociones-turnos', (route) => responderJson(route, { precio_consulta: 15000, datos: [
    promo(2, 1, 'MANIANA', 'Lunes a la mañana'), promo(3, 1, 'TARDE', 'Lunes a la tarde'),
  ] }));
  await page.goto('/panel/reportes.html');

  const lunesManiana = page.locator('#filas-franjas tr', { hasText: 'Lunes' }).filter({ hasText: 'mañana' });
  await expect(lunesManiana).toContainText('10 % hasta el 25/12/2026');
  await expect(lunesManiana.getByRole('button')).toHaveCount(0);
  await expect(page.locator('#filas-franjas tr', { hasText: 'tarde' })).toContainText('10 % hasta el 25/12/2026');
  await expect(page.getByRole('button', { name: 'Publicitar Martes a la mañana' })).toBeVisible();
});
