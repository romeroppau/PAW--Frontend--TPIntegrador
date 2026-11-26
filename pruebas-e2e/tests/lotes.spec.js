// 26/11: lotes de productos e insumos (migraciones 028 y 029 de Inventario). Cada producto o insumo
// dice si vence; si vence, tiene lotes (L1, L2, L3…, con el número del fabricante si tiene), cada uno
// con su vencimiento y su stock; se vende y se usa primero el que vence antes, y una promoción es de un lote.
//   - Productos e insumos: "Lotes" muestra los lotes, retira de un lote y carga en uno que ya existe o
//     en uno nuevo, con un aviso de lo que se hizo y los errores con el estilo del sitio.
//   - El alta y la edición: "¿Vence?" (se cambia solo sin stock) y el primer lote.
//   - Carrito: el descuento vale para las unidades que le quedan al lote; las demás, a precio normal.
//   - Compra y factura: lo que fue con descuento va en su propia línea.
//   - Reportes: "Qué liquidar" es por lote, "Publicitar" manda el lote y se avisan los lotes vencidos.
// La API se simula con el formato de docs/api/contrato.md, contrato-insumos.md y contrato-tienda.md
// (Inventario) y contrato-reportes.md (Reportes).
const { test, expect } = require('@playwright/test');
const { responderJson, simularSesion } = require('./ayudas');

const VETERINARIO = { id: 101, nombre: 'Vet', email: 'v@prueba.huellavet', rol: 'VETERINARIO', estado_validacion: null };
const CLIENTE = { id: 102, nombre: 'Cliente de Prueba', email: 'c@prueba.huellavet', rol: 'CLIENTE' };

const lote = (id, numero, codigo, vencimiento, stock, vencido = false) =>
  ({ id, numero, nombre: `L${numero}${codigo ? ` (${codigo})` : ''}`, codigo, vencimiento, stock, vencido });

const PIPETA = {
  id: 107, nombre: 'Pipeta antipulgas', categoria: 'MEDICAMENTO', especie: 'GATO', precio: 6500, stock: 21, stock_vendible: 18,
  vencimiento: '2026-12-16', vence: true, activo: true,
  lotes: [lote(30, 1, 'FL-1011', '2026-11-01', 3, true), lote(31, 2, 'FL-2612', '2026-12-16', 8), lote(32, 3, null, '2027-06-14', 10)],
};
const COLLAR = { id: 110, nombre: 'Collar de nylon', categoria: 'ACCESORIO', especie: 'PERRO', precio: 5200, stock: 22, stock_vendible: 22,
  vencimiento: null, vence: false, activo: true, lotes: [lote(40, 1, null, null, 22)] };

const VACUNA = { id: 104, nombre: 'Vacuna séxtuple', aplicacion: 'SEXTUPLE', stock: 25, costo: 6500, estado: 'DISPONIBLE', stock_bajo: false,
  activo: true, vence: true, stock_sin_vencer: 25, vencimiento: '2027-04-25', lotes: [lote(50, 1, null, '2027-04-25', 25)] };
const GUANTES = { id: 102, nombre: 'Guantes de látex', aplicacion: null, stock: 150, costo: 220, estado: 'DISPONIBLE', stock_bajo: false,
  activo: true, vence: false, stock_sin_vencer: 150, vencimiento: null, lotes: [lote(51, 1, null, null, 150)] };

// La lista de productos y las cargas y retiros: cada pedido se guarda y se responde con `respuesta`.
async function simularProductos(page, respuesta = () => ({ id: 107, stock: 20 })) {
  await simularSesion(page, VETERINARIO);
  const pedidos = [];
  await page.route('**/api/inventario/productos', (route) => responderJson(route, { datos: [PIPETA, COLLAR], limite_stock_bajo: 10 }));
  await page.route(/\/api\/inventario\/productos\/\d+\/(stock|retiro)$/, (route) => {
    const pedido = { url: new URL(route.request().url()).pathname, cuerpo: route.request().postDataJSON() };
    pedidos.push(pedido);
    return responderJson(route, respuesta(pedido));
  });
  return pedidos;
}

