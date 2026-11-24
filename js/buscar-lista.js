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
 */
export function filtrarPorNombre(input, items, pintar) {
  const aplicar = () => {
    const texto = input?.value.trim() ?? '';
    const buscado = normalizar(texto);
    pintar(buscado === '' ? items : items.filter((x) => normalizar(x.nombre).includes(buscado)), texto);
  };
  if (input) input.oninput = aplicar;   // una sola escucha, aunque se recargue la lista
  aplicar();
}
