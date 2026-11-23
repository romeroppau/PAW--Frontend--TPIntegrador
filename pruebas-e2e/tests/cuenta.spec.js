// Mis datos (cliente, rescatista y veterinaria) y Clientes (la veterinaria: lista, ficha y los enlaces
// desde el nombre del dueño en Mascotas y en la Agenda).
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion, abrirSeccion } = require('./ayudas');

const CLIENTE = { id: 102, nombre: 'Cliente de Prueba', email: 'cliente@prueba.huellavet', rol: 'CLIENTE' };
const RESCATISTA = { id: 104, nombre: 'Rescatista Aprobada', email: 'rescatista@prueba.huellavet', rol: 'RESCATISTA' };
const VET = { id: 101, nombre: 'Veterinaria de Prueba', email: 'vet@prueba.huellavet', rol: 'VETERINARIO' };
const cuentaDe = (u, extra = {}) => ({ id: u.id, nombre: u.nombre, email: u.email, telefono: '2323555555', rol: u.rol, organizacion: null, ...extra });

// ---------- Mis datos ----------

test('mis datos: el cliente ve sus datos (el email no se cambia) y guarda nombre y teléfono', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  let enviado = null;
  await page.route('**/api/cuenta', (route) => {
    if (route.request().method() === 'PUT') {
      enviado = route.request().postDataJSON();
      return responderJson(route, cuentaDe(CLIENTE, { nombre: enviado.nombre, telefono: '2323666666' }));
    }
    return responderJson(route, cuentaDe(CLIENTE));
  });
  await page.goto('/cuenta/mis-datos.html');

  await expect(page.getByLabel('Email')).toHaveValue('cliente@prueba.huellavet');
  await expect(page.getByLabel('Email')).not.toBeEditable();
  await expect(page.getByLabel('Nombre y apellido')).toHaveValue('Cliente de Prueba');
  await expect(page.getByLabel('Teléfono', { exact: true })).toHaveValue('2323555555');
  await expect(page.getByLabel('Organización (opcional)')).toBeHidden();
  await expect(page.getByRole('link', { name: '← Volver al panel' })).toHaveAttribute('href', '/paneles/panel-cliente.html');

  await page.getByLabel('Nombre y apellido').fill('Ana Pérez');
  await page.getByLabel('Teléfono', { exact: true }).fill('2323 666666');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#ok-datos')).toHaveText('Guardamos tus datos.');
  expect(enviado).toEqual({ nombre: 'Ana Pérez', telefono: '2323 666666' });
  // El nombre de arriba a la derecha se actualiza enseguida.
  await expect(page.locator('.sesion-nombre').first()).toHaveText('Ana Pérez');
});

test('mis datos: los errores del servidor se muestran en cada campo', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/cuenta', (route) => route.request().method() === 'PUT'
    ? responderJson(route, { error: 'Datos inválidos', campos: { telefono: 'El teléfono es obligatorio' } }, 400)
    : responderJson(route, cuentaDe(CLIENTE)));
  await page.goto('/cuenta/mis-datos.html');
  await page.getByLabel('Teléfono', { exact: true }).fill('');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#error-telefono')).toHaveText('El teléfono es obligatorio');
  await expect(page.locator('#ok-datos')).toBeHidden();
});

test('mis datos: el rescatista también cambia su organización', async ({ page }) => {
  await simularSesion(page, RESCATISTA);
  let enviado = null;
  await page.route('**/api/cuenta', (route) => {
    if (route.request().method() === 'PUT') {
      enviado = route.request().postDataJSON();
      return responderJson(route, cuentaDe(RESCATISTA, { organizacion: enviado.organizacion }));
    }
    return responderJson(route, cuentaDe(RESCATISTA, { organizacion: 'Patitas' }));
  });
  await page.goto('/cuenta/mis-datos.html');
  await expect(page.getByLabel('Organización (opcional)')).toHaveValue('Patitas');
  await page.getByLabel('Organización (opcional)').fill('Patitas Luján');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.locator('#ok-datos')).toBeVisible();
  expect(enviado.organizacion).toBe('Patitas Luján');
});