test('productos: el stock dice cuánto está vencido y "Lotes" muestra cada lote (L1, L2…), el que vence primero arriba', async ({ page }) => {
  await simularProductos(page);
  await page.goto('/panel/productos.html');

  const fila = page.locator('#filas > tr').first();
  await expect(fila.locator('td').nth(3)).toHaveText('2118 sin vencer');
  await expect(fila.locator('td').nth(4)).toContainText('16/12/2026');
  await expect(fila.locator('td').nth(4)).toContainText('3 vencidas: retiralas');
  // Lo que no vence no muestra lotes, y lo dice.
  await expect(page.getByRole('button', { name: 'Ver los lotes de Collar de nylon' })).toHaveCount(0);
  await expect(page.locator('#filas > tr').nth(1).locator('td').nth(4)).toHaveText('No vence');

  const boton = page.getByRole('button', { name: 'Ver los lotes de Pipeta antipulgas' });
  await expect(boton).toHaveText('Lotes (3)');
  await boton.click();
  await expect(boton).toHaveAttribute('aria-expanded', 'true');
  const lotes = page.locator('#lotes-producto-107 .tabla-lotes tbody tr');
  await expect(lotes).toHaveCount(3);
  await expect(lotes.nth(0)).toContainText('L1 (FL-1011)');
  await expect(lotes.nth(0)).toContainText('Vencido: no se vende');
  await expect(lotes.nth(2).locator('th')).toHaveText('L3');
  // Para cargar solo se ofrecen los lotes sin vencer y "Lote nuevo".
  await expect(page.locator('#lote-producto-107 option')).toHaveText([
    'L2 (FL-2612), que vence el 16/12/2026: hay 8', 'L3, que vence el 14/06/2027: hay 10', 'Lote nuevo',
  ]);

  await boton.click();
  await expect(page.locator('#lotes-producto-107')).toHaveCount(0);
  await expect(page.locator('#filas > tr')).toHaveCount(2);
});

test('productos: cargar en un lote avisa qué se hizo, deja abiertos los lotes y resalta el lote', async ({ page }) => {
  const pedidos = await simularProductos(page, (p) => (p.url.endsWith('/retiro')
    ? { id: 107, stock: 18 }
    : p.cuerpo.lote
      ? { id: 107, stock: 33, lote: lote(33, 4, 'FL-0328', '2028-03-31', 12) }
      : { id: 107, stock: 25, lote: lote(31, 2, 'FL-2612', '2026-12-16', 12) }));
  await page.goto('/panel/productos.html');

  // "Cargar" en la fila de un producto que vence abre los lotes con la cantidad escrita (no carga sin lote).
  await page.getByLabel('Cantidad de Pipeta antipulgas').fill('5');
  await page.getByRole('button', { name: 'Cargar stock de Pipeta antipulgas' }).click();
  await expect(page.locator('#cantidad-lote-producto-107')).toHaveValue('5');
  await expect(page.locator('#cantidad-lote-producto-107')).toBeFocused();
  expect(pedidos).toEqual([]);

  // Cargar en un lote que ya existe: el aviso queda en los lotes de ese producto, con el lote resaltado.
  await page.locator('#cantidad-lote-producto-107').fill('4');
  await page.locator('#lote-producto-107').selectOption('31');
  await expect(page.locator('#codigo-lote-producto-107')).toBeHidden();
  await page.getByRole('button', { name: 'Cargar stock en un lote de Pipeta antipulgas' }).click();
  const aviso = page.locator('#lotes-producto-107 .mensaje-ok');
  await expect(aviso).toHaveText('Se cargaron 4 unidades en el lote L2 (FL-2612), que vence el 16/12/2026. Ahora el lote tiene 12. Pipeta antipulgas tiene 25 en total.');
  await expect(aviso).toBeFocused();
  await expect(page.locator('#lotes-producto-107 .lote-resaltado th')).toHaveText('L2 (FL-2612)');

  // En uno nuevo, con vencimiento y el número del fabricante.
  await page.locator('#cantidad-lote-producto-107').fill('12');
  await page.locator('#lote-producto-107').selectOption('nuevo');
  await page.getByLabel('Vence el').fill('2028-03-31');
  await page.getByLabel('Número de lote del fabricante (opcional)').fill('FL-0328');
  await page.getByRole('button', { name: 'Cargar stock en un lote de Pipeta antipulgas' }).click();
  await expect(page.locator('#lotes-producto-107 .mensaje-ok')).toHaveText('Se creó el lote L4 (FL-0328), que vence el 31/03/2028, con 12 unidades. Pipeta antipulgas tiene 33 en total.');

  // Retirar las vencidas de su lote.
  await page.getByLabel('Cantidad a retirar del lote L1 (FL-1011)').fill('3');
  await page.getByRole('button', { name: 'Retirar del lote L1 (FL-1011) de Pipeta antipulgas' }).click();
  await expect(page.locator('#lotes-producto-107 .mensaje-ok')).toHaveText('Se retiraron 3 unidades del lote L1 (FL-1011). Quedan 0 en el lote y 18 en total.');

  expect(pedidos).toEqual([
    { url: '/api/inventario/productos/107/stock', cuerpo: { cantidad: 4, lote_id: 31 } },
    { url: '/api/inventario/productos/107/stock', cuerpo: { cantidad: 12, lote: { codigo: 'FL-0328', vencimiento: '2028-03-31' } } },
    { url: '/api/inventario/productos/107/retiro', cuerpo: { cantidad: 3, lote_id: 30 } },
  ]);
});

