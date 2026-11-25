// Calendario sanitario: elegir la mascota y ver sus vacunas con el estado de cada una.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const CLIENTE = { id: 103, nombre: 'Cliente Dos', email: 'c2@prueba.huellavet', rol: 'CLIENTE' };

const MASCOTAS = [
  { id: 103, nombre: 'Luna', especie: 'PERRO' },
  { id: 104, nombre: 'Tom', especie: 'GATO' }
];

const CALENDARIOS = {
  103: {
    mascota: { id: 103, nombre: 'Luna', especie: 'PERRO', fecha_nacimiento: '2026-08-27' },
    vacunas_al_dia: false,
    eventos: [
      { id: 105, tipo: 'VACUNA', nombre: 'Séxtuple (1.ª dosis)', fecha_programada: '2026-10-08', fecha_aplicada: '2026-10-08', estado: 'APLICADO' },
      { id: 106, tipo: 'VACUNA', nombre: 'Séxtuple (2.ª dosis)', fecha_programada: '2026-10-29', fecha_aplicada: null, estado: 'VENCIDO' },
      { id: 107, tipo: 'VACUNA', nombre: 'Séxtuple (3.ª dosis)', fecha_programada: '2026-11-19', fecha_aplicada: null, estado: 'PROXIMO' }
    ]
  },
  104: {
    mascota: { id: 104, nombre: 'Tom', especie: 'GATO', fecha_nacimiento: '2024-11-05' },
    vacunas_al_dia: true,
    eventos: [
      { id: 109, tipo: 'VACUNA', nombre: 'Antirrábica', fecha_programada: '2027-01-05', fecha_aplicada: null, estado: 'PENDIENTE' }
    ]
  }
};

async function simularApi(page) {
  await page.route(/\/api\/pacientes\/mascotas(\?.*)?$/, (route) => responderJson(route, { mascotas: MASCOTAS }));
  await page.route(/\/api\/pacientes\/mascotas\/\d+\/calendario-sanitario$/, (route) => {
    const id = route.request().url().match(/mascotas\/(\d+)\//)[1];
    return CALENDARIOS[id]
      ? responderJson(route, CALENDARIOS[id])
      : responderJson(route, { error: 'Mascota no encontrada', campos: {} }, 404);
  });
}

test('un rescatista no puede ver el calendario', async ({ page }) => {
  await simularSesion(page, { id: 104, nombre: 'Rescatista', email: 'r@prueba.huellavet', rol: 'RESCATISTA' });
  await page.goto('/cliente/calendario.html');
  await expect(page).toHaveURL(/\/login\/login\.html$/);
});

test('sin mascota en la URL, se elige de la lista y se ve su calendario sin recargar', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await simularApi(page);

  await page.goto('/cliente/calendario.html');
  await expect(page.locator('#mascota option')).toHaveCount(3);
  await expect(page.locator('#calendario')).toBeHidden();
  await page.evaluate(() => { window.sinRecargar = true; });

  await page.selectOption('#mascota', '103');
  await expect(page.locator('#titulo-mascota')).toHaveText('Luna · Perro');
  await expect(page.locator('#al-dia')).toHaveText(/vacunas vencidas/);
  await expect(page.locator('#filas > tr')).toHaveCount(3);
  await expect(page.locator('tr[data-id="105"]')).toContainText('08/10/2026');
  await expect(page.locator('tr[data-id="105"]')).toContainText('Aplicada');
  await expect(page.locator('tr[data-id="106"]')).toContainText('Vencida');
  await expect(page.locator('tr[data-id="107"]')).toContainText('Próximamente');
  await expect(page).toHaveURL(/\?mascota=103$/);
  await expect(page.locator('#enlace-historial')).toHaveAttribute('href', '/cliente/historial.html?mascota=103');

  await page.selectOption('#mascota', '104');
  await expect(page.locator('#al-dia')).toHaveText('Tiene las vacunas al día.');
  await expect(page.locator('#filas > tr')).toHaveCount(1);
  expect(await page.evaluate(() => window.sinRecargar)).toBe(true);
});

test('con ?mascota= en la URL abre directamente ese calendario', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await simularApi(page);

  await page.goto('/cliente/calendario.html?mascota=104');
  await expect(page.locator('#mascota')).toHaveValue('104');
  await expect(page.locator('#titulo-mascota')).toHaveText('Tom · Gato');
});

test('la mascota de otro cliente muestra "no se encontró"', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await simularApi(page);

  await page.goto('/cliente/calendario.html?mascota=101');
  await expect(page.locator('#estado')).toHaveText('No se encontró la mascota.');
  await expect(page.locator('#calendario')).toBeHidden();
});

test('la veterinaria busca por dueño, ve el dueño en la lista y su ficha enlazada (todas las mascotas: puede armarles el calendario)', async ({ page }) => {
  await simularSesion(page, { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO' });
  const pedidos = [];
  const CON_DUENIO = [
    { id: 103, nombre: 'Luna', especie: 'PERRO', duenio: { id: 103, nombre: 'Tomás Aguirre' } },
    { id: 105, nombre: 'Bobby', especie: 'GATO', duenio: { id: 104, nombre: 'Ana Pérez' } },
  ];
  await page.route(/\/api\/pacientes\/mascotas(\?.*)?$/, (route) => {
    const q = new URL(route.request().url()).searchParams;
    pedidos.push(Object.fromEntries(q));
    const buscar = (q.get('buscar') ?? '').toLowerCase();
    return responderJson(route, { mascotas: CON_DUENIO.filter((m) => !buscar || (m.nombre + ' ' + m.duenio.nombre).toLowerCase().includes(buscar)) });
  });
  await page.route(/\/api\/pacientes\/mascotas\/\d+\/calendario-sanitario$/, (route) => responderJson(route, {
    ...CALENDARIOS[103], mascota: { ...CALENDARIOS[103].mascota, duenio: { id: 103, nombre: 'Tomás Aguirre' } },
  }));

  await page.goto('/cliente/calendario.html');
  await expect(page.locator('#mascota option')).toHaveText(['Elegí una mascota', 'Luna (Perro) · Tomás Aguirre', 'Bobby (Gato) · Ana Pérez']);
  expect(pedidos[0]).toEqual({});

  await page.fill('#buscar', 'aguirre');
  await expect(page.locator('#mascota option')).toHaveCount(2);
  expect(pedidos.at(-1)).toEqual({ buscar: 'aguirre' });

  await page.selectOption('#mascota', '103');
  await expect(page.locator('#duenio')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Ver los datos de Tomás Aguirre' })).toHaveAttribute('href', '/panel/cliente.html?id=103');
});

test('el cliente no ve el buscador ni el dueño', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await simularApi(page);
  await page.goto('/cliente/calendario.html?mascota=103');
  await expect(page.locator('#titulo-mascota')).toHaveText('Luna · Perro');
  await expect(page.locator('#campo-buscar')).toBeHidden();
  await expect(page.locator('#duenio')).toBeHidden();
});
