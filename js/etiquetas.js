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

// Estados y motivos de la Entrega 4. La API siempre recibe y devuelve los códigos.
export const ESTADOS_TURNO = {
  PROGRAMADO: 'Programado',
  EN_ATENCION: 'En atención',
  ATENDIDO: 'Atendido',
  CANCELADO: 'Cancelado',
  AUSENTE: 'Ausente'
};

// 25/11 (migración 025): más motivos. Vacunación y desparasitación dicen además cuál (del calendario).
export const MOTIVOS_TURNO = {
  CONSULTA: 'Consulta',
  VACUNACION: 'Vacunación',
  DESPARASITACION: 'Desparasitación',
  CASTRACION: 'Castración',
  CIRUGIA: 'Cirugía',
  CONTROL: 'Control / seguimiento',
  URGENCIA: 'Urgencia',
  CHEQUEO_ADOPCION: 'Chequeo de adopción'
};

// Todos los motivos de un turno o consulta (migración 026), con la vacuna de cada uno:
// "Vacunación: Antirrábica · Control / seguimiento". Sin la lista, el motivo solo.
export function textoMotivos(x) {
  const lista = x.motivos?.length ? x.motivos : [{ motivo: x.motivo, evento_sanitario: null }];
  return lista.map((m) => {
    const texto = MOTIVOS_TURNO[m.motivo] ?? m.motivo;
    return m.evento_sanitario ? `${texto}: ${m.evento_sanitario.nombre}` : texto;
  }).join(' · ');
}

export const ESTADOS_INSUMO = {
  DISPONIBLE: 'Disponible',
  EN_FALTA: 'En falta',
  YA_PEDIDO: 'Ya pedido'
};

export const ESPECIES_MASCOTA = {
  PERRO: 'Perro',
  GATO: 'Gato',
  OTRO: 'Otro'
};

export const ESTADOS_CONSULTA = {
  ABIERTA: 'Abierta',
  FINALIZADA: 'Finalizada'
};

export const ESTADOS_FACTURA = {
  PENDIENTE_PAGO: 'Pendiente de pago',
  PAGADA: 'Pagada'
};

// Si llega un código desconocido, se muestra tal cual en lugar de dejar el texto vacío.
export const textoCategoria = (codigo) => CATEGORIAS[codigo] ?? codigo;
export const textoEspecie = (codigo) => ESPECIES[codigo] ?? codigo;
export const textoEstadoTurno = (codigo) => ESTADOS_TURNO[codigo] ?? codigo;
export const textoMotivoTurno = (codigo) => MOTIVOS_TURNO[codigo] ?? codigo;
export const textoEstadoInsumo = (codigo) => ESTADOS_INSUMO[codigo] ?? codigo;
export const textoEspecieMascota = (codigo) => ESPECIES_MASCOTA[codigo] ?? codigo;
export const textoEstadoConsulta = (codigo) => ESTADOS_CONSULTA[codigo] ?? codigo;
export const textoEstadoFactura = (codigo) => ESTADOS_FACTURA[codigo] ?? codigo;