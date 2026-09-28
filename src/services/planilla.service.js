const planillaRepository = require('../repositories/planilla.repository');
const { calcularMontoAprobado } = require('../utils/calculations');

async function createPlanilla(user, planilla, solicitudes) {
  if (user.rol !== 'ASISTENTE' || !user.agenciaId) {
    throw new Error('El usuario no tiene una agencia habilitada para crear planillas.');
  }

  if (!Array.isArray(solicitudes) || solicitudes.length === 0) {
    throw new Error('Una planilla debe contener al menos una solicitud.');
  }

  const extractionDate = new Date();
  const snapshots = solicitudes.map((solicitud) => ({
    ...solicitud,
    montoAprobado: calcularMontoAprobado({
      descuentos: solicitud.descuentos,
      montoCheque: solicitud.montoCheque,
      montoCancelado: solicitud.montoCancelado,
      tieneCancelacion: Number(solicitud.montoCancelado) > 0,
    }),
    fechaExtraccion: extractionDate,
  }));

  return planillaRepository.createWithSolicitudes(
    {
      ...planilla,
      agenciaId: user.agenciaId,
      usuarioId: user.id,
    },
    snapshots,
  );
}

module.exports = {
  createPlanilla,
};
