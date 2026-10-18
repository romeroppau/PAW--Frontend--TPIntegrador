# Cambios en el Frontend para el módulo Inventario

Ajustes para que el catálogo y el panel del veterinario funcionen con la API del módulo Inventario. El contrato de los endpoints está en [docs/api/contrato.md del repo Inventario](https://github.com/romeroppau/PAW--Inventario--TPIntegrador/blob/main/docs/api/contrato.md).

## Por qué

La API identifica la categoría y la especie con **códigos** (`ALIMENTO`, `PERRO`), no con el texto que ve el usuario ("Alimento balanceado", "Perro"). El frontend mandaba los textos, así que los filtros del catálogo no filtraban (la API ignora los valores que no reconoce) y el alta de productos fallaba con "La categoría no es válida".

| Código | Texto que se muestra |
|---|---|
| `MEDICAMENTO` | Medicamentos |
| `ALIMENTO` | Alimento balanceado |
| `ACCESORIO` | Accesorios |
| `PERRO` | Perro |
| `GATO` | Gato |
| `TODAS` | Todas las especies |

## Archivos

| Archivo | Cambio |
|---|---|
| `js/etiquetas.js` | **Nuevo.** La tabla de arriba, con `textoCategoria()` y `textoEspecie()`, para pasar de código a texto en un solo lugar |
| `catalogo/catalogo.html` | Los `<option>` de los filtros mandan los códigos: `<option value="ALIMENTO">Alimento balanceado</option>` |
| `js/catalogo.js` | La etiqueta de categoría de cada tarjeta muestra el texto, no el código |
| `js/producto.js` | La categoría y la especie del detalle muestran el texto |
| `panel/producto-form.html` | Categoría y especie pasan de campos de texto libre a `<select>` con los códigos (antes había que escribir `ALIMENTO` a mano) |
| `js/panel.js` | El listado muestra el texto de la categoría. La edición precarga el producto con `GET /api/inventario/productos/{id}` en vez de pedir el listado completo y buscarlo; si el producto no existe (404), vuelve al listado |

## Comportamiento que conviene saber

- **Filtro por especie:** elegir "Perro" trae los productos para perro **y** los cargados para "Todas las especies".
- **Catálogo:** solo muestra productos activos y no vencidos, de a 12 por página. El botón "Cargar más" se oculta cuando una página llega vacía.
- **Edición:** si no se elige una imagen nueva, se conserva la que tenía el producto. El stock no se edita desde el formulario: solo con "Cargar stock", para que quede en el historial de movimientos.
- El listado del panel no trae la imagen ni la descripción (para que sea liviano); por eso la edición pide el producto individual, que sí las trae.
