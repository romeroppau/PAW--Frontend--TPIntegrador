// Adopciones (Entrega 5, rol 3): la página pública con la postulación del cliente, las publicaciones
// del rescatista y el panel de adopciones de la veterinaria. La API se simula (ver ayudas.js) con el
// formato de docs/api/contrato-adopciones.md del repo Adopciones.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion, abrirSeccion } = require('./ayudas');

const CLIENTE = { id: 103, nombre: 'Cliente Dos', email: 'c2@prueba.huellavet', rol: 'CLIENTE', estado_validacion: null };
const RESCATISTA = { id: 104, nombre: 'Rescatista Aprobada', email: 'r@prueba.huellavet', rol: 'RESCATISTA', estado_validacion: 'APROBADO' };
const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO', estado_validacion: null };

// PNG de 1 x 1, para elegir una foto en los formularios.
const FOTO = {
  name: 'canela.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
};

function publicacion(id, nombre, extra = {}) {
  return {
    id,
    titulo: `${nombre} busca familia`,
    descripcion: `${nombre} es muy cariñoso y está vacunado.`,
    estado_moderacion: 'APROBADA',
    motivo_rechazo: null,
    activa: true,
    creada_en: '2026-11-10 10:00:00',
    mascota: { id: 900 + id, nombre, especie: 'GATO', raza: null, edad_meses: 6, peso_kg: '2.10' },
    rescatista: { id: 104, nombre: 'Rescatista Aprobada', organizacion: 'Refugio Huellitas' },
    adopcion: { id, estado: 'CON_POSTULANTES', postulaciones_pendientes: 1 },
    ...extra,
  };
}

function postulacion(id, nombreCliente, extra = {}) {
  return {
    id, estado: 'PENDIENTE', fecha: '2026-11-15 18:20:00',
    tipo_vivienda: 'Casa con patio', otras_mascotas: 'Ninguna', tiempo_disponible: 'Toda la tarde',
    cliente: { id: 100 + id, nombre: nombreCliente, telefono: null },
    adopcion: { id: 1, estado: 'CON_POSTULANTES' },
    publicacion: { id: 1, titulo: 'Pipa busca familia', mascota: { id: 901, nombre: 'Pipa' } },
    ...extra,
  };
}

// Responde según el método; lo demás sigue de largo.
function soloMetodo(metodo, responder) {
  return (route) => (route.request().method() === metodo ? responder(route) : route.fallback());
}

/* ---------- Página pública y cliente ---------- */

