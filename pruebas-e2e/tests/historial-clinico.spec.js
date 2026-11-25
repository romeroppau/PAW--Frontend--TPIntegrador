// Historial clínico de la veterinaria (panel/historial-clinico.html): los pacientes atendidos, con
// buscador y de a 20, y en cada fila sus consultas desplegadas. La API se simula con el formato de
// docs/api/contrato-consultas.md de Pacientes ("Pacientes atendidos" e "Historial clínico").
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion, abrirSeccion } = require('./ayudas');

const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' };

const paciente = (id, nombre, duenio, extra = {}) => ({
  mascota: { id, nombre, especie: 'PERRO', raza: 'Mestizo', activo: true },
  duenio: { id: 100 + id, nombre: duenio },
  consultas: 2,
  ultima_consulta: { fecha: '2026-11-20', diagnostico: 'Otitis externa leve.' },
  ...extra,
});

const CONSULTAS = [
  {
    id: 51, fecha: '2026-11-20', finalizada_en: '2026-11-20 10:40:00', diagnostico: 'Otitis externa leve.', observaciones: 'Control en 10 días.',
    valor_base: '15000.00', insumos: [{ id: 1, insumo_id: 101, nombre: 'Jeringa descartable 3 ml', cantidad: 2, costo_unitario: '150.00' }], productos: [],
    factura: { numero: 'C-000051', total: '15300.00', estado: 'PAGADA' },
  },
  {
    id: 40, fecha: '2026-10-02', finalizada_en: '2026-10-02 09:30:00', diagnostico: 'Control general: sano.', observaciones: null,
    valor_base: '15000.00', insumos: [], productos: [], factura: { numero: 'C-000040', total: '15000.00', estado: 'PAGADA' },
  },
];

async function simular(page, { hayMas = false } = {}) {
  await simularSesion(page, VETERINARIO);
  const pedidos = [];
  await page.route(/\/api\/pacientes\/atendidos(\?.*)?$/, (route) => {
    const q = new URL(route.request().url()).searchParams;
    pedidos.push({ buscar: q.get('buscar'), pagina: q.get('pagina') });
    if (q.get('buscar') === 'zzz') return responderJson(route, { datos: [], pagina: 1, por_pagina: 20, hay_mas: false });
    if (q.get('pagina') === '2') return responderJson(route, { datos: [paciente(103, 'Tom', 'Cliente Dos')], pagina: 2, por_pagina: 20, hay_mas: false });
    return responderJson(route, {
      datos: [paciente(101, 'Firulais', 'Ana Pérez'), paciente(102, 'Michi', 'Ana Pérez', { consultas: 1, ultima_consulta: { fecha: '2026-11-01', diagnostico: null } })],
      pagina: 1, por_pagina: 20, hay_mas: hayMas,
    });
  });
  let historiales = 0;
  await page.route(/\/api\/pacientes\/mascotas\/101\/historial$/, (route) => { historiales++; return responderJson(route, { consultas: CONSULTAS }); });
  await page.route(/\/api\/pacientes\/mascotas\/102\/historial$/, (route) => responderJson(route, { consultas: [] }));
  return { pedidos, historiales: () => historiales };
}

test('desde el panel, "Historial clínico" lleva a los pacientes atendidos', async ({ page }) => {
  await simular(page);
  await page.goto('/paneles/panel-administrador.html');
  await abrirSeccion(page, 'pacientes');
  await page.getByRole('link', { name: 'Historial clínico' }).first().click();
  await expect(page).toHaveURL(/\/panel\/historial-clinico\.html$/);
});

test('lista los pacientes con su dueño, sus consultas y la última, con enlaces a sus fichas', async ({ page }) => {
  await simular(page);
  await page.goto('/panel/historial-clinico.html');

  const fila = page.locator('tr[data-id="101"]');
  await expect(fila).toContainText('Firulais');
  await expect(fila).toContainText('Perro · Mestizo');
  await expect(fila.getByRole('link', { name: 'Ver la ficha de Firulais' })).toHaveAttribute('href', '/cliente/mascota.html?id=101');
  await expect(fila.getByRole('link', { name: 'Ver los datos de Ana Pérez' })).toHaveAttribute('href', '/panel/cliente.html?id=201');
  await expect(fila).toContainText('20/11/2026');
  await expect(fila).toContainText('Otitis externa leve.');
  await expect(fila.getByRole('link', { name: 'Historial completo de Firulais' })).toHaveAttribute('href', '/cliente/historial.html?mascota=101');
});

test('"Ver consultas" despliega el historial de esa mascota en la misma lista', async ({ page }) => {
  const { historiales } = await simular(page);
  await page.goto('/panel/historial-clinico.html');

  const boton = page.getByRole('button', { name: 'Ver las consultas de Firulais' });
  const detalle = page.locator('#consultas-101');
  await expect(detalle).toBeHidden();
  await boton.click();
  await expect(boton).toHaveAttribute('aria-expanded', 'true');
  const consultas = detalle.locator('li.consulta-paciente');
  await expect(consultas).toHaveCount(2);
  await expect(consultas.nth(0)).toContainText('20/11/2026 Otitis externa leve.');
  await expect(consultas.nth(0)).toContainText('Control en 10 días.');
  await expect(consultas.nth(0)).toContainText('Se usó: Jeringa descartable 3 ml × 2');
  await expect(consultas.nth(0)).toContainText('Factura C-000051: $15.300,00');
  await expect(consultas.nth(0).getByRole('link', { name: 'Ver la factura C-000051' })).toHaveAttribute('href', '/cliente/factura.html?consulta=51');
  await expect(consultas.nth(1).getByRole('link', { name: 'Ver la consulta del 02/10/2026' })).toHaveAttribute('href', '/panel/consulta.html?id=40');

  // Se oculta y se vuelve a abrir sin pedirlo de nuevo.
  await page.getByRole('button', { name: 'Ver las consultas de Firulais' }).click();
  await expect(detalle).toBeHidden();
  await page.getByRole('button', { name: 'Ver las consultas de Firulais' }).click();
  await expect(detalle).toBeVisible();
  expect(historiales()).toBe(1);

  // Una mascota sin consultas finalizadas lo dice.
  await page.getByRole('button', { name: 'Ver las consultas de Michi' }).click();
  await expect(page.locator('#consultas-102')).toContainText('No tiene consultas finalizadas.');
});

test('busca por mascota o dueño, y "Ver más" agrega la página siguiente', async ({ page }) => {
  const { pedidos } = await simular(page, { hayMas: true });
  await page.goto('/panel/historial-clinico.html');
  await expect(page.locator('#filas > tr[data-id]')).toHaveCount(2);

  await page.getByRole('button', { name: 'Ver más' }).click();
  await expect(page.locator('#filas > tr[data-id]')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Ver más' })).toBeHidden();

  await page.getByLabel('Buscar por mascota o dueño').fill('zzz');
  await expect(page.locator('#estado')).toHaveText('No encontramos pacientes atendidos con "zzz".');
  await expect(page.locator('#tabla')).toBeHidden();
  expect(pedidos.at(-1)).toEqual({ buscar: 'zzz', pagina: '1' });
});