test('productos: los errores de la cantidad y del vencimiento se ven con el estilo del sitio, sin mandar nada', async ({ page }) => {
  const pedidos = await simularProductos(page);
  await page.goto('/panel/productos.html');
  await page.getByRole('button', { name: 'Ver los lotes de Pipeta antipulgas' }).click();
  const error = page.locator('#lotes-producto-107 .lotes > .campo-error');

  // Los formularios no usan la validación del navegador (novalidate).
  await expect(page.locator('#lotes-producto-107 form.form-lote')).toHaveAttribute('novalidate', '');
  await page.locator('#cantidad-lote-producto-107').fill('0');
  await page.getByRole('button', { name: 'Cargar stock en un lote de Pipeta antipulgas' }).click();
  await expect(error).toHaveText('La cantidad tiene que ser un número entero mayor o igual a 1.');
  await expect(page.locator('#cantidad-lote-producto-107')).toHaveAttribute('aria-invalid', 'true');

  await page.locator('#cantidad-lote-producto-107').fill('2');
  await page.locator('#lote-producto-107').selectOption('nuevo');
  await page.getByRole('button', { name: 'Cargar stock en un lote de Pipeta antipulgas' }).click();
  await expect(error).toHaveText('Poné la fecha de vencimiento del lote nuevo.');

  await page.getByLabel('Cantidad a retirar del lote L1 (FL-1011)').fill('5');
  await page.getByRole('button', { name: 'Retirar del lote L1 (FL-1011) de Pipeta antipulgas' }).click();
  await expect(error).toHaveText('El lote tiene 3 unidades: no se puede retirar más.');

  // En la fila: la cantidad vacía tampoco usa el globo del navegador.
  await page.getByRole('button', { name: 'Retirar unidades de Collar de nylon' }).click();
  await expect(page.locator('#estado')).toHaveText('Collar de nylon: Escribí la cantidad.');
  await expect(page.locator('#estado')).toHaveClass(/mensaje-error/);
  expect(pedidos).toEqual([]);
});

test('productos: lo que no vence carga el stock en la fila, sin elegir lote, y avisa cuánto tiene', async ({ page }) => {
  const pedidos = await simularProductos(page);
  await page.goto('/panel/productos.html');
  await page.getByLabel('Cantidad de Collar de nylon').fill('6');
  await page.getByRole('button', { name: 'Cargar stock de Collar de nylon' }).click();
  await expect.poll(() => pedidos).toEqual([{ url: '/api/inventario/productos/110/stock', cuerpo: { cantidad: 6 } }]);
  await expect(page.locator('#estado')).toHaveText('Collar de nylon: se cargaron 6 unidades. Ahora tiene 20.');
  await expect(page.locator('#estado')).toHaveClass(/mensaje-ok/);
});