test('sin sesión se ven los animales disponibles, se filtra por especie y se invita a iniciar sesión', async ({ page }) => {
  await simularSesion(page, null);
  const filtros = [];
  await page.route(/\/api\/adopciones\/publicaciones(\?.*)?$/, (route) => {
    const especie = new URL(route.request().url()).searchParams.get('especie');
    filtros.push(especie);
    return responderJson(route, { publicaciones: especie === 'PERRO' ? [] : [publicacion(1, 'Pipa'), publicacion(2, 'Tom')] });
  });

  await page.goto('/adopciones/adopciones.html');
  await expect(page.locator('.tarjeta-adopcion')).toHaveCount(2);
  await expect(page.locator('.tarjeta-adopcion').first()).toContainText('Refugio Huellitas');
  await expect(page.locator('#invitacion')).toBeVisible();
  await expect(page.getByRole('button', { name: /Postularme/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Perros' }).click();
  await expect(page.locator('#estado')).toHaveText('Por ahora no hay animales en adopción con ese filtro.');
  await expect(page.getByRole('button', { name: 'Perros' })).toHaveAttribute('aria-pressed', 'true');
  expect(filtros).toEqual([null, 'PERRO']);
});

test('el cliente se postula: los errores van a cada campo y, al corregir, ve su postulación sin recargar', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route(/\/api\/adopciones\/publicaciones(\?.*)?$/, (route) => responderJson(route, { publicaciones: [publicacion(1, 'Pipa')] }));
  const mias = [];
  await page.route('**/api/adopciones/mis-postulaciones', (route) => responderJson(route, { postulaciones: mias }));
  const cuerpos = [];
  await page.route('**/api/adopciones/1/postulaciones', soloMetodo('POST', (route) => {
    const cuerpo = route.request().postDataJSON();
    cuerpos.push(cuerpo);
    if (cuerpo.tipo_vivienda === '') {
      return responderJson(route, { error: 'Revisá los datos de la postulación', campos: { tipo_vivienda: 'El tipo de vivienda es obligatorio' } }, 400);
    }
    mias.push(postulacion(7, 'Cliente Dos'));
    return responderJson(route, { postulacion: mias[0] }, 201);
  }));

  await page.goto('/adopciones/adopciones.html');
  await expect(page.locator('#estado-mias')).toHaveText('Todavía no te postulaste a ninguna adopción.');
  await page.evaluate(() => { window.sinRecargar = true; });
  await page.getByRole('button', { name: 'Postularme para adoptar a Pipa' }).click();
  await page.fill('#otras_mascotas', 'Ninguna');
  await page.fill('#tiempo_disponible', 'Toda la tarde');
  await page.getByRole('button', { name: 'Enviar postulación' }).click();
  await expect(page.locator('#error-tipo_vivienda')).toHaveText('El tipo de vivienda es obligatorio');

  await page.fill('#tipo_vivienda', 'Casa con patio');
  await page.getByRole('button', { name: 'Enviar postulación' }).click();
  await expect(page.locator('#aviso')).toContainText('Te postulaste para adoptar a Pipa');
  await expect(page.locator('#seccion-postulacion')).toBeHidden();
  await expect(page.locator('#filas-mias tr')).toContainText(['Pipa']);
  // La tarjeta de Pipa ya no ofrece postularse: dice el estado.
  await expect(page.locator('.tarjeta-adopcion', { hasText: 'Pipa' }).locator('.tu-postulacion')).toContainText('Tu postulación: Esperando revisión');
  expect(cuerpos.at(-1)).toEqual({ tipo_vivienda: 'Casa con patio', otras_mascotas: 'Ninguna', tiempo_disponible: 'Toda la tarde' });
  expect(await page.evaluate(() => window.sinRecargar)).toBe(true);
});

test('mis postulaciones: es una pestaña, y la elegida dice en qué paso está', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route(/\/api\/adopciones\/publicaciones(\?.*)?$/, (route) => responderJson(route, { publicaciones: [publicacion(1, 'Pipa')] }));
  await page.route('**/api/adopciones/mis-postulaciones', (route) => responderJson(route, { postulaciones: [
    postulacion(7, 'Cliente Dos', { estado: 'ELEGIDA', adopcion: { id: 1, estado: 'CHEQUEO_PENDIENTE', turno_chequeo: { fecha: '2026-11-26', hora: '10:00', estado: 'PROGRAMADO' } } }),
    postulacion(8, 'Cliente Dos', { estado: 'ELEGIDA', adopcion: { id: 2, estado: 'ADOPTANTE_ELEGIDO', turno_chequeo: null } }),
    postulacion(9, 'Cliente Dos'),
  ] }));

  await page.goto('/adopciones/adopciones.html');
  // Dos pestañas: los animales (abierta) y sus postulaciones.
  await expect(page.getByRole('tab', { name: 'Animales que buscan familia' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#seccion-mias')).toBeHidden();
  await page.getByRole('tab', { name: 'Mis postulaciones' }).click();
  await expect(page).toHaveURL(/#seccion-mias$/);
  await expect(page.locator('#seccion-mias')).toBeVisible();
  await expect(page.locator('#publicaciones')).toBeHidden();

  const filas = page.locator('#filas-mias > tr');
  await expect(filas.nth(0)).toContainText('Turno de chequeo: jue 26/11 a las 10:00.');
  await expect(filas.nth(1)).toContainText('Esperando el turno del chequeo');
  await expect(filas.nth(2)).toContainText('La rescatista todavía está eligiendo.');
});

test('si ya se postuló, el aviso del servidor se ve en el formulario', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route(/\/api\/adopciones\/publicaciones(\?.*)?$/, (route) => responderJson(route, { publicaciones: [publicacion(1, 'Pipa')] }));
  await page.route('**/api/adopciones/mis-postulaciones', (route) => responderJson(route, { postulaciones: [] }));
  await page.route('**/api/adopciones/1/postulaciones', soloMetodo('POST', (route) =>
    responderJson(route, { error: 'Ya te postulaste a esta adopción', campos: {} }, 409)));

  await page.goto('/adopciones/adopciones.html');
  await page.getByRole('button', { name: 'Postularme para adoptar a Pipa' }).click();
  await page.fill('#tipo_vivienda', 'Casa');
  await page.fill('#otras_mascotas', 'Ninguna');
  await page.fill('#tiempo_disponible', 'Mucho');
  await page.getByRole('button', { name: 'Enviar postulación' }).click();
  await expect(page.locator('#error-general')).toHaveText('Ya te postulaste a esta adopción');
});

test('desde su panel, el cliente llega a las adopciones y a sus postulaciones; Huellitas ya no aparece', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route(/\/api\/adopciones\/publicaciones(\?.*)?$/, (route) => responderJson(route, { publicaciones: [publicacion(1, 'Pipa')] }));
  await page.route('**/api/adopciones/mis-postulaciones', (route) => responderJson(route, { postulaciones: [postulacion(7, 'Cliente Dos')] }));

  await page.goto('/paneles/panel-cliente.html');
  await expect(page.getByText('Huellitas')).toHaveCount(0);
  await abrirSeccion(page, 'adopcion');
  await page.locator('#menu-adopcion').getByRole('link', { name: 'Mis postulaciones' }).click();
  await expect(page).toHaveURL(/\/adopciones\/adopciones\.html#seccion-mias$/);
  await expect(page.locator('#filas-mias tr')).toContainText(['Pipa']);
  await expect(page.locator('#seccion-mias')).toBeInViewport();
});

test('mis postulaciones: el animal lleva a su publicación, aunque ya no esté disponible', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route(/\/api\/adopciones\/publicaciones(\?.*)?$/, (route) => responderJson(route, { publicaciones: [] }));
  await page.route('**/api/adopciones/mis-postulaciones', (route) => responderJson(route, { postulaciones: [
    postulacion(7, 'Cliente Dos', { estado: 'RECHAZADA', adopcion: { id: 1, estado: 'ADOPTANTE_ELEGIDO' } }),
  ] }));
  await page.route('**/api/adopciones/publicaciones/1', (route) => responderJson(route, {
    publicacion: publicacion(1, 'Pipa', { adopcion: { id: 1, estado: 'ADOPTANTE_ELEGIDO' } }),
  }));

  await page.goto('/adopciones/adopciones.html#seccion-mias');
  await expect(page.locator('#seccion-mias')).toBeVisible();
  await page.getByRole('link', { name: 'Ver la publicación de Pipa' }).click();
  await expect(page).toHaveURL(/\/adopciones\/publicacion\.html\?id=1$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Pipa' })).toBeVisible();
  await expect(page.locator('#descripcion')).toHaveText('Pipa es muy cariñoso y está vacunado.');
  // Ya se postuló: ve el estado de su postulación en lugar de los botones.
  await expect(page.locator('.tu-postulacion')).toContainText('Tu postulación: Cancelada por la rescatista');
  await expect(page.getByRole('link', { name: 'Quiero adoptarlo' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Ver mis postulaciones' })).toHaveCount(0);
  await expect(page.locator('#volver')).toHaveText('← Volver a mis postulaciones');
  await expect(page.locator('#volver')).toHaveAttribute('href', '/adopciones/adopciones.html#seccion-mias');
});

test('la publicación de un animal al que se postuló y sigue disponible muestra el estado, no "Quiero adoptarlo"', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/adopciones/publicaciones/1', (route) => responderJson(route, { publicacion: publicacion(1, 'Pipa') }));
  await page.route('**/api/adopciones/mis-postulaciones', (route) => responderJson(route, { postulaciones: [postulacion(7, 'Cliente Dos')] }));

  await page.goto('/adopciones/publicacion.html?id=1');
  await expect(page.locator('.tu-postulacion')).toContainText('Tu postulación: Esperando revisión');
  await expect(page.locator('.tu-postulacion')).toContainText('La rescatista todavía está eligiendo.');
  await expect(page.locator('#disponibilidad')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Quiero adoptarlo' })).toHaveCount(0);
});

test('en "Animales que buscan familia", los animales a los que se postuló muestran el estado en lugar de "Quiero adoptarlo"', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route(/\/api\/adopciones\/publicaciones(\?.*)?$/, (route) => responderJson(route, { publicaciones: [publicacion(1, 'Pipa'), publicacion(2, 'Toby')] }));
  await page.route('**/api/adopciones/mis-postulaciones', (route) => responderJson(route, { postulaciones: [postulacion(7, 'Cliente Dos')] }));

  await page.goto('/adopciones/adopciones.html');
  const pipa = page.locator('.tarjeta-adopcion', { hasText: 'Pipa' });
  const toby = page.locator('.tarjeta-adopcion', { hasText: 'Toby' });
  await expect(pipa.locator('.tu-postulacion')).toContainText('Tu postulación: Esperando revisión');
  await expect(pipa.getByRole('button', { name: /Postularme/ })).toHaveCount(0);
  await expect(toby.getByRole('button', { name: 'Postularme para adoptar a Toby' })).toBeVisible();

  // Y con ?postular= de un animal al que ya se postuló, no se abre el formulario.
  await page.goto('/adopciones/adopciones.html?postular=1');
  await expect(pipa.locator('.tu-postulacion')).toBeVisible();
  await expect(page.locator('#seccion-postulacion')).toBeHidden();
});

test('la publicación de un animal disponible ofrece "Quiero adoptarlo", que abre el formulario', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/adopciones/publicaciones/1', (route) => responderJson(route, { publicacion: publicacion(1, 'Pipa') }));
  await page.route(/\/api\/adopciones\/publicaciones(\?.*)?$/, (route) => responderJson(route, { publicaciones: [publicacion(1, 'Pipa')] }));
  await page.route('**/api/adopciones/mis-postulaciones', (route) => responderJson(route, { postulaciones: [] }));

  await page.goto('/adopciones/publicacion.html?id=1');
  await expect(page.locator('#disponibilidad')).toHaveText('Busca familia.');
  await page.getByRole('link', { name: 'Quiero adoptarlo' }).click();
  await expect(page).toHaveURL(/\/adopciones\/adopciones\.html\?postular=1$/);
  await expect(page.locator('#titulo-postulacion')).toHaveText('Postularme para adoptar a Pipa');
  await expect(page.locator('#tipo_vivienda')).toBeFocused();
});

test('sin sesión no hay pestañas: se ve la lista de animales', async ({ page }) => {
  await simularSesion(page, null);
  await page.route(/\/api\/adopciones\/publicaciones(\?.*)?$/, (route) => responderJson(route, { publicaciones: [publicacion(1, 'Pipa')] }));
  await page.goto('/adopciones/adopciones.html');
  await expect(page.locator('#pestanas-adopciones')).toBeHidden();
  await expect(page.locator('#publicaciones article')).toHaveCount(1);
  await expect(page.locator('#seccion-mias')).toBeHidden();
});

/* ---------- Rescatista ---------- */

test('una rescatista pendiente ve el aviso y no puede publicar', async ({ page }) => {
  await simularSesion(page, { ...RESCATISTA, estado_validacion: 'PENDIENTE' });
  await page.route('**/api/adopciones/mis-publicaciones', (route) => responderJson(route, { publicaciones: [] }));

  await page.goto('/rescatista/publicaciones.html');
  await expect(page.locator('#aviso-cuenta')).toContainText('esperando la aprobación');
  await expect(page.locator('#nueva')).toBeHidden();
  await expect(page.locator('#estado')).toHaveText('Todavía no publicaste ningún animal.');
});

test('la rescatista publica: la foto se pide antes de llamar a la API y viaja como data URL', async ({ page }) => {
  await simularSesion(page, RESCATISTA);
  const lista = [];
  await page.route('**/api/adopciones/mis-publicaciones', (route) => responderJson(route, { publicaciones: lista }));
  await page.route('**/api/pacientes/mascotas', (route) => responderJson(route, { mascotas: [{ id: 901, nombre: 'Canela', especie: 'PERRO' }] }));
  const cuerpos = [];
  await page.route('**/api/adopciones/publicaciones', soloMetodo('POST', (route) => {
    cuerpos.push(route.request().postDataJSON());
    lista.push(publicacion(5, 'Canela', { estado_moderacion: 'PENDIENTE', adopcion: null }));
    return responderJson(route, { publicacion: lista[0] }, 201);
  }));

  await page.goto('/rescatista/publicaciones.html');
  await page.getByRole('button', { name: 'Nueva publicación' }).click();
  await page.selectOption('#mascota_id', '901');
  await page.fill('#titulo', 'Canela busca familia');
  await page.fill('#descripcion', 'Perra de un año, mansa y juguetona.');
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.locator('#error-foto')).toHaveText('La foto es obligatoria');
  expect(cuerpos).toHaveLength(0);

  await page.setInputFiles('#foto', FOTO);
  await page.getByRole('button', { name: 'Publicar' }).click();
  await expect(page.locator('.tarjeta-adopcion')).toContainText('Esperando revisión');
  await expect(page.locator('#seccion-form')).toBeHidden();
  expect(cuerpos[0]).toMatchObject({ mascota_id: 901, titulo: 'Canela busca familia', descripcion: 'Perra de un año, mansa y juguetona.' });
  expect(cuerpos[0].foto).toMatch(/^data:image\/png;base64,/);
});

test('editar una publicación rechazada: muestra el motivo, no cambia la mascota y la foto es opcional', async ({ page }) => {
  await simularSesion(page, RESCATISTA);
  const rechazada = publicacion(2, 'Rocco', { estado_moderacion: 'RECHAZADA', motivo_rechazo: 'La foto no se ve bien', adopcion: null });
  await page.route('**/api/adopciones/mis-publicaciones', (route) => responderJson(route, { publicaciones: [rechazada] }));
  let cuerpo = null;
  await page.route('**/api/adopciones/publicaciones/2', soloMetodo('PUT', (route) => {
    cuerpo = route.request().postDataJSON();
    Object.assign(rechazada, { titulo: cuerpo.titulo, estado_moderacion: 'PENDIENTE', motivo_rechazo: null });
    return responderJson(route, { publicacion: rechazada });
  }));

  await page.goto('/rescatista/publicaciones.html');
  await expect(page.locator('.tarjeta-adopcion')).toContainText('Motivo del rechazo: La foto no se ve bien');
  await page.getByRole('button', { name: 'Editar la publicación de Rocco' }).click();
  await expect(page.locator('#campo-mascota')).toBeHidden();
  await expect(page.locator('#titulo')).toHaveValue('Rocco busca familia');
  await page.fill('#titulo', 'Rocco, compañero de caminatas');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();

  await expect(page.locator('.tarjeta-adopcion')).toContainText('Esperando revisión');
  await expect(page.locator('.tarjeta-adopcion')).not.toContainText('Motivo del rechazo');
  expect(cuerpo).toEqual({ titulo: 'Rocco, compañero de caminatas', descripcion: 'Rocco es muy cariñoso y está vacunado.' });
});

test('dar de baja pide confirmación (avisando que se cancela la adopción) y usa DELETE', async ({ page }) => {
  await simularSesion(page, RESCATISTA);
  const pipa = publicacion(1, 'Pipa');
  await page.route('**/api/adopciones/mis-publicaciones', (route) => responderJson(route, { publicaciones: [pipa] }));
  let bajas = 0;
  await page.route('**/api/adopciones/publicaciones/1', soloMetodo('DELETE', (route) => {
    bajas += 1;
    Object.assign(pipa, { activa: false, adopcion: { id: 1, estado: 'CANCELADA', postulaciones_pendientes: 0 } });
    return route.fulfill({ status: 204 });
  }));

  await page.goto('/rescatista/publicaciones.html');
  await page.getByRole('button', { name: 'Dar de baja la publicación de Pipa' }).click();
  await expect(page.locator('dialog')).toContainText('Su adopción se cancela');
  await page.locator('dialog').getByRole('button', { name: 'Volver' }).click();
  expect(bajas).toBe(0);

  await page.getByRole('button', { name: 'Dar de baja la publicación de Pipa' }).click();
  await page.locator('dialog').getByRole('button', { name: 'Dar de baja' }).click();
  await expect(page.locator('.tarjeta-adopcion')).toContainText('Cancelada');
  await expect(page.getByRole('button', { name: /Editar la publicación/ })).toHaveCount(0);
  expect(bajas).toBe(1);
});

test('la rescatista ve los postulantes y elige al adoptante; el teléfono aparece solo del elegido', async ({ page }) => {
  await simularSesion(page, RESCATISTA);
  await page.route('**/api/adopciones/mis-publicaciones', (route) => responderJson(route, { publicaciones: [publicacion(1, 'Pipa')] }));
  let adopcion = { id: 1, estado: 'CON_POSTULANTES' };
  let postulaciones = [postulacion(1, 'Cliente de Prueba'), postulacion(2, 'Cliente Dos')];
  await page.route('**/api/adopciones/1/postulaciones', (route) => responderJson(route, { adopcion, postulaciones }));
  let elegida = null;
  await page.route('**/api/adopciones/1/elegir', (route) => {
    elegida = route.request().postDataJSON();
    adopcion = { id: 1, estado: 'ADOPTANTE_ELEGIDO' };
    postulaciones = [
      postulacion(1, 'Cliente de Prueba', { estado: 'RECHAZADA' }),
      postulacion(2, 'Cliente Dos', { estado: 'ELEGIDA', cliente: { id: 102, nombre: 'Cliente Dos', telefono: '1155550103' } }),
    ];
    return responderJson(route, { adopcion, postulaciones });
  });

  await page.goto('/rescatista/publicaciones.html');
  await page.getByRole('button', { name: /Postulantes/ }).click();
  await expect(page.locator('#filas-postulantes tr')).toHaveCount(2);
  await expect(page.locator('#filas-postulantes')).not.toContainText('Tel.:');

  await page.getByRole('button', { name: 'Elegir a Cliente Dos' }).click();
  await page.locator('dialog').getByRole('button', { name: 'Elegir adoptante' }).click();
  await expect(page.locator('#filas-postulantes')).toContainText('Tel.: 1155550103');
  await expect(page.locator('#filas-postulantes')).toContainText('Cancelada por vos');
  await expect(page.getByRole('button', { name: /^Elegir a/ })).toHaveCount(0);
  expect(elegida).toEqual({ postulacion_id: 2 });
});

test('en "Mis mascotas", la rescatista no ve el calendario ni el historial', async ({ page }) => {
  await simularSesion(page, RESCATISTA);
  await page.route(/\/api\/pacientes\/mascotas(\?.*)?$/, (route) => responderJson(route, { mascotas: [{
    id: 901, nombre: 'Canela', especie: 'PERRO', raza: null, fecha_nacimiento: null, edad_meses: 12,
    peso_kg: null, tiene_foto: false, activo: true, duenio: { id: 104, nombre: 'Rescatista Aprobada', telefono: null },
  }] }));

  await page.goto('/cliente/mascotas.html');
  await expect(page.locator('tr[data-id="901"]')).toContainText('Canela');
  await expect(page.locator('#nueva')).toBeVisible();
  await expect(page.getByRole('link', { name: /Calendario|Historial/ })).toHaveCount(0);
});

/* ---------- Veterinaria ---------- */

// Simula todo lo que carga el panel de la veterinaria, con listas que cada prueba puede cambiar.
// El listado de adopciones pagina y busca como la API; los pedidos quedan en datos.pedidos.
async function simularPanelVet(page, datos) {
  await simularSesion(page, VETERINARIO);
  datos.pedidos = [];
  // Rescatistas y publicaciones: según el estado pedido (sin estado, los pendientes).
  await page.route(/\/api\/rescatistas(\?.*)?$/, (route) => {
    const query = new URL(route.request().url()).searchParams;
    datos.pedidos.push(Object.fromEntries(query));
    const estado = query.get('estado') ?? 'PENDIENTE';
    const lista = { PENDIENTE: datos.rescatistas, APROBADO: datos.aprobados, RECHAZADO: datos.rechazados }[estado] ?? [];
    const buscar = (query.get('buscar') ?? '').toLowerCase();
    return responderJson(route, { rescatistas: lista.filter((r) => r.nombre.toLowerCase().includes(buscar)) });
  });
  await page.route(/\/api\/adopciones\/moderacion(\?.*)?$/, (route) => {
    const query = new URL(route.request().url()).searchParams;
    datos.pedidos.push(Object.fromEntries(query));
    const lista = query.get('estado') === 'APROBADA' ? datos.aprobadas : datos.moderacion;
    return responderJson(route, { publicaciones: lista ?? [] });
  });
  await page.route(/\/api\/adopciones\/rechazos(\?.*)?$/, (route) => {
    datos.pedidos.push({ rechazos: true, ...Object.fromEntries(new URL(route.request().url()).searchParams) });
    return responderJson(route, { rechazos: datos.historial ?? [] });
  });
  await page.route(/\/api\/adopciones(\?.*)?$/, (route) => {
    const query = new URL(route.request().url()).searchParams;
    datos.pedidos.push(Object.fromEntries(query));
    const lista = { FINALIZADA: datos.finalizadas, CANCELADA: datos.canceladas }[query.get('estado')] ?? datos.enCurso ?? [];
    const buscar = (query.get('buscar') ?? '').toLowerCase();
    const filtradas = (lista ?? []).filter((a) => a.publicacion.mascota.nombre.toLowerCase().includes(buscar));
    const pagina = Number(query.get('pagina') ?? 1);
    const porPagina = Number(query.get('por_pagina') ?? 100);
    return responderJson(route, {
      adopciones: filtradas.slice((pagina - 1) * porPagina, pagina * porPagina),
      total: filtradas.length, pagina, por_pagina: porPagina,
    });
  });
}

// "Hoy" de Argentina y hace 30 días, como los calcula el panel.
function diasAtras(dias) {
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
  const d = new Date(hoy + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

function adopcionEnCurso(estado, turno = null) {
  return {
    id: 1, estado, fecha_inicio: '2026-11-10 10:00:00', fecha_fin: null,
    publicacion: publicacion(1, 'Pipa'),
    adoptante: { id: 103, nombre: 'Cliente Dos', telefono: '1155550103' },
    turno_chequeo: turno,
  };
}

function rescatista(id, nombre, extra = {}) {
  return {
    id, nombre, email: `r${id}@prueba.huellavet`, telefono: '1155550105', organizacion: 'Patitas al Rescate',
    estado_validacion: 'PENDIENTE', validado_en: null, motivo_rechazo: null, ...extra,
  };
}

test('la veterinaria aprueba un rescatista, rechaza otro con motivo y rechaza una publicación con su motivo', async ({ page }) => {
  const datos = {
    rescatistas: [rescatista(105, 'Rescatista Pendiente'), rescatista(106, 'Otro Pendiente')],
    moderacion: [publicacion(2, 'Rocco', { estado_moderacion: 'PENDIENTE', adopcion: null })],
  };
  await simularPanelVet(page, datos);
  const pedidos = [];
  await page.route('**/api/rescatistas/105/aprobar', (route) => {
    pedidos.push('aprobar 105');
    datos.rescatistas = datos.rescatistas.filter((r) => r.id !== 105);
    return responderJson(route, { rescatista: {} });
  });
  await page.route('**/api/rescatistas/106/rechazar', (route) => {
    const { motivo } = route.request().postDataJSON();
    if (!motivo) return responderJson(route, { error: 'Revisá el motivo del rechazo', campos: { motivo: 'Escribí el motivo del rechazo' } }, 400);
    pedidos.push('rechazar 106: ' + motivo);
    datos.rescatistas = [];
    return responderJson(route, { rescatista: {} });
  });
  await page.route('**/api/adopciones/publicaciones/2/rechazar', (route) => {
    const { motivo } = route.request().postDataJSON();
    if (!motivo) return responderJson(route, { error: 'Revisá el motivo', campos: { motivo: 'El motivo es obligatorio' } }, 400);
    pedidos.push('rechazar 2: ' + motivo);
    datos.moderacion = [];
    return responderJson(route, { publicacion: {} });
  });

  await page.goto('/panel/adopciones.html');
  // Cada pestaña dice cuántos hay esperando.
  const pestanaRescatistas = page.getByRole('tab', { name: /Rescatistas/ });
  await expect(pestanaRescatistas).toContainText('(2)');
  await expect(page.getByRole('tab', { name: /Publicaciones/ })).toContainText('(1)');

  await pestanaRescatistas.click();
  await expect(page).toHaveURL(/#rescatistas$/);
  const filas = page.locator('#filas-rescatistas');
  // El nombre lleva a su perfil.
  await expect(filas.getByRole('link', { name: 'Rescatista Pendiente' })).toHaveAttribute('href', '/panel/rescatista.html?id=105');
  await filas.locator('tr', { hasText: 'Rescatista Pendiente' }).getByRole('button', { name: 'Aprobar' }).click();
  await expect(pestanaRescatistas).toContainText('(1)');

  // Rechazar pide el motivo: sin motivo, el error del servidor; con motivo, se rechaza.
  const fila = filas.locator('tr', { hasText: 'Otro Pendiente' });
  await fila.getByRole('button', { name: 'Rechazar' }).click();
  await fila.getByRole('button', { name: 'Confirmar rechazo' }).click();
  await expect(fila.locator('.campo-error')).toHaveText('Escribí el motivo del rechazo');
  await fila.getByLabel('Motivo del rechazo').fill('No pudimos verificar el refugio');
  await fila.getByRole('button', { name: 'Confirmar rechazo' }).click();
  await expect(page.locator('#estado-rescatistas')).toHaveText('No hay rescatistas esperando la aprobación.');
  await expect(pestanaRescatistas).not.toContainText('(');

  await page.getByRole('tab', { name: /Publicaciones/ }).click();
  await expect(page).toHaveURL(/#publicaciones$/);
  const tarjeta = page.locator('.tarjeta-adopcion', { hasText: 'Rocco' });
  await expect(tarjeta.getByRole('link', { name: 'Rescatista Aprobada' })).toHaveAttribute('href', '/panel/rescatista.html?id=104');
  await tarjeta.getByRole('button', { name: 'Rechazar' }).click();
  await expect(tarjeta.locator('.campo-error')).toHaveText('El motivo es obligatorio');
  await tarjeta.getByLabel('Motivo del rechazo').fill('La foto no se ve bien');
  await tarjeta.getByRole('button', { name: 'Rechazar' }).click();
  await expect(page.locator('#estado-moderacion')).toHaveText('No hay publicaciones por revisar.');
  expect(pedidos).toEqual(['aprobar 105', 'rechazar 106: No pudimos verificar el refugio', 'rechazar 2: La foto no se ve bien']);
});

test('el enlace viejo #moderacion abre la pestaña Publicaciones', async ({ page }) => {
  await simularPanelVet(page, { moderacion: [publicacion(2, 'Rocco', { estado_moderacion: 'PENDIENTE', adopcion: null, veces_rechazada: 1 })] });
  await page.goto('/panel/adopciones.html#moderacion');
  await expect(page.getByRole('tab', { name: /Publicaciones/ })).toHaveAttribute('aria-selected', 'true');
  // Si ya se rechazó antes, se avisa.
  await expect(page.locator('.tarjeta-adopcion', { hasText: 'Rocco' })).toContainText('Ya se rechazó 1 vez');
});

test('rescatistas aprobados y rechazados: con fecha, hora y motivo, y con búsqueda', async ({ page }) => {
  const datos = {
    aprobados: [rescatista(107, 'Paula Herrera', { estado_validacion: 'APROBADO', validado_en: '2026-11-20 09:15:00' })],
    rechazados: [
      rescatista(108, 'Juan Falso', { estado_validacion: 'RECHAZADO', validado_en: '2026-11-21 18:40:00', motivo_rechazo: 'Datos falsos' }),
      rescatista(109, 'Ana Vieja', { estado_validacion: 'RECHAZADO' }),
    ],
  };
  await simularPanelVet(page, datos);
  await page.goto('/panel/adopciones.html#rescatistas');

  // Las fechas solo están en aprobados y rechazados.
  await expect(page.getByLabel('Hasta', { exact: true }).first()).toBeHidden();
  await page.getByRole('button', { name: 'Aprobados' }).click();
  await expect(page.getByRole('button', { name: 'Aprobados' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#columnas-rescatistas')).toContainText('Aprobado el');
  await expect(page.locator('#filas-rescatistas')).toContainText('20/11/2026 09:15');
  await expect(page.getByLabel('Aprobado desde')).toBeVisible();

  await page.getByRole('button', { name: 'Rechazados' }).click();
  const filas = page.locator('#filas-rescatistas tr');
  await expect(filas).toHaveCount(2);
  await expect(filas.nth(0)).toContainText('21/11/2026 18:40');
  await expect(filas.nth(0)).toContainText('Datos falsos');
  // Los rechazados antes de que se guardara el motivo lo dicen.
  await expect(filas.nth(1)).toContainText('Sin fecha registrada');
  await expect(filas.nth(1)).toContainText('Sin motivo registrado');

  await page.locator('#buscar-rescatistas').fill('juan');
  await page.getByLabel('Rechazado desde').fill('2026-11-01');
  await page.locator('#filtro-rescatistas').getByRole('button', { name: 'Buscar' }).click();
  await expect(filas).toHaveCount(1);
  expect(datos.pedidos).toContainEqual({ estado: 'RECHAZADO', buscar: 'juan', desde: '2026-11-01' });

  await page.locator('#buscar-rescatistas').fill('nadie');
  await page.locator('#filtro-rescatistas').getByRole('button', { name: 'Buscar' }).click();
  await expect(page.locator('#estado-rescatistas')).toHaveText('Ningún rescatista coincide con la búsqueda.');
});

test('publicaciones aprobadas y el historial de rechazos, con motivo, fecha, hora y cómo está ahora', async ({ page }) => {
  const datos = {
    aprobadas: [publicacion(3, 'Mishi', { aprobada_en: '2026-11-18 11:05:00' })],
    historial: [
      { id: 2, motivo: 'La foto no se ve bien', rechazada_en: '2026-11-15 16:30:00', veterinaria: 'Vet',
        publicacion: { id: 3, titulo: 'Mishi busca familia', estado_moderacion: 'APROBADA', activa: false, adopcion_estado: 'FINALIZADA' },
        mascota: { id: 903, nombre: 'Mishi', especie: 'GATO' },
        rescatista: { id: 104, nombre: 'Rescatista Aprobada', organizacion: null } },
      { id: 1, motivo: 'Falta la descripción', rechazada_en: '2026-11-10 10:00:00', veterinaria: null,
        publicacion: { id: 4, titulo: 'Toby', estado_moderacion: 'RECHAZADA', activa: false, adopcion_estado: null },
        mascota: { id: 904, nombre: 'Toby', especie: 'PERRO' },
        rescatista: { id: 104, nombre: 'Rescatista Aprobada', organizacion: null } },
    ],
  };
  await simularPanelVet(page, datos);
  await page.goto('/panel/adopciones.html#publicaciones');

  await page.getByRole('button', { name: 'Aprobadas' }).click();
  const filas = page.locator('#filas-publicaciones tr');
  await expect(filas).toHaveCount(1);
  await expect(filas.first()).toContainText('18/11/2026 11:05');
  await expect(filas.first().getByRole('link', { name: 'Mishi' })).toHaveAttribute('href', '/adopciones/publicacion.html?id=3');
  await expect(filas.first().getByRole('link', { name: 'Ver la adopción' })).toHaveAttribute('href', '/panel/adopcion.html?id=3');
  await expect(page.getByLabel('Aprobada desde')).toBeVisible();

  await page.getByRole('button', { name: 'Rechazos' }).click();
  await expect(filas).toHaveCount(2);
  // Mishi se rechazó, después se aprobó y se adoptó: el rechazo sigue en el historial, y "Ahora"
  // dice Adoptado (su publicación quedó inactiva al completarse la adopción, no se dio de baja).
  await expect(filas.nth(0)).toContainText('15/11/2026 16:30');
  await expect(filas.nth(0)).toContainText('La foto no se ve bien');
  await expect(filas.nth(0)).toContainText('Adoptado');
  await expect(filas.nth(0)).not.toContainText('Dada de baja');
  await expect(filas.nth(1)).toContainText('Dada de baja');
  await expect(page.locator('#ayuda-rechazos')).toBeVisible();

  await page.locator('#buscar-publicaciones').fill('foto');
  await page.locator('#filtro-publicaciones').getByRole('button', { name: 'Buscar' }).click();
  await expect.poll(() => datos.pedidos.some((q) => q.rechazos && q.buscar === 'foto')).toBe(true);
});

test('el perfil del rescatista muestra sus datos, el motivo del rechazo, sus publicaciones y sus rechazos', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/rescatistas/108', (route) => responderJson(route, {
    rescatista: rescatista(108, 'Juan Falso', { estado_validacion: 'RECHAZADO', validado_en: '2026-11-21 18:40:00', motivo_rechazo: 'Datos falsos' }),
  }));
  await page.route(/\/api\/adopciones\/moderacion\?/, (route) => {
    const query = new URL(route.request().url()).searchParams;
    expect(Object.fromEntries(query)).toEqual({ estado: 'TODAS', rescatista_id: '108' });
    return responderJson(route, { publicaciones: [publicacion(5, 'Canela', { estado_moderacion: 'RECHAZADA', adopcion: null })] });
  });
  await page.route(/\/api\/adopciones\/rechazos\?rescatista_id=108$/, (route) => responderJson(route, { rechazos: [
    { id: 9, motivo: 'La foto está borrosa', rechazada_en: '2026-11-19 12:00:00', veterinaria: 'Vet',
      publicacion: { id: 5, titulo: 'Canela', estado_moderacion: 'RECHAZADA', activa: true },
      mascota: { id: 905, nombre: 'Canela', especie: 'GATO' }, rescatista: { id: 108, nombre: 'Juan Falso', organizacion: null } },
  ] }));

  await page.goto('/panel/rescatista.html?id=108');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Juan Falso');
  await expect(page.locator('#validacion')).toHaveText('Rechazada el 21/11/2026 18:40');
  await expect(page.locator('#motivo')).toHaveText('Datos falsos');
  await expect(page.getByRole('link', { name: /Ver su ficha/ })).toHaveAttribute('href', '/panel/cliente.html?id=108');
  await expect(page.locator('#filas-publicaciones').getByRole('link', { name: 'Canela' })).toHaveAttribute('href', '/adopciones/publicacion.html?id=5');
  await expect(page.locator('#filas-rechazos')).toContainText('La foto está borrosa');
  // Ya está decidido: no se lo vuelve a aprobar.
  await expect(page.getByRole('button', { name: 'Aprobar' })).toHaveCount(0);
});

test('desde el perfil se aprueba a un rescatista pendiente', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  let estado = 'PENDIENTE';
  await page.route('**/api/rescatistas/105', (route) => responderJson(route, {
    rescatista: rescatista(105, 'Rescatista Pendiente', estado === 'APROBADO' ? { estado_validacion: 'APROBADO', validado_en: '2026-11-24 10:00:00' } : {}),
  }));
  await page.route('**/api/rescatistas/105/aprobar', (route) => { estado = 'APROBADO'; return responderJson(route, { rescatista: {} }); });
  await page.route(/\/api\/adopciones\/(moderacion|rechazos)\?/, (route) => responderJson(route, { publicaciones: [], rechazos: [] }));

  await page.goto('/panel/rescatista.html?id=105');
  await expect(page.locator('#validacion')).toHaveText('Esperando tu aprobación');
  await expect(page.locator('#estado-publicaciones')).toHaveText('Todavía no publicó ninguna mascota.');
  await page.getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.locator('#validacion')).toHaveText('Aprobada el 24/11/2026 10:00');
  await expect(page.getByRole('button', { name: 'Aprobar' })).toHaveCount(0);
});

test('en el perfil, un animal adoptado no figura como dado de baja', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/rescatistas/104', (route) => responderJson(route, {
    rescatista: rescatista(104, 'Rescatista Aprobada', { estado_validacion: 'APROBADO', validado_en: '2026-06-01 10:00:00' }),
  }));
  await page.route(/\/api\/adopciones\/moderacion\?/, (route) => responderJson(route, { publicaciones: [
    // Kala: aprobada y adoptada (la publicación se cerró con la adopción).
    publicacion(7, 'Kala', { activa: false, adopcion: { id: 7, estado: 'FINALIZADA', postulaciones_pendientes: 0 } }),
    // Toby: la rescatista la sacó antes de que se revisara.
    publicacion(8, 'Toby', { activa: false, estado_moderacion: 'PENDIENTE', adopcion: null }),
  ] }));
  await page.route(/\/api\/adopciones\/rechazos\?/, (route) => responderJson(route, { rechazos: [] }));

  await page.goto('/panel/rescatista.html?id=104');
  const kala = page.locator('#filas-publicaciones tr', { hasText: 'Kala' });
  await expect(kala).toContainText('Aprobada');
  await expect(kala).toContainText('Adoptado');
  await expect(kala).not.toContainText('Dada de baja');
  await expect(page.locator('#filas-publicaciones tr', { hasText: 'Toby' })).toContainText('Dada de baja');
});

test('los filtros de fechas llegan hasta hoy y avisan si se escribe una fecha futura', async ({ page }) => {
  const datos = { aprobadas: [] };
  await simularPanelVet(page, datos);
  await page.goto('/panel/adopciones.html#publicaciones');
  const hoy = diasAtras(0);
  for (const id of ['desde-publicaciones', 'hasta-publicaciones', 'desde-rescatistas', 'hasta-rescatistas', 'desde', 'hasta']) {
    await expect(page.locator('#' + id)).toHaveAttribute('max', hoy);
  }

  await page.locator('#hasta-publicaciones').fill('2099-12-31');
  const antes = datos.pedidos.length;
  await page.locator('#filtro-publicaciones').getByRole('button', { name: 'Buscar' }).click();
  await expect(page.locator('#error-publicaciones')).toHaveText('La fecha no puede ser posterior a hoy.');
  expect(datos.pedidos.length).toBe(antes);

  await page.locator('#hasta-publicaciones').fill(hoy);
  await page.locator('#desde-publicaciones').fill(diasAtras(1));
  await page.locator('#filtro-publicaciones').getByRole('button', { name: 'Buscar' }).click();
  await expect(page.locator('#error-publicaciones')).toHaveText('');
});

test('el perfil de un rescatista que no existe lo avisa', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/rescatistas/999', (route) => responderJson(route, { error: 'Rescatista no encontrado' }, 404));
  await page.goto('/panel/rescatista.html?id=999');
  await expect(page.locator('#estado')).toHaveText('No encontramos ese rescatista.');
});

