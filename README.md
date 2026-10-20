# HuellaVet — Frontend

Interfaz web de **HuellaVet**, aplicación para la gestión de una veterinaria: catálogo de productos con stock, registro e ingreso por roles y panel del veterinario. En próximas entregas: historial clínico, adopciones y tienda con pago.

Trabajo Práctico Integrador de **Programación en Ambiente Web** (UNLu, 2026) — Grupo **La 25**.

Este repositorio contiene solo el **frontend**. Consume la API JSON que sirven los demás módulos (ver [Repositorios del proyecto](#repositorios-del-proyecto)).

**URL pública:** _completar con la URL de Vercel_

---

## Estado de la Entrega 3

| Requisito de la consigna | Pantallas | Estado |
|---|---|---|
| Registro e ingreso con sesión y roles | `login/`, `registros/`, paneles por rol | Frontend listo. Backend desplegado |
| ABM y listado de la entidad principal (productos con stock) | `panel/productos.html`, `panel/producto-form.html`, `panel/movimientos.html` | Frontend listo y adaptado al contrato.
| Vista pública con búsqueda o filtro y detalle | `catalogo/catalogo.html`, `catalogo/producto.html` | Frontend listo y adaptado al contrato.
| Desplegado con HTTPS | Vercel | Publicado |
| Seguridad aplicada | Ver [Seguridad](#seguridad-en-el-frontend) | Del lado del cliente, hecho; el resto es del backend |

Adelantos de la Entrega 4 incluidos: buscador del catálogo en vivo con `fetch` y plantilla base accesible.

---

## Tecnologías

- **HTML5, CSS3 y JavaScript** sin frameworks ni librerías (lo exige la materia). Los scripts usan módulos ES (`import` / `export`).
- **Vercel** publica el frontend con HTTPS y reenvía `/api/` al backend.
- Tipografías Fraunces y Nunito Sans, desde Google Fonts.

---

## Cómo levantarlo en local

### Requisitos
- Un navegador actual.
- Un servidor estático local. Los módulos ES **no funcionan abriendo el archivo con doble clic** (`file://`). Opciones:
  - Extensión **Live Server** de VS Code (recomendada).
  - O, con Python instalado: `python3 -m http.server 5500` desde la raíz del repositorio.

### Pasos
```bash
git clone https://github.com/romeroppau/PAW--Frontend--TPIntegrador.git
cd PAW--Frontend--TPIntegrador
```
1. Abrir la carpeta en VS Code.
2. Clic derecho sobre `index.html` → **Open with Live Server**.
3. Entrar a `http://127.0.0.1:5500`.

> Las rutas empiezan con `/` (por ejemplo `/css/base.css`): el servidor debe tener como raíz la carpeta del repositorio.

### Limitación en local
Un servidor estático no reenvía `/api/`, así que los pedidos al backend fallan y las pantallas muestran sus mensajes de error. Es lo esperado. En ese estado, los paneles redirigen a `login/login.html` porque no hay sesión.

Para probar con datos reales hay dos caminos:
- Usar la URL pública de Vercel.
- Levantar el backend local con Docker (pasos en el README de ApiGateway, puerto `10000`) y activar el proxy de Live Server en la configuración de VS Code:
  ```json
  "liveServer.settings.proxy": { "enable": true, "baseUri": "/api", "proxyUri": "http://127.0.0.1:10000/api" }
  ```
  La cookie de sesión es `Secure`: algunos navegadores no la guardan en `http://`, aunque sea localhost.

---

## Estructura del repositorio

```
├── Sitemaps/ · Wireframes/        Mapas del sitio y wireframes (PDF)
├── css/
│   ├── base.css                   Estilos compartidos
│   ├── autenticacion.css          Login y registros
│   └── paneles.css                Paneles por rol
├── js/
│   ├── api.js                     Función común de fetch
│   ├── ui.js                      Utilidades de interfaz
│   ├── etiquetas.js               Texto de cada código de categoría y especie
│   ├── layout.js                  Encabezado y pie de las páginas del ABM
│   ├── menu.js                    Menú hamburguesa
│   ├── auth.js                    Sesión, menú según rol y "Salir"
│   ├── guardia-panel.js           Protege los paneles por rol
│   ├── login.js · registro.js · mostrar-password.js
│   ├── catalogo.js · producto.js  Catálogo y detalle
│   └── panel.js                   ABM del veterinario
├── login/login.html
├── registros/                     registro.html, registro-cliente.html, registro-rescatista.html
├── catalogo/                      catalogo.html, producto.html, catalogo.css
├── paneles/                       panel-administrador.html, panel-cliente.html, panel-rescatista.html
├── panel/                         productos.html, producto-form.html, movimientos.html (ABM)
├── index.html
├── vercel.json                    Reenvío de /api/ al backend y cabeceras de seguridad
├── autores.txt · VERSION.txt
└── README.md
```

---

## Recorrido de cada rol

| Rol | Cómo entra | Dónde cae |
|---|---|---|
| **Cliente** | Se registra en `registros/registro-cliente.html` | `paneles/panel-cliente.html` |
| **Rescatista** | Se registra en `registros/registro-rescatista.html` (queda pendiente de aprobación) | `paneles/panel-rescatista.html` |
| **Veterinario** | No se registra: se crea con `scripts/crear_veterinario.php` (repositorio Backend) | `paneles/panel-administrador.html` → "ABM de productos" → `panel/productos.html` |

Cada panel verifica el rol y oculta su contenido hasta confirmarlo. Un usuario sin sesión o con otro rol es redirigido a `login/login.html`. Los paneles muestran el nombre del usuario y el botón "Salir".

---

## Cómo funciona

```
Navegador ──> Vercel (HTML/CSS/JS) ──/api/…──> Render (Nginx → PHP) ──> MySQL (Aiven)
```

- Las páginas piden los datos con `fetch` y reciben **JSON**.
- `vercel.json` reenvía todo lo que empieza con `/api/` al backend. Para el navegador es **un solo dominio**: por eso la cookie de sesión `SameSite=Strict` funciona y no hace falta CORS.
- El frontend **solo presenta**. La validación definitiva y el control de roles los hace el backend.

---

## Componentes importantes

- **`js/api.js`:** única puerta de salida hacia la API. Envía la cookie, agrega `X-CSRF-Token` en los pedidos que no son `GET`, corta a los 15 s y reintenta una vez **solo los `GET`** (un `POST` repetido podría duplicar una operación). Si la API responde con error, lanza `{ estado, datos }`.
- **`js/ui.js`:** crea elementos con `textContent` (nunca `innerHTML` con datos de la API) y muestra los errores de validación junto a cada campo.
- **`js/auth.js`:** consulta `GET /api/auth/yo`, guarda el token CSRF, arma el encabezado según la sesión (nombre y "Salir", y enlace "Panel" para el veterinario). Exporta `exigirRol(rol)`, la guardia de acceso que usan los paneles.
- **`js/guardia-panel.js`:** usa `exigirRol` con el atributo `data-rol` del `<body>` de cada panel.
- **`js/layout.js`:** encabezado y pie compartidos de las pantallas del ABM. Se carga como **script clásico** (no módulo) para que el encabezado exista antes del primer dibujado.
- **`js/menu.js`:** menú hamburguesa en pantallas de hasta 800 px, con `aria-expanded`, foco y tecla Escape.
- **`js/login.js` y `js/registro.js`:** envían los formularios, muestran los errores del backend y redirigen según el rol.
- **`js/catalogo.js`:** buscador en vivo (espera 300 ms después de la última tecla), filtros y "Cargar más". Descarta respuestas lentas de búsquedas anteriores.
- **`js/producto.js`:** detalle de un producto; valida el id de la URL y maneja el 404.
- **`js/panel.js`:** listado, alta y edición, baja lógica, carga de stock e historial de movimientos del veterinario.

---

## Endpoints que consume

| Pantalla | Endpoints |
|---|---|
| Registro | `POST /api/auth/registro/cliente`, `POST /api/auth/registro/rescatista` |
| Login | `POST /api/auth/login` |
| Todas las páginas con encabezado | `GET /api/auth/yo`, `POST /api/auth/logout` |
| Catálogo | `GET /api/tienda/productos?buscar=&categoria=&especie=&pagina=` |
| Detalle | `GET /api/tienda/productos/{id}` |
| ABM del veterinario | `GET`, `POST /api/inventario/productos`, `GET`, `PUT`, `DELETE /api/inventario/productos/{id}`, `POST …/{id}/stock`, `GET …/{id}/movimientos` |

Contratos: [Autenticación](https://github.com/romeroppau/PAW--Backend--TPIntegrador/blob/main/docs/api/contrato.md) · [ApiGateway](https://github.com/romeroppau/PAW--ApiGateway--TPIntegrador/blob/main/api/CONTRATO_API_ApiGateway.md) · Inventario y tienda (`docs/api/contrato.md` del repositorio Inventario).

La API de Inventario manda **códigos** (`ALIMENTO`, `PERRO`...) y el frontend arma los textos en `js/etiquetas.js`.

---

## Seguridad en el frontend

- Los textos de la API se insertan siempre con `textContent` (previene XSS).
- Cookie de sesión `huellavet_sesion`: `HttpOnly`, `Secure`, `SameSite=Strict`, 12 horas. El JavaScript no puede leerla.
- Token CSRF en `X-CSRF-Token` en todo `POST`, `PUT` y `DELETE`.
- Mensaje genérico ante credenciales inválidas.
- Cabeceras de seguridad en `vercel.json` (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`).
- Los formularios de registro no envían el rol: lo fija el backend.
- Ocultar un panel a otro rol es solo comodidad: **la autorización real es del backend** (responde 403).

---

## Accesibilidad

- HTML semántico y enlace "Saltar al contenido".
- Cada campo con `<label>`; los errores se anuncian con `role="alert"` y `aria-invalid`.
- Foco visible, uso completo con teclado y respeto a `prefers-reduced-motion`.
- Botones y enlaces del ABM con `aria-label` que incluye el nombre del producto.
- Validador [W3C](https://validator.w3.org/) a pasar antes de cada entrega.

---

## Despliegue

Vercel publica el frontend y se actualiza solo con cada cambio que entra a `main`:
1. Importar el repositorio en Vercel (Framework Preset: **Other**, sin comando de build).
2. `vercel.json` reenvía `/api/` a la URL del servicio de Render.
3. Probar por HTTPS: registrarse, ingresar, ver el panel según el rol y salir.

> El servicio gratuito de Render se duerme tras 15 minutos sin visitas; **la primera carga puede tardar cerca de un minuto**.

---

## Datos de ejemplo y pendientes

- **WhatsApp:** el botón de turno usa un número de ejemplo (`5491155555555`), porque la veterinaria es ficticia. Reemplazar cuando exista uno real.
- **Inventario:** el frontend ya está adaptado a su contrato. Hasta que el módulo esté desplegado, el catálogo y el ABM muestran su mensaje de error de carga.
- **Imágenes de producto:** viajan como data URL en el JSON (PNG, JPG o WEBP, hasta 1 MB). Nginx rechaza por defecto cuerpos de más de 1 MB: hay que agregar `client_max_body_size 2m;` en el gateway.
- Pendiente: validación W3C, recorrido solo con teclado y tag `entrega-3`.

---

## Repositorios del proyecto

- [Frontend](https://github.com/romeroppau/PAW--Frontend--TPIntegrador) (este)
- [ApiGateway](https://github.com/romeroppau/PAW--ApiGateway--TPIntegrador)
- [Backend](https://github.com/romeroppau/PAW--Backend--TPIntegrador)
- [Inventario](https://github.com/romeroppau/PAW--Inventario--TPIntegrador)
- [Pacientes](https://github.com/romeroppau/PAW--Pacientes--TPIntegrador)
- [Adopciones](https://github.com/romeroppau/PAW--Adopciones--TPIntegrador)
- [Reportes](https://github.com/romeroppau/PAW--Reportes--TPIntegrador)

## Autores

Grupo **La 25**: Ana Paula Romero, María Trinidad López, Valentino Aimale y Cristian Tomás Anito. Nombres y legajos en `autores.txt`.
