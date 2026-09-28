const planillaRepository = require('../repositories/planilla.repository');

const REQUEST_NUMBER_PATTERN = /^\d{1,30}$/;
const CHECK_NUMBER_PATTERN = /^[A-Za-z0-9-]{1,50}$/;

class AvailabilityValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AvailabilityValidationError';
    this.code = code;
    this.status = 400;
  }
}

function validateRequestNumber(value) {
  const numeroSolicitud = String(value || '').trim();
  if (!REQUEST_NUMBER_PATTERN.test(numeroSolicitud)) {
    throw new AvailabilityValidationError(
      'INVALID_REQUEST_NUMBER',
      'Ingresa un numero de solicitud valido, usando solo digitos.',
    );
  }
  return numeroSolicitud;
}

function validateCheckNumber(value) {
  const numeroCheque = String(value || '').trim();
  if (!CHECK_NUMBER_PATTERN.test(numeroCheque)) {
    throw new AvailabilityValidationError(
      'INVALID_CHECK_NUMBER',
      'Ingresa un numero de cheque valido de hasta 50 caracteres alfanumericos o guiones.',
    );
  }
  return numeroCheque;
}

async function getAvailability(requestNumber, checkNumber) {
  const numeroSolicitud = validateRequestNumber(requestNumber);
  const numeroCheque = validateCheckNumber(checkNumber);
  const usage = await planillaRepository.findSolicitudUsage(numeroSolicitud, numeroCheque);

  return {
    numeroSolicitud,
    numeroCheque,
    solicitudDisponible: !usage.solicitudUtilizada,
    chequeDisponible: !usage.chequeUtilizado,
  };
}

module.exports = {
  AvailabilityValidationError,
  getAvailability,
  validateRequestNumber,
  validateCheckNumber,
};