test('programar el chequeo crea el turno en la agenda y lo asocia a la adopción', async ({ page }) => {
  const datos = { enCurso: [adopcionEnCurso('ADOPTANTE_ELEGIDO')] };
  await simularPanelVet(page, datos);
  let turnoPedido = null;
  let asociado = null;
  await page.route('**/api/pacientes/turnos', (route) => {
    turnoPedido = route.request().postDataJSON();
    return responderJson(route, { turno: { id: 120 } }, 201);
  });
  await page.route('**/api/adopciones/1/chequeo', (route) => {
    asociado = route.request().postDataJSON();
    datos.enCurso = [adopcionEnCurso('CHEQUEO_PENDIENTE', { id: 120, fecha: '2026-11-20', hora: '10:30', estado: 'PROGRAMADO' })];
    return responderJson(route, { adopcion: datos.enCurso[0] });
  });

  await page.goto('/panel/adopciones.html');
  const fila = page.locator('#filas-curso tr', { hasText: 'Pipa' });
  await fila.locator('input[name="fecha"]').fill('2026-11-20');
  await fila.locator('input[name="hora"]').fill('10:30');
  await fila.getByRole('button', { name: 'Programar chequeo' }).click();

  await expect(fila).toContainText('20/11/2026 10:30');
  await expect(fila.getByRole('link', { name: 'Atender en la agenda' })).toBeVisible();
  expect(turnoPedido).toEqual({ mascota_id: 901, fecha: '2026-11-20', hora: '10:30', motivo: 'CHEQUEO_ADOPCION' });
  expect(asociado).toEqual({ turno_id: 120 });
});

