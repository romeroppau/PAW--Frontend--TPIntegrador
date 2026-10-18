// Textos que ve el usuario para los códigos de categoría y especie que usa la API de Inventario
// (contrato de Inventario: docs/api/contrato.md). La API siempre recibe y devuelve los códigos.
export const CATEGORIAS = {
  MEDICAMENTO: 'Medicamentos',
  ALIMENTO: 'Alimento balanceado',
  ACCESORIO: 'Accesorios'
};

export const ESPECIES = {
  PERRO: 'Perro',
  GATO: 'Gato',
  TODAS: 'Todas las especies'
};

// Si llega un código desconocido, se muestra tal cual en lugar de dejar el texto vacío.
export const textoCategoria = (codigo) => CATEGORIAS[codigo] ?? codigo;
export const textoEspecie = (codigo) => ESPECIES[codigo] ?? codigo;
