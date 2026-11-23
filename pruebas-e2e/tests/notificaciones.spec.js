// Campana de notificaciones (js/notificaciones.js): la fecha de cada aviso va en día/mes/año.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

test('la campana muestra la fecha de cada aviso como día/mes/año', async ({ page }) => {
  await simularSesion(page, { id: 102, nombre: 'Cliente de Prueba', email: 'c@prueba.huellavet', rol: 'CLIENTE' });
  await page.route('**/api/notificaciones', (route) => responderJson(route, {
    no_leidas: 1,
    datos: [{ id: 1, mensaje: 'Recibimos el pago de tu pedido V-000105.', fecha: '2026-11-20 16:36:00', leida: false }],
  }));
  await page.goto('/index.html');

  // En celular la campana está dentro del menú hamburguesa.
  const menu = page.locator('#menu-boton');
  if (await menu.isVisible()) await menu.click();
  await page.getByRole('button', { name: 'Notificaciones, 1 sin leer' }).click();
  const aviso = page.locator('.campana-item').first();
  await expect(aviso).toContainText('Recibimos el pago de tu pedido V-000105.');
  await expect(aviso.locator('small')).toHaveText('20/11/2026 16:36');
});

const CLIENTE = { id: 102, nombre: 'Cliente de Prueba', email: 'c@prueba.huellavet', rol: 'CLIENTE' };

async function abrirCampana(page) {
  const menu = page.locator('#menu-boton');
  if (await menu.isVisible()) await menu.click();
  await page.locator('.campana-boton').click();
}

test('la campana sin avisos nuevos lo dice, y "Ver todas" lleva al historial', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/notificaciones', (route) => responderJson(route, { no_leidas: 0, datos: [] }));
  await page.goto('/index.html');
  await abrirCampana(page);
  await expect(page.locator('.campana-lista')).toHaveText('No tenés notificaciones nuevas.');
  await expect(page.locator('.campana-panel').getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/cuenta/notificaciones.html');
});

const AVISOS = [
  { id: 3, mensaje: 'Recibimos el pago de tu pedido V-000105.', fecha: '2026-11-22 10:00:00', leida: false },
  { id: 2, mensaje: 'Tu turno es mañana.', fecha: '2026-11-21 09:00:00', leida: false },
  { id: 1, mensaje: 'Bienvenida a HuellaVet.', fecha: '2026-11-01 08:00:00', leida: true },
];

test('mis notificaciones: lista con filtros; marcar una y marcar todas actualizan la campana', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  const consultas = [];
  let leidas = new Set([1]);
  const noLeidas = () => AVISOS.filter((a) => !leidas.has(a.id)).length;
  await page.route('**/api/notificaciones', (route) => responderJson(route, {
    no_leidas: noLeidas(), datos: AVISOS.filter((a) => !leidas.has(a.id)).map((a) => ({ ...a, leida: false })),
  }));
  await page.route('**/api/notificaciones/historial?*', (route) => {
    const q = new URL(route.request().url()).searchParams;
    consultas.push(q.toString());
    const todos = AVISOS.map((a) => ({ ...a, leida: leidas.has(a.id) }));
    const datos = q.get('estado') === 'SIN_LEER' ? todos.filter((a) => !a.leida) : q.get('estado') === 'LEIDAS' ? todos.filter((a) => a.leida) : todos;
    return responderJson(route, { datos, pagina: 1, por_pagina: 20, hay_mas: false, desde: '2026-10-25', hasta: '2026-11-23', no_leidas: noLeidas() });
  });
  await page.route('**/api/notificaciones/2/leida', (route) => { leidas.add(2); return responderJson(route, { id: 2, leida: true }); });
  await page.route('**/api/notificaciones/leidas', (route) => { leidas = new Set([1, 2, 3]); return responderJson(route, { marcadas: 1, no_leidas: 0 }); });
  await page.goto('/cuenta/notificaciones.html');

  await expect(page.locator('#lista > li')).toHaveCount(3);
  await expect(page.locator('#lista > li').first()).toContainText('22/11/2026 10:00 · Sin leer');
  await expect(page.locator('#texto-sin-leer')).toHaveText('Tenés 2 notificaciones sin leer.');
  await expect(page.getByLabel('Desde')).toHaveValue('2026-10-25');
  await expect(page.getByRole('link', { name: '← Volver al panel' })).toHaveAttribute('href', '/paneles/panel-cliente.html');
  await expect(page.locator('.campana-contador')).toHaveText('2');

  // Marcar una: queda en la lista como leída y la campana baja a 1.
  await page.locator('#lista > li').nth(1).getByRole('button', { name: 'Marcar como leída' }).click();
  await expect(page.locator('#texto-sin-leer')).toHaveText('Tenés 1 notificación sin leer.');
  await expect(page.locator('#lista > li').nth(1).getByRole('button')).toHaveCount(0);
  await expect(page.locator('.campana-contador')).toHaveText('1');

  // Filtro Leídas.
  await page.getByLabel('Mostrar').selectOption('LEIDAS');
  await expect(page.locator('#lista > li')).toHaveCount(2);
  expect(consultas.at(-1)).toBe('estado=LEIDAS&pagina=1');

  // Marcar todas: desaparece el resumen y la campana queda en 0.
  await page.getByLabel('Mostrar').selectOption('TODAS');
  await page.getByRole('button', { name: 'Marcar todas como leídas' }).click();
  await expect(page.locator('#resumen-sin-leer')).toBeHidden();
  await expect(page.locator('.campana-contador')).toBeHidden();

  // Fechas sin avisos.
  await page.route('**/api/notificaciones/historial?*', (route) => responderJson(route, { datos: [], pagina: 1, por_pagina: 20, hay_mas: false, desde: '2020-01-01', hasta: '2020-01-31', no_leidas: 0 }));
  await page.getByLabel('Desde').fill('2020-01-01');
  await page.getByLabel('Hasta').fill('2020-01-31');
  await page.getByRole('button', { name: 'Filtrar' }).click();
  await expect(page.locator('#estado')).toHaveText('No hay notificaciones entre el 01/01/2020 y el 31/01/2020.');
});

test('la tarjeta Notificaciones de los paneles lleva al historial', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.goto('/paneles/panel-cliente.html');
  await expect(page.locator('#notificaciones').getByRole('link', { name: 'Ver mis notificaciones' })).toHaveAttribute('href', '/cuenta/notificaciones.html');
});