test('el formulario: "¿Vence?" decide si se pide el vencimiento del primer lote; con stock no se cambia', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  const cuerpos = [];
  await page.route('**/api/inventario/productos', (route) => {
    cuerpos.push(route.request().postDataJSON());
    return responderJson(route, { id: 120 }, 201);
  });
  await page.route('**/api/inventario/productos/107', (route) => responderJson(route, { ...PIPETA, descripcion: null }));

  await page.goto('/panel/producto-form.html');
  await expect(page.locator('#campo-vencimiento')).toBeHidden();
  await page.getByLabel('Nombre').fill('Pipeta nueva');
  // Un medicamento propone que vence: aparecen el vencimiento y el número del fabricante.
  await page.getByLabel('Categoría').selectOption('MEDICAMENTO');
  await expect(page.getByLabel('¿Vence?')).toHaveValue('si');
  await page.getByLabel('Especie').selectOption('GATO');
  await page.getByLabel('Precio').fill('7000');
  await page.getByLabel('Stock inicial').fill('10');
  await page.getByLabel('Vencimiento del primer lote (L1)').fill('2027-05-31');
  await page.getByLabel('Número de lote del fabricante (opcional)').fill(' FL-0531 ');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => cuerpos.length).toBe(1);
  expect(cuerpos[0]).toMatchObject({ stock: 10, vence: true, vencimiento: '2027-05-31', lote: 'FL-0531' });

  // Un accesorio propone que no vence: sin vencimiento ni número.
  await page.goto('/panel/producto-form.html');
  await page.getByLabel('Nombre').fill('Correa');
  await page.getByLabel('Categoría').selectOption('ACCESORIO');
  await expect(page.getByLabel('¿Vence?')).toHaveValue('no');
  await expect(page.locator('#campo-vencimiento')).toBeHidden();
  await page.getByLabel('Especie').selectOption('PERRO');
  await page.getByLabel('Precio').fill('3000');
  await page.getByLabel('Stock inicial').fill('4');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => cuerpos.length).toBe(2);
  expect(cuerpos[1]).toMatchObject({ stock: 4, vence: false, vencimiento: null, lote: null });

  // La edición: sin vencimiento ni lote; con stock, "¿Vence?" no se cambia.
  await page.goto('/panel/producto-form.html?id=107');
  await expect(page.getByLabel('Nombre')).toHaveValue('Pipeta antipulgas');
  await expect(page.locator('#campo-vencimiento')).toBeHidden();
  await expect(page.locator('#campo-lote')).toBeHidden();
  await expect(page.getByLabel('¿Vence?')).toHaveValue('si');
  await expect(page.getByLabel('¿Vence?')).toBeDisabled();
  await expect(page.locator('#ayuda-vence')).toHaveText('Se puede cambiar solo sin stock: tiene 21. Retirá o vendé esas unidades primero.');
});