test('mis datos: para la veterinaria el teléfono es opcional y vuelve a su panel', async ({ page }) => {
  await simularSesion(page, VET);
  await page.route('**/api/cuenta', (route) => responderJson(route, cuentaDe(VET, { telefono: null })));
  await page.goto('/cuenta/mis-datos.html');
  await expect(page.getByLabel('Teléfono (opcional)')).toHaveValue('');
  await expect(page.getByRole('link', { name: '← Volver al panel' })).toHaveAttribute('href', '/paneles/panel-administrador.html');
});

test('cambiar la contraseña: controla que coincidan, muestra si la actual está mal y avisa cuando se cambió', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/cuenta', (route) => responderJson(route, cuentaDe(CLIENTE)));
  let intentos = 0;
  await page.route('**/api/cuenta/contrasena', (route) => {
    intentos++;
    return intentos === 1
      ? responderJson(route, { error: 'Datos inválidos', campos: { actual: 'La contraseña actual no es correcta' } }, 400)
      : responderJson(route, { mensaje: 'Tu contraseña se cambió' });
  });
  await page.goto('/cuenta/mis-datos.html');

  // Las dos nuevas no coinciden: se avisa sin pedirle nada al servidor.
  await page.getByLabel('Contraseña actual', { exact: true }).fill('vieja-1234');
  await page.getByLabel('Contraseña nueva', { exact: true }).fill('nueva-1234');
  await page.getByLabel('Repetí la contraseña nueva').fill('otra-1234');
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.locator('#error-repetir')).toHaveText('Las contraseñas nuevas no coinciden');
  expect(intentos).toBe(0);

  await page.getByLabel('Repetí la contraseña nueva').fill('nueva-1234');
  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.locator('#error-actual')).toHaveText('La contraseña actual no es correcta');

  await page.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await expect(page.locator('#ok-contrasena')).toHaveText('Tu contraseña se cambió. La próxima vez, entrá con la nueva.');
  await expect(page.getByLabel('Contraseña actual', { exact: true })).toHaveValue('');
});

test('el nombre de arriba lleva a "Mis datos", y "Datos personales" de los paneles también', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.goto('/paneles/panel-cliente.html');
  await expect(page.locator('a.sesion-nombre').first()).toHaveAttribute('href', '/cuenta/mis-datos.html');
  await abrirSeccion(page, 'cuenta');
  await expect(page.locator('#menu-cuenta').getByRole('link', { name: 'Datos personales' })).toHaveAttribute('href', '/cuenta/mis-datos.html');
});

test('el panel del rescatista enlaza "Datos personales"', async ({ page }) => {
  await simularSesion(page, RESCATISTA);
  await page.goto('/paneles/panel-rescatista.html');
  await abrirSeccion(page, 'cuenta');
  await expect(page.getByRole('link', { name: 'Datos personales' })).toHaveAttribute('href', '/cuenta/mis-datos.html');
});

// ---------- Clientes (veterinaria) ----------

const LISTA = Array.from({ length: 20 }, (_, i) => cuentaDe({ id: 200 + i, nombre: `Cliente ${String(i).padStart(2, '0')}`, email: `c${i}@x.com`, rol: 'CLIENTE' }));