test('con el chequeo atendido se completa la adopción y pasa a las finalizadas', async ({ page }) => {
  const datos = { enCurso: [adopcionEnCurso('CHEQUEO_PENDIENTE', { id: 120, fecha: '2026-11-17', hora: '10:30', estado: 'ATENDIDO' })] };
  await simularPanelVet(page, datos);
  let completadas = 0;
  await page.route('**/api/adopciones/1/completar', (route) => {
    completadas += 1;
    datos.finalizadas = [{ ...adopcionEnCurso('FINALIZADA'), fecha_fin: '2026-11-17 11:00:00' }];
    datos.enCurso = [];
    return responderJson(route, { adopcion: datos.finalizadas[0] });
  });

  await page.goto('/panel/adopciones.html');
  await page.getByRole('button', { name: 'Completar adopción' }).click();
  await expect(page.locator('dialog')).toContainText('Pipa pasa a ser de Cliente Dos');
  await page.locator('dialog').getByRole('button', { name: 'Completar adopción' }).click();

  await expect(page.locator('#estado-curso')).toHaveText('No hay adopciones en curso.');
  await page.getByRole('tab', { name: 'Finalizadas' }).click();
  await expect(page.locator('#filas-finalizadas')).toContainText('17/11/2026');
  expect(completadas).toBe(1);
});

