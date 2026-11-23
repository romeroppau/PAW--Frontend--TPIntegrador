// Reseñas: la página pública (resumen, filtros, "Ver más", borrar las propias, responder la
// veterinaria), escribir una, la portada y la sección "Reseñas" de la barra de cada rol.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const CLIENTE = { id: 102, nombre: 'Cliente de Prueba', email: 'c@prueba.huellavet', rol: 'CLIENTE' };
const VET = { id: 101, nombre: 'Veterinaria de Prueba', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };
const RESUMEN = { total: 5, promedio: 4.4, por_estrellas: { 5: 3, 4: 1, 3: 1, 2: 0, 1: 0 } };
const resena = (id, estrellas, extra = {}) => ({
  id, estrellas, texto: `Reseña ${id}`, autor: 'Cliente D.', fecha: '2026-11-20 10:00:00', propia: false, respuesta: null, ...extra,
});

test('reseñas: el resumen como Google, de a 3 con "Ver más", y los filtros', async ({ page }) => {
  await simularSesion(page, null);
  const consultas = [];
  await page.route('**/api/resenas?*', (route) => {
    const q = new URL(route.request().url()).searchParams;
    consultas.push(q.toString());
    if (q.get('estrellas') === '2') return responderJson(route, { resumen: RESUMEN, datos: [], pagina: 1, por_pagina: 3, hay_mas: false });
    const pagina = Number(q.get('pagina'));
    const datos = pagina === 1 ? [resena(105, 5), resena(104, 3), resena(103, 5)] : [resena(102, 4), resena(101, 5, { respuesta: { texto: '¡Gracias!', fecha: '2026-11-04 09:00:00' } })];
    return responderJson(route, { resumen: RESUMEN, datos, pagina, por_pagina: 3, hay_mas: pagina === 1 });
  });
  await page.goto('/resenas/resenas.html');

  await expect(page.locator('#promedio')).toHaveText('4,4');
  await expect(page.locator('#total')).toHaveText('5 opiniones');
  await expect(page.locator('#barras > li').first()).toHaveAttribute('aria-label', '5 estrellas: 3');
  await expect(page.getByRole('link', { name: 'Escribir una reseña' })).toHaveAttribute('href', '/resenas/escribir.html');

  const items = page.locator('#lista > li');
  await expect(items).toHaveCount(3);
  await expect(items.first().getByRole('img', { name: '5 de 5 estrellas' })).toBeVisible();
  await expect(items.first()).toContainText('Cliente D. · 20/11/2026');
  await expect(items.first().getByRole('button')).toHaveCount(0);   // sin sesión: ni Borrar ni Responder

  await page.getByRole('button', { name: 'Ver más' }).click();
  await expect(items).toHaveCount(5);
  await expect(items.last()).toContainText('Respuesta de HuellaVet · 04/11/2026');
  await expect(items.last()).toContainText('¡Gracias!');
  await expect(page.getByRole('button', { name: 'Ver más' })).toBeHidden();

  await page.getByLabel('Ordenar por').selectOption('peores');
  await expect.poll(() => consultas.at(-1)).toBe('orden=peores&pagina=1');
  await page.getByLabel('Mostrar').selectOption('2');
  await expect(page.locator('#estado')).toHaveText('No hay reseñas con esa cantidad de estrellas.');
  expect(consultas.at(-1)).toBe('orden=peores&pagina=1&estrellas=2');
});

