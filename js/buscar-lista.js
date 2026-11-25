/**
 * buscar-lista.js — Buscador por nombre de las listas de la veterinaria (productos e insumos).
 *
 * Filtra mientras se escribe lo que la página ya trajo de la API: sin pedidos nuevos, y sin
 * distinguir mayúsculas ni tildes ("jeringa" encuentra "Jeringa"; "antipulgas" encuentra "Antipulgás").
 */

// "Antipulgás Gatos" -> "antipulgas gatos"
export const normalizar = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Conecta el input de búsqueda con una lista de objetos que tienen "nombre".
 * pintar(visibles, texto) se llama enseguida (con todo, o con lo que ya estaba escrito) y en cada
 * cambio del input. Si se vuelve a llamar con otra lista (después de recargarla), reemplaza la anterior.
 *
 * Opcional (Entrega 5): soloSi = { casilla, cumple }. Con la casilla marcada, solo quedan los que
 * cumplen (por ejemplo, "Solo stock bajo"); se combina con el texto buscado.
 */
export function filtrarPorNombre(input, items, pintar, soloSi = null) {
  const aplicar = () => {
    const texto = input?.value.trim() ?? '';
    const buscado = normalizar(texto);
    let visibles = buscado === '' ? items : items.filter((x) => normalizar(x.nombre).includes(buscado));
    if (soloSi?.casilla?.checked) visibles = visibles.filter(soloSi.cumple);
    pintar(visibles, texto);
  };
  if (input) input.oninput = aplicar;   // una sola escucha, aunque se recargue la lista
  if (soloSi?.casilla) soloSi.casilla.onchange = aplicar;
  aplicar();
}

/**
 * Pone el límite en el texto de la casilla "Solo stock bajo" (<span data-limite-stock>) y devuelve
 * el filtro para filtrarPorNombre. El límite lo manda la API con la lista (limite_stock_bajo,
 * configurable por la veterinaria); si no llega, 10.
 */
export function filtroStockBajo(respuesta) {
  const limite = Number.isInteger(respuesta?.limite_stock_bajo) ? respuesta.limite_stock_bajo : 10;
  document.querySelectorAll('[data-limite-stock]').forEach((s) => { s.textContent = limite; });
  return { casilla: document.getElementById('solo-bajo'), cumple: (x) => x.stock <= limite, limite };
}
