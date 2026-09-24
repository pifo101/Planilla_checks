const test = require('node:test');
const assert = require('node:assert/strict');
const planillaRepository = require('../src/repositories/planilla.repository');
const {
  AvailabilityValidationError,
  getAvailability,
  validateRequestNumber,
  validateCheckNumber,
} = require('../src/services/availability.service');

test('indica cuando la solicitud y el cheque estan disponibles', async () => {
  const original = planillaRepository.findSolicitudUsage;
  planillaRepository.findSolicitudUsage = async () => ({
    solicitudUtilizada: false,
    chequeUtilizado: false,
  });
  try {
    const result = await getAvailability('1001', 'CHK-5001');
    assert.equal(result.solicitudDisponible, true);
    assert.equal(result.chequeDisponible, true);
  } finally {
    planillaRepository.findSolicitudUsage = original;
  }
});

test('indica cuando la solicitud y el cheque ya fueron utilizados', async () => {
  const original = planillaRepository.findSolicitudUsage;
  planillaRepository.findSolicitudUsage = async () => ({
    solicitudUtilizada: true,
    chequeUtilizado: true,
  });
  try {
    const result = await getAvailability('1002', '5002');
    assert.equal(result.solicitudDisponible, false);
    assert.equal(result.chequeDisponible, false);
  } finally {
    planillaRepository.findSolicitudUsage = original;
  }
});

test('distingue una solicitud utilizada de un cheque disponible', async () => {
  const original = planillaRepository.findSolicitudUsage;
  planillaRepository.findSolicitudUsage = async () => ({
    solicitudUtilizada: true,
    chequeUtilizado: false,
  });
  try {
    const result = await getAvailability('1003', '5003');
    assert.equal(result.solicitudDisponible, false);
    assert.equal(result.chequeDisponible, true);
  } finally {
    planillaRepository.findSolicitudUsage = original;
  }
});

test('distingue un cheque utilizado de una solicitud disponible', async () => {
  const original = planillaRepository.findSolicitudUsage;
  planillaRepository.findSolicitudUsage = async () => ({
    solicitudUtilizada: false,
    chequeUtilizado: true,
  });
  try {
    const result = await getAvailability('1004', '5004');
    assert.equal(result.solicitudDisponible, true);
    assert.equal(result.chequeDisponible, false);
  } finally {
    planillaRepository.findSolicitudUsage = original;
  }
});

test('valida el numero de solicitud', () => {
  assert.equal(validateRequestNumber(' 12345 '), '12345');
  assert.throws(
    () => validateRequestNumber('SOL-1'),
    (error) => error instanceof AvailabilityValidationError && error.code === 'INVALID_REQUEST_NUMBER',
  );
});

test('valida el numero de cheque', () => {
  assert.equal(validateCheckNumber(' CHK-5003 '), 'CHK-5003');
  assert.throws(
    () => validateCheckNumber(''),
    (error) => error instanceof AvailabilityValidationError && error.code === 'INVALID_CHECK_NUMBER',
  );
  assert.throws(
    () => validateCheckNumber('CHK 5003'),
    (error) => error instanceof AvailabilityValidationError && error.code === 'INVALID_CHECK_NUMBER',
  );
});
