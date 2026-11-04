// Ayudas para simular la API en las pruebas.
// page.route intercepta los pedidos del navegador a /api/... y los responde con datos de ejemplo,
// con el mismo formato que el contrato de cada módulo.

/** Responde un pedido con un JSON y un código HTTP. */
function responderJson(route, datos, estado = 200) {
  return route.fulfill({
    status: estado,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(datos),
  });
}

/** Sesión simulada: /api/auth/yo devuelve este usuario (o 401 si es null). */
async function simularSesion(page, usuario) {
  await page.route('**/api/auth/yo', (route) =>
    usuario
      ? responderJson(route, { csrf: 'token-de-prueba', ...usuario })
      : responderJson(route, { error: 'No autenticado' }, 401)
  );
}

const PRODUCTOS = [
  { id: 101, nombre: 'Alimento cachorro 3 kg', categoria: 'ALIMENTO', especie: 'PERRO', precio: 15999.9, vencimiento: null, disponible: true },
  { id: 102, nombre: 'Collar reflectivo', categoria: 'ACCESORIO', especie: 'PERRO', precio: 8500, vencimiento: null, disponible: true },
  { id: 103, nombre: 'Antipulgas gatos', categoria: 'MEDICAMENTO', especie: 'GATO', precio: 4500.5, vencimiento: null, disponible: true },
];

module.exports = { responderJson, simularSesion, PRODUCTOS };