test('las finalizadas arrancan en los últimos 30 días, se pasan de página y se ven las canceladas', async ({ page }) => {
  // 25 adoptadas: con 20 por página, son dos páginas.
  const finalizadas = Array.from({ length: 25 }, (_, i) => ({
    ...adopcionEnCurso('FINALIZADA'), id: 100 + i, fecha_fin: '2026-11-17 11:00:00',
    publicacion: publicacion(100 + i, `Gato ${i + 1}`),
  }));
  const canceladas = [{ ...adopcionEnCurso('CANCELADA'), id: 200, adoptante: null, fecha_fin: '2026-11-12 09:00:00', publicacion: publicacion(200, 'Canela') }];
  const datos = { finalizadas, canceladas };
  await simularPanelVet(page, datos);

  await page.goto('/panel/adopciones.html#finalizadas');
  await expect(page.getByRole('tab', { name: 'Finalizadas' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#estado-finalizadas')).toHaveText('25 adopciones finalizadas.');
  await expect(page.locator('#filas-finalizadas tr')).toHaveCount(20);
  // La tabla larga se desplaza dentro de su recuadro: la página no se ensancha (en celular, si se
  // ensanchara, el navegador la achica y los toques caen corridos).
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const pedido = datos.pedidos.find((p) => p.estado === 'FINALIZADA');
  expect(pedido).toMatchObject({ desde: diasAtras(30), hasta: diasAtras(0), por_pagina: '20', pagina: '1' });

  const paginas = page.getByRole('navigation', { name: 'Páginas de las adopciones terminadas' });
  await expect(paginas).toContainText('Página 1 de 2');
  await expect(paginas.getByRole('button', { name: /Anterior/ })).toBeDisabled();
  await paginas.getByRole('button', { name: /Siguiente/ }).click();
  await expect(paginas).toContainText('Página 2 de 2');
  await expect(page.locator('#filas-finalizadas tr')).toHaveCount(5);

  // Cada fila enlaza a su detalle.
  await expect(page.getByRole('link', { name: 'Ver el detalle de la adopción de Gato 25' }))
    .toHaveAttribute('href', '/panel/adopcion.html?id=124');

  // Elegir "Canceladas" filtra en el momento y vuelve a la página 1.
  await page.getByLabel('Resultado').selectOption('CANCELADA');
  await expect(page.locator('#estado-finalizadas')).toHaveText('1 adopción cancelada.');
  await expect(page.locator('#filas-finalizadas')).toContainText('Canela');
  await expect(paginas).toBeHidden();
});

test('la búsqueda de en curso filtra por nombre y avisa si no hay ninguna', async ({ page }) => {
  const datos = { enCurso: [adopcionEnCurso('ADOPTANTE_ELEGIDO'), { ...adopcionEnCurso('CON_POSTULANTES'), id: 2, adoptante: null, publicacion: publicacion(2, 'Rocco') }] };
  await simularPanelVet(page, datos);

  await page.goto('/panel/adopciones.html');
  await expect(page.getByRole('tab', { name: /En curso/ })).toContainText('(2)');
  await page.locator('#buscar-curso').fill('rocco');
  await page.locator('#filtro-curso').getByRole('button', { name: 'Buscar' }).click();
  await expect(page.locator('#filas-curso tr')).toHaveCount(1);
  await expect(page.locator('#filas-curso')).toContainText('Rocco');
  // El número de la pestaña sigue contando todas.
  await expect(page.getByRole('tab', { name: /En curso/ })).toContainText('(2)');

  await page.locator('#buscar-curso').fill('nadie');
  await page.locator('#filtro-curso').getByRole('button', { name: 'Buscar' }).click();
  await expect(page.locator('#estado-curso')).toHaveText('Ninguna adopción en curso coincide con los filtros.');
});

test('el detalle de una adopción finalizada muestra a las personas, el recorrido y las postulaciones', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  const adopcion = {
    ...adopcionEnCurso('FINALIZADA', { id: 120, fecha: '2026-11-17', hora: '10:30', estado: 'ATENDIDO', consulta_id: 7 }),
    fecha_fin: '2026-11-17 11:00:00',
    publicacion: publicacion(1, 'Pipa', {
      rescatista: { id: 104, nombre: 'Rescatista Aprobada', organizacion: 'Patitas al Rescate', email: 'r@prueba.huellavet', telefono: '1155550104' },
    }),
    adoptante: { id: 103, nombre: 'Cliente Dos', telefono: '1155550103', email: 'c2@prueba.huellavet' },
  };
  await page.route('**/api/adopciones/1/detalle', (route) => responderJson(route, {
    adopcion,
    postulaciones: [
      postulacion(1, 'Cliente Dos', { estado: 'ELEGIDA', cliente: { id: 103, nombre: 'Cliente Dos', telefono: '1155550103' } }),
      postulacion(2, 'Cliente Uno', { estado: 'RECHAZADA', fecha: '2026-11-16 09:00:00' }),
    ],
  }));

  await page.goto('/panel/adopcion.html?id=1');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Adopción de Pipa');
  await expect(page).toHaveTitle('Adopción de Pipa | HuellaVet');
  await expect(page.locator('#insignia-estado')).toHaveText('Adoptado');
  await expect(page.getByRole('link', { name: 'c2@prueba.huellavet' })).toHaveAttribute('href', 'mailto:c2@prueba.huellavet');
  await expect(page.locator('#rescatista')).toContainText('Rescatista Aprobada (Patitas al Rescate)');

  const recorrido = page.locator('#recorrido');
  await expect(recorrido).toContainText('2 postulaciones');
  await expect(recorrido).toContainText('Adoptante elegido: Cliente Dos');
  await expect(recorrido).toContainText('Adopción completa: Pipa pasó a ser de Cliente Dos');
  await expect(recorrido).toContainText('17/11/2026, 11:00');
  await expect(page.getByRole('link', { name: 'Ver la consulta del chequeo' })).toHaveAttribute('href', '/panel/consulta.html?id=7');

  await expect(page.locator('#filas-postulaciones tr')).toHaveCount(2);
  await expect(page.locator('#filas-postulaciones')).toContainText('Cancelada por la rescatista');
  await expect(page.getByRole('link', { name: /Volver a las adopciones/ })).toHaveAttribute('href', '/panel/adopciones.html#finalizadas');
});

test('el detalle de una adopción que no existe lo avisa', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/adopciones/99/detalle', (route) => responderJson(route, { error: 'Adopción no encontrada', campos: {} }, 404));

  await page.goto('/panel/adopcion.html?id=99');
  await expect(page.locator('#estado')).toHaveText('No encontramos esa adopción.');
  await expect(page.locator('#detalle')).toBeHidden();
});

test('si Pacientes no responde al completar, el error se ve en la fila y la adopción sigue en curso', async ({ page }) => {
  await simularPanelVet(page, { enCurso: [adopcionEnCurso('CHEQUEO_PENDIENTE', { id: 120, fecha: '2026-11-17', hora: '10:30', estado: 'ATENDIDO' })] });
  await page.route('**/api/adopciones/1/completar', (route) =>
    responderJson(route, { error: 'No se pudo transferir la mascota. Probá de nuevo.', campos: {} }, 502));

  await page.goto('/panel/adopciones.html');
  await page.getByRole('button', { name: 'Completar adopción' }).click();
  await page.locator('dialog').getByRole('button', { name: 'Completar adopción' }).click();
  const fila = page.locator('#filas-curso tr', { hasText: 'Pipa' });
  await expect(fila.locator('.campo-error')).toHaveText('No se pudo transferir la mascota. Probá de nuevo.');
  await expect(fila.getByRole('button', { name: 'Completar adopción' })).toBeEnabled();
});


/* ---------- Del chequeo a completar la adopción ---------- */

test('al finalizar la consulta de un chequeo de adopción aparece "Ir a completar la adopción"', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  const consulta = {
    id: 7, turno_id: 120, mascota_id: 901, motivo: 'CHEQUEO_ADOPCION', estado: 'ABIERTA', diagnostico: 'Sana',
    observaciones: null, valor_base: '0.00', finalizada_en: null, total: '0.00', insumos: [], productos: [],
  };
  await page.route('**/api/pacientes/consultas/7', (route) => responderJson(route, consulta));
  await page.route('**/api/inventario/insumos', (route) => responderJson(route, { datos: [] }));
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: [] }));
  await page.route('**/api/pacientes/consultas/7/finalizar', (route) => responderJson(route, {
    consulta: { ...consulta, estado: 'FINALIZADA' },
    factura: { numero: 'C-000120', estado: 'PENDIENTE_PAGO', total: '0.00' },
  }));
  await simularPanelVet(page, { enCurso: [adopcionEnCurso('CHEQUEO_PENDIENTE', { id: 120, fecha: '2026-11-18', hora: '10:30', estado: 'ATENDIDO' })] });

  await page.goto('/panel/consulta.html?id=7');
  await expect(page.getByRole('link', { name: 'Ir a completar la adopción' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Finalizar consulta' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finalizar' }).click();

  await page.getByRole('link', { name: 'Ir a completar la adopción' }).click();
  await expect(page).toHaveURL(/\/panel\/adopciones\.html#en-curso$/);
  // El enlace abre la pestaña "En curso".
  await expect(page.getByRole('tab', { name: /En curso/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: 'Completar adopción' })).toBeVisible();
});