test('clientes: el panel lo enlaza; lista con email y teléfono, buscador y "Ver más"', async ({ page }) => {
  await simularSesion(page, VET);
  await page.goto('/paneles/panel-administrador.html');
  await abrirSeccion(page, 'pacientes');
  await expect(page.locator('#menu-pacientes').getByRole('link', { name: 'Clientes' })).toHaveAttribute('href', '/panel/clientes.html');

  const consultas = [];
  await page.route('**/api/clientes?*', (route) => {
    const q = new URL(route.request().url()).searchParams;
    consultas.push(q.toString());
    if (q.get('buscar') === 'nadie') return responderJson(route, { datos: [], pagina: 1, por_pagina: 20, hay_mas: false });
    if (q.get('pagina') === '2') return responderJson(route, { datos: [cuentaDe({ id: 300, nombre: 'Zoe', email: 'zoe@x.com', rol: 'CLIENTE' }, { telefono: null })], pagina: 2, por_pagina: 20, hay_mas: false });
    return responderJson(route, { datos: LISTA, pagina: 1, por_pagina: 20, hay_mas: true });
  });
  await page.goto('/panel/clientes.html');

  const filas = page.locator('#filas > tr');
  await expect(filas).toHaveCount(20);
  await expect(page.getByLabel('Buscar por nombre, email o teléfono')).toBeFocused();
  await expect(page.getByRole('link', { name: 'Cliente 00' })).toHaveAttribute('href', '/panel/cliente.html?id=200');
  await expect(filas.first().getByRole('link', { name: '2323555555' })).toHaveAttribute('href', 'tel:2323555555');
  await page.getByRole('button', { name: 'Ver más' }).click();
  await expect(filas).toHaveCount(21);
  await expect(filas.last()).toContainText('—');
  await expect(page.getByRole('button', { name: 'Ver más' })).toBeHidden();

  await page.getByLabel('Buscar por nombre, email o teléfono').fill('nadie');
  await expect(page.locator('#estado')).toHaveText('No encontramos clientes con "nadie".');
  expect(consultas).toContain('pagina=1&buscar=nadie');
});

test('ficha del cliente: sus datos y solo sus mascotas', async ({ page }) => {
  await simularSesion(page, VET);
  await page.route('**/api/clientes/102', (route) => responderJson(route, cuentaDe(CLIENTE)));
  await page.route('**/api/pacientes/mascotas?*', (route) => responderJson(route, { mascotas: [
    { id: 11, nombre: 'Luna', especie: 'GATO', duenio: { id: 102, nombre: 'Cliente de Prueba' } },
    { id: 12, nombre: 'Rocco', especie: 'PERRO', duenio: { id: 999, nombre: 'Cliente de Prueba' } },
  ] }));
  await page.goto('/panel/cliente.html?id=102');

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cliente de Prueba');
  await expect(page.getByRole('link', { name: 'cliente@prueba.huellavet' })).toHaveAttribute('href', 'mailto:cliente@prueba.huellavet');
  await expect(page.getByRole('link', { name: '2323555555' })).toHaveAttribute('href', 'tel:2323555555');
  // Otro dueño con el mismo nombre: su mascota no aparece.
  await expect(page.locator('#filas-mascotas > tr')).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Historial clínico de Luna' })).toHaveAttribute('href', '/cliente/historial.html?mascota=11');
});

test('ficha del cliente: si no existe, lo dice', async ({ page }) => {
  await simularSesion(page, VET);
  await page.route('**/api/clientes/555', (route) => responderJson(route, { error: 'Cliente no encontrado' }, 404));
  await page.goto('/panel/cliente.html?id=555');
  await expect(page.locator('#estado')).toHaveText('No encontramos ese cliente.');
});

test('en Mascotas y en la Agenda, el nombre del dueño lleva a su ficha', async ({ page }) => {
  await simularSesion(page, VET);
  const duenio = { id: 102, nombre: 'Cliente de Prueba', telefono: '2323555555' };
  await page.route('**/api/pacientes/mascotas*', (route) => responderJson(route, { mascotas: [
    { id: 11, nombre: 'Luna', especie: 'GATO', edad_meses: 30, peso_kg: 4, duenio },
  ] }));
  await page.goto('/cliente/mascotas.html');
  await expect(page.getByRole('link', { name: 'Ver los datos de Cliente de Prueba' })).toHaveAttribute('href', '/panel/cliente.html?id=102');

  await page.route('**/api/pacientes/horario', (route) => responderJson(route, { apertura: '08:00', cierre: '20:00' }));
  await page.route('**/api/pacientes/turnos?*', (route) => responderJson(route, { turnos: [
    { id: 1, hora: '09:00', estado: 'PROGRAMADO', motivo: 'CONSULTA', mascota: { id: 11, nombre: 'Luna', especie: 'GATO' }, duenio },
  ] }));
  await page.goto('/panel/agenda.html');
  await expect(page.getByRole('link', { name: 'Ver los datos de Cliente de Prueba' })).toHaveAttribute('href', '/panel/cliente.html?id=102');
});