test('insumos: los que vencen tienen lotes como los productos; cargar en un lote nuevo avisa qué se hizo', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  const pedidos = [];
  await page.route('**/api/inventario/insumos', (route) => responderJson(route, { datos: [GUANTES, VACUNA], limite_stock_bajo: 10 }));
  await page.route(/\/api\/inventario\/insumos\/\d+\/(stock|retiro)$/, (route) => {
    pedidos.push({ url: new URL(route.request().url()).pathname, cuerpo: route.request().postDataJSON() });
    return responderJson(route, route.request().url().includes('/104/')
      ? { id: 104, stock: 29, estado: 'DISPONIBLE', stock_bajo: false, stock_sin_vencer: 29, vencimiento: '2027-04-25', lote: lote(52, 2, 'VS-0911', '2028-01-31', 4) }
      : { id: 102, stock: 155, estado: 'DISPONIBLE', stock_bajo: false, stock_sin_vencer: 155, vencimiento: null });
  });
  await page.goto('/panel/insumos.html');

  // La columna del vencimiento: la próxima fecha o "No vence".
  const vacuna = page.locator('#filas > tr').nth(1);
  await expect(vacuna.locator('td').nth(2)).toHaveText('25/04/2027');
  await expect(page.locator('#filas > tr').first().locator('td').nth(2)).toHaveText('No vence');
  await expect(page.getByRole('button', { name: 'Ver los lotes de Guantes de látex' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Ver los lotes de Vacuna séxtuple' }).click();
  await expect(page.locator('#lotes-insumo-104 .tabla-lotes caption')).toHaveText('Lotes de Vacuna séxtuple (se usa primero el que vence antes)');
  await page.locator('#cantidad-lote-insumo-104').fill('4');
  await page.locator('#lote-insumo-104').selectOption('nuevo');
  await page.locator('#vence-lote-insumo-104').fill('2028-01-31');
  await page.locator('#codigo-lote-insumo-104').fill('VS-0911');
  await page.getByRole('button', { name: 'Cargar stock en un lote de Vacuna séxtuple' }).click();
  await expect(page.locator('#lotes-insumo-104 .mensaje-ok')).toHaveText('Se creó el lote L2 (VS-0911), que vence el 31/01/2028, con 4 unidades. Vacuna séxtuple tiene 29 en total.');

  // Lo que no vence se carga en la fila, con un aviso arriba de la tabla.
  await page.getByLabel('Cantidad de Guantes de látex').fill('5');
  await page.getByRole('button', { name: 'Cargar stock de Guantes de látex' }).click();
  await expect(page.locator('#estado')).toHaveText('Guantes de látex: se cargaron 5 unidades. Ahora tiene 155.');

  expect(pedidos).toEqual([
    { url: '/api/inventario/insumos/104/stock', cuerpo: { cantidad: 4, lote: { codigo: 'VS-0911', vencimiento: '2028-01-31' } } },
    { url: '/api/inventario/insumos/102/stock', cuerpo: { cantidad: 5 } },
  ]);
});

test('el formulario de insumo: "¿Vence?" y el primer lote en el alta', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  const cuerpos = [];
  await page.route('**/api/inventario/insumos', (route) => {
    cuerpos.push(route.request().postDataJSON());
    return responderJson(route, { id: 130 }, 201);
  });
  await page.goto('/panel/insumo-form.html');
  await expect(page.locator('#campo-vencimiento')).toBeHidden();
  await page.getByLabel('Nombre').fill('Gasa estéril');
  await page.getByLabel('Costo (en pesos)').fill('180');
  await page.getByLabel('Stock inicial').fill('100');
  await page.getByLabel('¿Vence?').selectOption('si');
  await page.getByLabel('Vencimiento del primer lote (L1)').fill('2028-04-09');
  await page.getByRole('button', { name: 'Guardar' }).click();
  await expect.poll(() => cuerpos.length).toBe(1);
  expect(cuerpos[0]).toMatchObject({ nombre: 'Gasa estéril', stock: 100, vence: true, vencimiento: '2028-04-09', lote: null });
});

test('carrito: la promoción es de un lote; si lleva más de las que quedan, las demás van a precio normal', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route('**/api/tienda/carrito', (route) => responderJson(route, {
    items: [{
      producto_id: 107, nombre: 'Pipeta antipulgas', precio_unitario: 5200, precio_sin_descuento: 6500, descuento: 20,
      promocion_quedan: 3, cantidad_promocion: 3, cantidad: 5, subtotal: 28600, stock: 18, a_la_venta: true, tiene_imagen: false,
    }],
    total: 28600, minutos_para_pagar: 15, dias_habiles_para_retirar: 5, retirar_hasta_si_compra_hoy: '2026-12-03',
  }));
  await page.goto('/tienda/carrito.html');

  await expect(page.locator('.item-carrito')).toContainText('3 con 20 % off (las que quedan en promoción) y 2 a $ 6.500,00.');
  await expect(page.locator('.item-subtotal')).toHaveText('$ 28.600,00');
});

test('catálogo: la promoción dice hasta cuándo o hasta agotar las unidades del lote', async ({ page }) => {
  await simularSesion(page, null);
  await page.route('**/api/tienda/promociones', (route) => responderJson(route, { datos: [
    { id: 107, nombre: 'Pipeta antipulgas', categoria: 'MEDICAMENTO', especie: 'GATO', precio: 6500, vencimiento: '2026-12-16', disponible: true,
      promocion: { porcentaje: 20, precio: 5200, hasta: '2026-12-10', quedan: 8 } },
  ] }));
  await page.goto('/catalogo/promociones.html');
  await expect(page.locator('.tarjeta-producto .precio')).toContainText('Promoción hasta el 10/12/2026 o hasta agotar las 8 unidades');
});