test('una consulta común no ofrece completar ninguna adopción', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/pacientes/consultas/7', (route) => responderJson(route, {
    id: 7, turno_id: 101, mascota_id: 101, motivo: 'CONSULTA', estado: 'FINALIZADA', diagnostico: 'Otitis',
    observaciones: null, valor_base: '8000.00', finalizada_en: '2026-11-18 10:00:00', total: '8000.00', insumos: [], productos: [],
  }));
  await page.route('**/api/pacientes/consultas/7/factura', (route) => responderJson(route, { factura: { numero: 'C-000101', estado: 'PENDIENTE_PAGO' } }));
  await page.route('**/api/inventario/insumos', (route) => responderJson(route, { datos: [] }));
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: [] }));

  await page.goto('/panel/consulta.html?id=7');
  await expect(page.locator('#factura')).toContainText('C-000101');
  await expect(page.getByRole('link', { name: 'Ir a completar la adopción' })).toHaveCount(0);
});

test('la consulta de un chequeo cuya adopción ya terminó no ofrece completarla', async ({ page }) => {
  // Se llega, por ejemplo, desde "Ver la consulta del chequeo" en el detalle de una adopción finalizada.
  const datos = { enCurso: [] };
  await simularPanelVet(page, datos);
  await page.route('**/api/pacientes/consultas/7', (route) => responderJson(route, {
    id: 7, turno_id: 120, mascota_id: 901, motivo: 'CHEQUEO_ADOPCION', estado: 'FINALIZADA', diagnostico: 'Sana',
    observaciones: null, valor_base: '0.00', finalizada_en: '2026-11-17 10:45:00', total: '0.00', insumos: [], productos: [],
  }));
  await page.route('**/api/pacientes/consultas/7/factura', (route) => responderJson(route, { factura: { numero: 'C-000120', estado: 'PENDIENTE_PAGO' } }));
  await page.route('**/api/inventario/insumos', (route) => responderJson(route, { datos: [] }));
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: [] }));

  await page.goto('/panel/consulta.html?id=7');
  await expect(page.locator('#factura')).toContainText('C-000120');
  // Se preguntó por las adopciones en curso y ninguna tiene este chequeo.
  await expect.poll(() => datos.pedidos.length).toBeGreaterThan(0);
  await expect(page.getByRole('link', { name: 'Ir a completar la adopción' })).toHaveCount(0);
});

