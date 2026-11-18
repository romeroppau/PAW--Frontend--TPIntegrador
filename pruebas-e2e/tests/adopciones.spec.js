// Adopciones (Entrega 5, rol 3): la página pública con la postulación del cliente, las publicaciones
// del rescatista y el panel de adopciones de la veterinaria. La API se simula (ver ayudas.js) con el
// formato de docs/api/contrato-adopciones.md del repo Adopciones.
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

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
  expect(cuerpos.at(-1)).toEqual({ tipo_vivienda: 'Casa con patio', otras_mascotas: 'Ninguna', tiempo_disponible: 'Toda la tarde' });
  expect(await page.evaluate(() => window.sinRecargar)).toBe(true);
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
  await page.locator('#adopcion').getByRole('link', { name: 'Mis postulaciones' }).click();
  await expect(page).toHaveURL(/\/adopciones\/adopciones\.html#seccion-mias$/);
  await expect(page.locator('#filas-mias tr')).toContainText(['Pipa']);
  await expect(page.locator('#seccion-mias')).toBeInViewport();
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
  await expect(page.locator('#filas-postulantes')).toContainText('Rechazada');
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
async function simularPanelVet(page, datos) {
  await simularSesion(page, VETERINARIO);
  await page.route('**/api/rescatistas', (route) => responderJson(route, { rescatistas: datos.rescatistas ?? [] }));
  await page.route('**/api/adopciones/moderacion', (route) => responderJson(route, { publicaciones: datos.moderacion ?? [] }));
  await page.route(/\/api\/adopciones(\?.*)?$/, (route) => {
    const estado = new URL(route.request().url()).searchParams.get('estado');
    return responderJson(route, { adopciones: estado === 'FINALIZADA' ? (datos.finalizadas ?? []) : (datos.enCurso ?? []) });
  });
}

function adopcionEnCurso(estado, turno = null) {
  return {
    id: 1, estado, fecha_inicio: '2026-11-10 10:00:00', fecha_fin: null,
    publicacion: publicacion(1, 'Pipa'),
    adoptante: { id: 103, nombre: 'Cliente Dos', telefono: '1155550103' },
    turno_chequeo: turno,
  };
}

test('la veterinaria aprueba un rescatista y rechaza una publicación con su motivo', async ({ page }) => {
  const datos = {
    rescatistas: [{ id: 105, nombre: 'Rescatista Pendiente', email: 'r2@prueba.huellavet', telefono: '1155550105', organizacion: 'Patitas al Rescate', estado_validacion: 'PENDIENTE' }],
    moderacion: [publicacion(2, 'Rocco', { estado_moderacion: 'PENDIENTE', adopcion: null })],
  };
  await simularPanelVet(page, datos);
  const pedidos = [];
  await page.route('**/api/rescatistas/105/aprobar', (route) => {
    pedidos.push('aprobar 105');
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
  await page.locator('#filas-rescatistas').getByRole('button', { name: 'Aprobar' }).click();
  await expect(page.locator('#estado-rescatistas')).toHaveText('No hay rescatistas esperando la aprobación.');

  const tarjeta = page.locator('.tarjeta-adopcion', { hasText: 'Rocco' });
  await tarjeta.getByRole('button', { name: 'Rechazar' }).click();
  await expect(tarjeta.locator('.campo-error')).toHaveText('El motivo es obligatorio');
  await tarjeta.getByLabel('Motivo del rechazo').fill('La foto no se ve bien');
  await tarjeta.getByRole('button', { name: 'Rechazar' }).click();
  await expect(page.locator('#estado-moderacion')).toHaveText('No hay publicaciones por revisar.');
  expect(pedidos).toEqual(['aprobar 105', 'rechazar 2: La foto no se ve bien']);
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
  await expect(page.locator('#filas-finalizadas')).toContainText('17/11/2026');
  expect(completadas).toBe(1);
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
  // En celular la tabla se desplaza de costado: alcanza con que la sección quede a la vista.
  await expect(page.locator('#titulo-curso')).toBeInViewport();
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
