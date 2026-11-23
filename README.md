# HuellaVet — Frontend

Interfaz web de **HuellaVet**, la aplicación de gestión integral de una veterinaria: sitio público, tienda, adopciones y los paneles de cada rol (cliente, rescatista y veterinaria).

Trabajo Práctico Integrador de **Programación en Ambiente Web (PAW)** — UNLu, 2026 — Grupo **La 25**.

Este repositorio tiene solo el **frontend**. Consume la API JSON de los demás módulos (ver [Repositorios del proyecto](#repositorios-del-proyecto)).

| Entorno | URL |
| --- | --- |
| Producción | https://huellavet-frontend.vercel.app |
| Desarrollo | https://huellavet-la25-dev.vercel.app |

## Autores

| Integrante | Legajo |
| --- | --- |
| Ana Paula Romero | 195388 |
| Maria Trinidad Lopez | 197958 |
| Valentino Aimale | 197961 |
| Cristian Tomás Anito | 158887 |

---

## Qué tiene

### Sitio público (sin sesión)

| Pantalla | Qué muestra |
| --- | --- |
| `index.html` | Portada: servicios, horario de atención, promociones de la tienda y de turnos, adopciones, reseñas y contacto por WhatsApp |
| `catalogo/catalogo.html`, `catalogo/producto.html` | Catálogo con buscador en vivo, filtros por categoría y especie, y detalle del producto |
| `adopciones/adopciones.html` | Animales en adopción, con búsqueda y filtros |
| `resenas/resenas.html` | Reseñas de los clientes y las respuestas de la veterinaria |
| `login/`, `registros/` | Ingreso y registro de cliente o rescatista, con verificación del WhatsApp por código |

### Cliente

| Pantalla | Qué hace |
| --- | --- |
| `paneles/panel-cliente.html` | **Mi panel**: accesos a todo lo del cliente y las secciones de la portada |
| `cliente/mascotas.html`, `cliente/mascota.html` | Sus mascotas: alta, edición, foto y ficha |
| `cliente/historial.html`, `cliente/calendario.html` | Historia clínica y calendario sanitario de cada mascota |
| `cliente/turnos.html` | Turnos próximos y anteriores, con filtros (incluye los turnos de chequeo de adopción) |
| `cliente/factura.html` | Factura de una consulta |
| `cliente/descuentos.html` | Turnos con descuento (franjas promocionadas) |
| `tienda/carrito.html`, `tienda/compra.html`, `tienda/compras.html`, `tienda/factura.html` | Carrito, pago con Mercado Pago, mis compras, cancelación y factura |
| `adopciones/adopciones.html` | Postularse para adoptar y ver **mis postulaciones** con el estado de cada una |
| `resenas/escribir.html` | Escribir una reseña |
| `cuenta/mis-datos.html`, `cuenta/notificaciones.html` | Mis datos (con cambio de WhatsApp verificado) e historial de avisos |

### Rescatista

| Pantalla | Qué hace |
| --- | --- |
| `paneles/panel-rescatista.html` | **Mi panel** del rescatista (queda pendiente hasta que la veterinaria lo aprueba) |
| `rescatista/publicaciones.html` | Publicar animales con foto, ver el estado de la moderación, revisar postulantes, elegir al adoptante y seguir la adopción |

### Veterinaria

| Pantalla | Qué hace |
| --- | --- |
| `paneles/panel-administrador.html` | **Mi panel** de la veterinaria, con menús desplegables por tema |
| `panel/agenda.html`, `panel/consulta.html` | Agenda del día, carga y reprogramación de turnos, atención de la consulta y factura |
| `panel/clientes.html`, `panel/cliente.html` | Clientes, rescatistas a aprobar y la ficha de cada cliente con sus mascotas |
| `panel/productos.html`, `panel/producto-form.html`, `panel/movimientos.html` | ABM de productos, stock y movimientos |
| `panel/insumos.html`, `panel/insumo-form.html`, `panel/insumo-movimientos.html` | Insumos internos, retiro manual, "ya pedido" y movimientos |
| `panel/ventas.html` | Ventas de la tienda y entregas |
| `panel/adopciones.html`, `panel/adopcion.html` | Moderación de publicaciones (las pendientes primero), seguimiento, turno de chequeo y cierre de la adopción |
| `panel/reportes.html` | Reportes de ventas, turnos y stock, y las sugerencias del motor (qué promocionar y qué liquidar) |
| `panel/configuracion.html` | Horario, plazos de la tienda, reintegros, días de aviso y stock bajo |

### En todas las páginas con sesión

- La barra **Mi panel** con los accesos del rol (`js/barra-rol.js`).
- La **campana de notificaciones** (`js/notificaciones.js`): consulta los avisos nuevos cada 10 segundos sin recargar la página y permite marcarlos como leídos.

---

## Tecnologías

- **HTML5, CSS3 y JavaScript** sin frameworks ni librerías (lo pide la materia). Los scripts usan módulos ES (`import` / `export`).
- **Vercel** publica el sitio con HTTPS y reenvía `/api/` al backend en Render.
- **Playwright** para las pruebas de punta a punta (solo en `pruebas-e2e/`, no forma parte del sitio).
- Tipografías Fraunces y Nunito Sans, desde Google Fonts.

---

## Cómo funciona

```
Navegador ──> Vercel (HTML/CSS/JS) ──/api/…──> Render (Nginx → módulos PHP) ──> MySQL (Aiven)
```

- Las páginas piden los datos con `fetch` y reciben **JSON**.
- `vercel.json` reenvía todo lo que empieza con `/api/` al ApiGateway: el sitio de desarrollo al servicio de dev y el de producción al de producción. Para el navegador es **un solo dominio**: por eso la cookie de sesión `SameSite=Strict` funciona y no hace falta CORS.
- El frontend **solo presenta**. La validación definitiva y el control de roles los hace el backend.

### Componentes comunes

| Archivo | Qué hace |
| --- | --- |
| `js/api.js` | Única puerta de salida hacia la API. Envía la cookie, agrega `X-CSRF-Token` en los pedidos que no son `GET`, corta a los 15 s y reintenta una vez solo los `GET` |
| `js/auth.js` | Consulta `GET /api/auth/yo`, guarda el token CSRF, arma el encabezado según la sesión y exporta `exigirRol(rol)` |
| `js/guardia-panel.js` | Protege cada panel según el `data-rol` del `<body>` |
| `js/barra-rol.js`, `js/menu.js`, `js/layout.js` | Barra "Mi panel", menú hamburguesa y encabezado y pie compartidos |
| `js/ui.js` | Crea elementos con `textContent` y muestra los errores junto a cada campo |
| `js/etiquetas.js`, `js/etiquetas-adopciones.js` | El texto de cada código que manda la API (`ALIMENTO`, `PERRO`, `EN_CURSO`…) |
| `js/buscar-lista.js`, `js/pestanas.js` | Buscador y pestañas reutilizables de los listados |
| `js/notificaciones.js` | La campana |

### Estructura

```
├── Sitemaps/ · Wireframes/   Mapas del sitio y wireframes (PDF)
├── css/                      base.css y una hoja por tema (tienda, adopciones, paneles, reportes…)
├── js/                       Un archivo por pantalla, más los comunes
├── index.html · 404.html
├── login/ · registros/       Ingreso y registros
├── catalogo/ · tienda/       Catálogo, carrito, compras y pago
├── adopciones/ · rescatista/ Adopciones públicas y panel del rescatista
├── cliente/ · cuenta/        Pantallas del cliente y de la cuenta
├── resenas/                  Reseñas
├── paneles/                  "Mi panel" de cada rol
├── panel/                    Pantallas de la veterinaria
├── pruebas-e2e/              Pruebas con Playwright
├── vercel.json               Reenvío de /api/ y cabeceras de seguridad
└── autores.txt · VERSION.txt
```

---

## Cómo levantarlo en local

### Requisitos

- Un navegador actual.
- Un servidor estático. Los módulos ES **no funcionan abriendo el archivo con doble clic** (`file://`). Sirve la extensión **Live Server** de VS Code o, con Python, `python3 -m http.server 5500` desde la raíz del repo.

### Pasos

```bash
git clone https://github.com/romeroppau/PAW--Frontend--TPIntegrador.git
cd PAW--Frontend--TPIntegrador
```

1. Abrir la carpeta en VS Code.
2. Clic derecho sobre `index.html` → **Open with Live Server**.
3. Entrar a `http://127.0.0.1:5500`.

> Las rutas empiezan con `/` (por ejemplo `/css/base.css`): el servidor tiene que tener como raíz la carpeta del repositorio.

### Con datos

Un servidor estático no reenvía `/api/`, así que sin backend las pantallas muestran sus mensajes de error y los paneles redirigen al login. Para probar con datos:

- Usar el sitio de desarrollo (https://huellavet-la25-dev.vercel.app), o
- Levantar el sistema con Docker (pasos en el README de ApiGateway, puerto `10000`) y activar el proxy de Live Server en la configuración de VS Code:

  ```json
  "liveServer.settings.proxy": { "enable": true, "baseUri": "/api", "proxyUri": "http://127.0.0.1:10000/api" }
  ```

  La cookie de sesión es `Secure`: algunos navegadores no la guardan en `http://`, aunque sea localhost.

---

## Pruebas

Las pruebas de punta a punta usan **Playwright**: abren las páginas en un navegador real y simulan las respuestas de la API, así no dependen del backend ni de la base. Están en `pruebas-e2e/tests/` (24 archivos: portada, catálogo, tienda, promociones, mascotas, ficha, calendario, turnos del cliente, agenda, consulta, adopciones, reseñas, reportes, configuración, cuenta, verificación del WhatsApp, notificaciones, panel, formularios y más).

```bash
cd pruebas-e2e
npm install
npx playwright install chromium
npm run pruebas          # todas
npm run pruebas:ver      # con el navegador a la vista
npm run informe          # el informe de la última corrida
```

GitHub Actions las corre en cada push y en cada pull request (`.github/workflows/pruebas.yml`).

---

## Seguridad en el frontend

- Los textos de la API se insertan siempre con `textContent` (previene XSS).
- Cookie de sesión `huellavet_sesion`: `HttpOnly`, `Secure`, `SameSite=Strict`. El JavaScript no puede leerla.
- Token CSRF en `X-CSRF-Token` en todo `POST`, `PUT` y `DELETE`.
- Mensaje genérico ante credenciales inválidas.
- Cabeceras de seguridad en `vercel.json` (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`).
- Los formularios de registro no envían el rol: lo fija el backend.
- El pago se hace en Mercado Pago: el sitio nunca ve los datos de la tarjeta.
- Ocultar un panel a otro rol es solo comodidad: **la autorización real es del backend** (responde 401 o 403).

---

## Accesibilidad

- HTML semántico y enlace "Saltar al contenido".
- Cada campo con `<label>`; los errores se anuncian con `role="alert"` y `aria-invalid`.
- Foco visible, uso completo con teclado (incluidos los menús desplegables, que se cierran con Escape) y respeto a `prefers-reduced-motion`.
- Botones y enlaces con `aria-label` cuando el texto solo no alcanza.
- Diseño adaptable a celular y escritorio.

---

## Despliegue

Vercel publica el sitio y se actualiza solo con cada cambio que entra a `dev` (sitio de desarrollo) y a `main` (producción). Las demás ramas no se publican (`ignoreCommand` de `vercel.json`).

1. Importar el repositorio en Vercel (Framework Preset: **Other**, sin comando de build).
2. `vercel.json` reenvía `/api/` al servicio de Render que corresponde a cada sitio.
3. Probar por HTTPS: registrarse, ingresar, ver el panel según el rol y salir.

> El servicio gratuito de Render se apaga tras 15 minutos sin visitas; **la primera carga puede tardar cerca de un minuto**.

---

## Repositorios del proyecto

- [Frontend](https://github.com/romeroppau/PAW--Frontend--TPIntegrador) (este)
- [ApiGateway](https://github.com/romeroppau/PAW--ApiGateway--TPIntegrador)
- [Backend](https://github.com/romeroppau/PAW--Backend--TPIntegrador)
- [Inventario](https://github.com/romeroppau/PAW--Inventario--TPIntegrador)
- [Pacientes](https://github.com/romeroppau/PAW--Pacientes--TPIntegrador)
- [Adopciones](https://github.com/romeroppau/PAW--Adopciones--TPIntegrador)
- [Reportes](https://github.com/romeroppau/PAW--Reportes--TPIntegrador)

Contratos de la API: [ApiGateway](https://github.com/romeroppau/PAW--ApiGateway--TPIntegrador/blob/main/api/CONTRATO_API_ApiGateway.md) y la carpeta `docs/api/` de cada módulo.