test('el cliente cancela su postulación pendiente desde Mis postulaciones (con confirmación)', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route(/\/api\/adopciones\/publicaciones(\?.*)?$/, (route) => responderJson(route, { publicaciones: [publicacion(1, 'Pipa')] }));
  let estado = 'PENDIENTE';
  await page.route('**/api/adopciones/mis-postulaciones', (route) => responderJson(route, { postulaciones: [
    postulacion(7, 'Cliente Dos', { estado }),
    postulacion(8, 'Cliente Dos', { estado: 'ELEGIDA', adopcion: { id: 2, estado: 'ADOPTANTE_ELEGIDO', turno_chequeo: null }, publicacion: { id: 2, titulo: 'Toby', mascota: { id: 902, nombre: 'Toby' } } }),
  ] }));
  const pedidos = [];
  await page.route('**/api/adopciones/postulaciones/7/cancelar', (route) => {
    pedidos.push(route.request().method());
    estado = 'CANCELADA';
    return responderJson(route, { postulacion: postulacion(7, 'Cliente Dos', { estado: 'CANCELADA' }) });
  });

  await page.goto('/adopciones/adopciones.html#seccion-mias');
  const filas = page.locator('#filas-mias > tr');
  await expect(filas.nth(0)).toContainText('Esperando revisión');
  // Solo la pendiente se puede cancelar.
  await expect(filas.nth(1).getByRole('button')).toHaveCount(0);

  // "Volver" en la confirmación no cancela.
  await page.getByRole('button', { name: 'Cancelar mi postulación para adoptar a Pipa' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Volver' }).click();
  expect(pedidos).toEqual([]);

  await page.getByRole('button', { name: 'Cancelar mi postulación para adoptar a Pipa' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar postulación' }).click();
  await expect(filas.nth(0)).toContainText('Cancelada por vos');
  await expect(filas.nth(0)).toContainText('podés volver a postularte');
  await expect(filas.nth(0).getByRole('button')).toHaveCount(0);
  expect(pedidos).toEqual(['POST']);
  // La tarjeta del animal tampoco ofrece postularse.
  await page.getByRole('tab', { name: 'Animales que buscan familia' }).click();
  const pipa = page.locator('.tarjeta-adopcion', { hasText: 'Pipa' });
  await expect(pipa.locator('.tu-postulacion')).toContainText('Cancelada por vos');
  // Y puede volver a postularse (24/11).
  await pipa.getByRole('button', { name: 'Postularme para adoptar a Pipa' }).click();
  await expect(page.locator('#titulo-postulacion')).toHaveText('Postularme para adoptar a Pipa');
});

test('desde la publicación también se cancela, y si la rescatista ya eligió avisa el error', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/adopciones/publicaciones/1', (route) => responderJson(route, { publicacion: publicacion(1, 'Pipa') }));
  await page.route('**/api/adopciones/mis-postulaciones', (route) => responderJson(route, { postulaciones: [postulacion(7, 'Cliente Dos')] }));
  await page.route('**/api/adopciones/postulaciones/7/cancelar', (route) =>
    responderJson(route, { error: 'Solo se puede cancelar una postulación que la rescatista todavía no revisó', campos: {} }, 409));

  await page.goto('/adopciones/publicacion.html?id=1');
  await page.locator('.tu-postulacion').getByRole('button', { name: 'Cancelar postulación' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar postulación' }).click();
  await expect(page.locator('.tu-postulacion .campo-error')).toHaveText('Solo se puede cancelar una postulación que la rescatista todavía no revisó');
});

test('la rescatista y la veterinaria ven quién canceló cada postulación', async ({ page }) => {
  await simularSesion(page, { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO', estado_validacion: null });
  await page.goto('/index.html');
  const textos = await page.evaluate(async () => {
    const { insigniaPostulacion } = await import('/js/etiquetas-adopciones.js');
    const t = (estado, mira) => insigniaPostulacion(estado, { mira }).textContent;
    return [t('CANCELADA', 'rescatista'), t('RECHAZADA', 'rescatista'), t('CANCELADA', 'veterinaria'), t('RECHAZADA', 'veterinaria'), t('CANCELADA', 'postulante'), t('RECHAZADA', 'postulante')];
  });
  expect(textos).toEqual(['Cancelada por el postulante', 'Cancelada por vos', 'Cancelada por el postulante', 'Cancelada por la rescatista', 'Cancelada por vos', 'Cancelada por la rescatista']);
});

test('en la publicación, una postulación cancelada deja volver a postularse si el animal sigue disponible', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/adopciones/publicaciones/1', (route) => responderJson(route, { publicacion: publicacion(1, 'Pipa') }));
  await page.route(/\/api\/adopciones\/publicaciones(\?.*)?$/, (route) => responderJson(route, { publicaciones: [publicacion(1, 'Pipa')] }));
  await page.route('**/api/adopciones/mis-postulaciones', (route) => responderJson(route, { postulaciones: [postulacion(7, 'Cliente Dos', { estado: 'CANCELADA' })] }));

  await page.goto('/adopciones/publicacion.html?id=1');
  await expect(page.locator('.tu-postulacion')).toContainText('Tu postulación: Cancelada por vos');
  await expect(page.locator('.tu-postulacion').getByRole('button')).toHaveCount(0);
  await page.getByRole('link', { name: 'Quiero adoptarlo' }).click();
  await expect(page).toHaveURL(/\/adopciones\/adopciones\.html\?postular=1$/);
  await expect(page.locator('#titulo-postulacion')).toHaveText('Postularme para adoptar a Pipa');
});

test('con el adoptante ya elegido, la rescatista ve "Ver adoptante elegido" con sus datos y lo que contestó', async ({ page }) => {
  await simularSesion(page, RESCATISTA);
  await page.route('**/api/adopciones/mis-publicaciones', (route) => responderJson(route, { publicaciones: [
    publicacion(1, 'Pipa', { adopcion: { id: 1, estado: 'FINALIZADA', postulaciones_pendientes: 0 } }),
    publicacion(2, 'Toby'),
  ] }));
  await page.route('**/api/adopciones/1/postulaciones', (route) => responderJson(route, {
    adopcion: { id: 1, estado: 'FINALIZADA' },
    postulaciones: [
      postulacion(1, 'Cliente de Prueba', { estado: 'RECHAZADA' }),
      postulacion(2, 'Cliente Dos', { estado: 'ELEGIDA', tipo_vivienda: 'Departamento', cliente: { id: 103, nombre: 'Cliente Dos', telefono: '1155550103' } }),
    ],
  }));

  await page.goto('/rescatista/publicaciones.html');
  const pipa = page.locator('article', { hasText: 'Pipa busca familia' });
  await expect(pipa.getByRole('button', { name: /Postulantes/ })).toHaveCount(0);
  await expect(page.locator('article', { hasText: 'Toby busca familia' }).getByRole('button', { name: /Postulantes/ })).toBeVisible();

  await pipa.getByRole('button', { name: 'Ver el adoptante elegido para Pipa' }).click();
  await expect(page.locator('#titulo-postulantes')).toHaveText('Adoptante elegido para Pipa');
  const ficha = page.locator('#adoptante-elegido');
  await expect(ficha).toContainText('Cliente Dos');
  await expect(ficha).toContainText('1155550103');
  await expect(ficha).toContainText('Departamento');
  await expect(ficha).toContainText('Toda la tarde');
  await expect(ficha).toContainText('Adoptado');
  await expect(ficha).not.toContainText('Cliente de Prueba');
  await expect(page.locator('#tabla-postulantes')).toBeHidden();
});

test('el panel de la rescatista tiene las secciones de la portada y la Tienda con sus categorías', async ({ page }) => {
  await simularSesion(page, RESCATISTA);
  await page.goto('/paneles/panel-rescatista.html');
  await expect(page.getByRole('link', { name: 'Reservar turno' })).toBeVisible();
  // En celular la portada oculta la ubicación (como en el panel del cliente): solo se pide que esté.
  await expect(page.getByRole('heading', { name: '¿Dónde nos encontramos?', includeHidden: true })).toBeAttached();
  await expect(page.getByRole('heading', { name: 'Nuestros servicios' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '¿Qué opinan nuestros clientes?' })).toBeVisible();
  await expect(page.locator('#seccion-destacados')).toBeAttached();
  await expect(page.locator('#contacto')).toBeVisible();

  await page.locator('#menu-tienda summary').click();
  await expect(page.locator('#menu-tienda .panel-opciones').getByRole('link'))
    .toHaveText(['Promociones', 'Ver catálogo de productos', 'Medicamentos', 'Alimento balanceado', 'Accesorios', 'Mis compras']);
});