test('reseñas: el autor borra la suya (con confirmación)', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  let borrada = false;
  await page.route('**/api/resenas?*', (route) => responderJson(route, {
    resumen: RESUMEN, datos: [resena(106, 4, { propia: true, autor: 'Cliente P.' }), resena(105, 5)], pagina: 1, por_pagina: 3, hay_mas: false,
  }));
  await page.route('**/api/resenas/106', (route) => { borrada = true; return route.fulfill({ status: 204, body: '' }); });
  await page.goto('/resenas/resenas.html');

  const items = page.locator('#lista > li');
  await expect(items).toHaveCount(2);
  await expect(items.nth(1).getByRole('button')).toHaveCount(0);   // la de otro no se puede borrar
  await page.getByRole('button', { name: 'Borrar tu reseña' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Borrar' }).click();
  await expect(items).toHaveCount(1);
  await expect(page.locator('#aviso')).toHaveText('Borramos tu reseña.');
  expect(borrada).toBe(true);
});

test('reseñas: la veterinaria responde (no borra) y no ve "Escribir una reseña"', async ({ page }) => {
  await simularSesion(page, VET);
  let enviado = null;
  await page.route('**/api/resenas?*', (route) => responderJson(route, { resumen: RESUMEN, datos: [resena(105, 5)], pagina: 1, por_pagina: 3, hay_mas: false }));
  await page.route('**/api/resenas/105/respuesta', (route) => {
    enviado = route.request().postDataJSON();
    return responderJson(route, resena(105, 5, { respuesta: { texto: enviado.texto, fecha: '2026-11-23 12:00:00' } }));
  });
  await page.goto('/resenas/resenas.html');

  await expect(page.locator('#accion-escribir')).toBeHidden();
  const item = page.locator('#lista > li').first();
  await expect(item.getByRole('button', { name: /Borrar/ })).toHaveCount(0);
  await item.getByRole('button', { name: 'Responder' }).click();
  await item.getByRole('button', { name: 'Publicar respuesta' }).click();
  await expect(item.locator('.campo-error')).toHaveText('Escribí la respuesta');
  await item.getByLabel('Tu respuesta').fill('¡Muchas gracias!');
  await item.getByRole('button', { name: 'Publicar respuesta' }).click();
  await expect(item).toContainText('Respuesta de HuellaVet · 23/11/2026');
  await expect(item).toContainText('¡Muchas gracias!');
  await expect(item.getByRole('button', { name: 'Editar respuesta' })).toBeVisible();
  expect(enviado).toEqual({ texto: '¡Muchas gracias!' });
});

test('escribir una reseña: sin sesión lleva a iniciar sesión y vuelve', async ({ page }) => {
  await simularSesion(page, null);
  await page.goto('/resenas/escribir.html');
  await expect(page).toHaveURL(/\/login\/login\.html\?volver=%2Fresenas%2Fescribir\.html/);
});

test('escribir una reseña: elegir estrellas y texto; se publica y vuelve a la lista', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  let enviado = null;
  await page.route('**/api/resenas', (route) => {
    enviado = route.request().postDataJSON();
    return responderJson(route, resena(106, enviado.estrellas, { propia: true }), 201);
  });
  await page.route('**/api/resenas?*', (route) => responderJson(route, { resumen: RESUMEN, datos: [], pagina: 1, por_pagina: 3, hay_mas: false }));
  await page.goto('/resenas/escribir.html');

  await page.getByRole('button', { name: 'Publicar reseña' }).click();
  await expect(page.locator('#error-estrellas')).toHaveText('Elegí de 1 a 5 estrellas');
  await expect(page.locator('#error-texto')).toHaveText('Escribí tu opinión');
  expect(enviado).toBeNull();

  await page.locator('label[for="estrella-4"]').click();
  await expect(page.getByRole('radio', { name: '4 estrellas' })).toBeChecked();
  await expect(page.locator('#estrellas-opciones label.pintada')).toHaveCount(4);
  await page.getByLabel('Tu opinión').fill('Muy buena atención.');
  await page.getByRole('button', { name: 'Publicar reseña' }).click();
  await expect(page).toHaveURL(/\/resenas\/resenas\.html\?publicada=1/);
  await expect(page.locator('#aviso')).toHaveText('¡Gracias! Publicamos tu reseña.');
  expect(enviado).toEqual({ estrellas: 4, texto: 'Muy buena atención.' });
});

test('la portada muestra las 3 reseñas más nuevas de 4 o 5 estrellas', async ({ page }) => {
  await simularSesion(page, null);
  const consultas = [];
  await page.route('**/api/resenas?*', (route) => {
    consultas.push(new URL(route.request().url()).searchParams.toString());
    return responderJson(route, { resumen: RESUMEN, datos: [resena(105, 5, { texto: 'Excelente.' }), resena(103, 4), resena(101, 5)], pagina: 1, por_pagina: 3, hay_mas: true });
  });
  await page.goto('/index.html');
  const burbujas = page.locator('#burbujas > .burbuja');
  await expect(burbujas).toHaveCount(3);
  await expect(burbujas.first()).toContainText('Excelente.');
  await expect(burbujas.first()).toContainText('Cliente D.');
  expect(consultas).toContain('minimo=4');
  await expect(page.getByRole('link', { name: 'Ver todas las reseñas' })).toHaveAttribute('href', '/resenas/resenas.html');
  await expect(page.locator('body')).not.toContainText('Lucía F.');
});

test('la barra tiene "Reseñas": el cliente escribe y ve; la veterinaria solo ve', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.goto('/paneles/panel-cliente.html');
  const cliente = page.locator('#menu-resenas');
  await expect(cliente.locator('a')).toHaveText(['Escribir reseña', 'Ver reseñas']);
  await expect(cliente.getByRole('link', { name: 'Escribir reseña', includeHidden: true })).toHaveAttribute('href', '/resenas/escribir.html');

  await simularSesion(page, VET);
  await page.goto('/paneles/panel-administrador.html');
  await expect(page.locator('#menu-resenas a')).toHaveText(['Ver reseñas']);
});
