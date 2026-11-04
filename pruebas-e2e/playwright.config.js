// Configuración de Playwright: abre las páginas del Frontend en un Chromium real.
// Las páginas se sirven con http-server desde la carpeta del repo (la de arriba).
// Los pedidos a /api/ no llegan a ningún backend: cada prueba los responde con datos de ejemplo
// (ver ayudas.js), así se prueba el Frontend solo, rápido y sin depender de Render.
const { defineConfig, devices } = require('@playwright/test');

const PUERTO = 4173;

module.exports = defineConfig({
  testDir: './tests',
  timeout: 15_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    trace: 'retain-on-failure',
    locale: 'es-AR',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'celular', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx http-server .. -p ${PUERTO} -c-1 --silent`,
    url: `http://localhost:${PUERTO}/index.html`,
    reuseExistingServer: !process.env.CI,
  },
});