test('compra: lo que fue con descuento va en su propia línea', async ({ page }) => {
  await simularSesion(page, CLIENTE);
  await page.route(/\/api\/tienda\/compras\/V-000210$/, (route) => responderJson(route, {
    numero: 'V-000210', estado: 'PAGADA', fecha: '2026-11-26 10:30:00', total: 28600, pagar_antes_de: null, segundos_para_pagar: null,
    retirar_hasta: '2026-12-03', dias_habiles_para_retirar: 5, tiene_factura: true, motivo_cancelacion: null, politica_reintegro: null, reintegro: null,
    entregada_en: null, operacion_mp: '123',
    items: [
      { producto_id: 107, nombre: 'Pipeta antipulgas', precio_unitario: 5200, cantidad: 3, subtotal: 15600, en_promocion: true },
      { producto_id: 107, nombre: 'Pipeta antipulgas', precio_unitario: 6500, cantidad: 2, subtotal: 13000, en_promocion: false },
    ],
  }));
  await page.goto('/tienda/compra.html?numero=V-000210');
  const filas = page.locator('#filas tr');
  await expect(filas).toHaveCount(2);
  await expect(filas.nth(0)).toContainText('Pipeta antipulgas (con descuento)');
  await expect(filas.nth(1).locator('td').first()).toHaveText('Pipeta antipulgas');
});

test('reportes: "Qué liquidar" es por lote, "Publicitar" manda el lote y se avisan los lotes vencidos (también de insumos)', async ({ page }) => {
  await simularSesion(page, VETERINARIO);
  const d = new Date();
  d.setDate(d.getDate() + 12);
  const vence = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.route('**/api/reportes/sugerencias', (route) => responderJson(route, {
    fecha_referencia: '2026-11-26',
    que_promocionar: { franja_sugerida: null, franjas: [] },
    que_liquidar: [
      { producto_id: 107, nombre: 'Pipeta antipulgas', lote_id: 31, lote: 'L2 (FL-2612)', fecha_vencimiento: vence, dias_restantes: 12,
        stock: 8, precio: 6500, descuento_sugerido: 15, precio_sugerido: 5525, sugerencia: '' },
    ],
    lotes_vencidos: [
      { tipo: 'producto', producto_id: 107, nombre: 'Pipeta antipulgas', lote_id: 30, lote: 'L1 (FL-1011)', fecha_vencimiento: '2026-11-01', stock: 3,
        sugerencia: 'Pipeta antipulgas, lote L1 (FL-1011): venció el 01/11/2026 y quedan 3. Ya no se vende: retiralo del stock.' },
      { tipo: 'insumo', insumo_id: 104, nombre: 'Vacuna séxtuple', lote_id: 50, lote: 'L1', fecha_vencimiento: '2026-11-20', stock: 2,
        sugerencia: 'Vacuna séxtuple, lote L1: venció el 20/11/2026 y quedan 2. Ya no se usa en las consultas: retiralo del stock.' },
    ],
  }));
  await page.route('**/api/pacientes/promociones-turnos', (route) => responderJson(route, { datos: [] }));
  const pedidos = [];
  await page.route('**/api/inventario/promociones', (route) => {
    if (route.request().method() === 'GET') return responderJson(route, { datos: [] });
    pedidos.push(route.request().postDataJSON());
    return responderJson(route, { id: 5, porcentaje: 15, hasta: vence }, 201);
  });

  await page.goto('/panel/reportes.html#liquidar');
  await expect(page.locator('#caja-vencidos')).toContainText('Pipeta antipulgas, lote L1 (FL-1011): venció el 01/11/2026 y quedan 3.');
  await expect(page.getByRole('link', { name: 'Ir a Insumos para retirar Vacuna séxtuple' })).toHaveAttribute('href', '/panel/insumos.html');
  await expect(page.getByRole('link', { name: 'Ir a Productos para retirar Pipeta antipulgas' })).toHaveAttribute('href', '/panel/productos.html');
  await expect(page.locator('#filas-liquidar tr').first()).toContainText('Lote L2 (FL-2612)');

  await page.getByRole('button', { name: 'Publicitar Pipeta antipulgas (lote L2 (FL-2612))' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Publicitar' });
  await expect(dialogo).toContainText('Pipeta antipulgas, lote L2 (FL-2612): $6.500,00, quedan 8.');
  await dialogo.getByRole('button', { name: 'Publicitar' }).click();
  await expect.poll(() => pedidos).toEqual([{ producto_id: 107, lote_id: 31, porcentaje: 15, hasta: vence }]);
});
