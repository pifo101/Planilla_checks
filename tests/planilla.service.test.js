const test = require('node:test');
const assert = require('node:assert/strict');
const planillaRepository = require('../src/repositories/planilla.repository');
const actaService = require('../src/services/acta.service');
const {
  MAX_SOLICITUDES,
  PlanillaError,
  createPlanilla,
  generatePlanillaCode,
  validateSubmission,
} = require('../src/services/planilla.service');
const { createSubmissionToken } = require('../src/services/planilla-token.service');

const originalFindSolicitudUsage = planillaRepository.findSolicitudUsage;
const originalCreateWithSolicitudes = planillaRepository.createWithSolicitudes;
const originalGetCurrentActa = actaService.getCurrentActa;
const user = { id: 10, rol: 'ASISTENTE', agenciaId: 20 };
const now = new Date('2026-09-29T14:00:00.000Z');

function validRequest(overrides = {}) {
  const { tokenNow = now, extractionNow = new Date('2026-09-29T13:45:12.789Z'), ...requestOverrides } = overrides;
  const values = {
    numeroSolicitud: '123456',
    cliente: 'CLIENTE PRUEBA',
    numeroCheque: 'CHK-100',
    metodologia: 'INDIVIDUAL',
    montoAprobadoCentavos: 1_200_000,
    montoCanceladoCentavos: 250_000,
    descuentosCentavos: 50_000,
    montoChequeCentavos: 900_000,
    miembroId: null,
    cantidadMiembros: null,
    grupoFingerprint: null,
    ...requestOverrides,
  };
  const submissionToken = createSubmissionToken(user.id, values.numeroSolicitud, {
    fechaExtraccion: extractionNow,
    cliente: values.cliente,
    metodologia: values.metodologia,
    montoAprobado: values.montoAprobadoCentavos / 100,
    montoCancelado: values.montoCanceladoCentavos / 100,
    descuentos: values.descuentosCentavos / 100,
    montoCheque: values.montoChequeCentavos / 100,
    miembroId: values.miembroId,
    cantidadMiembros: values.cantidadMiembros,
    grupoFingerprint: values.grupoFingerprint,
  }, { now: () => tokenNow });
  return {
    numeroSolicitud: values.numeroSolicitud,
    numeroCheque: values.numeroCheque,
    ...(values.miembroId ? { miembroId: values.miembroId } : {}),
    submissionToken,
  };
}

function submission(...requests) {
  return { solicitudes: requests.length ? requests : [validRequest()] };
}

test.beforeEach(() => {
  actaService.getCurrentActa = async () => ({
    fecha: '2026-09-29',
    acta: { id: 1, fecha: '2026-09-29', numeroActa: 'ACTA-X' },
  });
});

test.afterEach(() => {
  planillaRepository.findSolicitudUsage = originalFindSolicitudUsage;
  planillaRepository.createWithSolicitudes = originalCreateWithSolicitudes;
  actaService.getCurrentActa = originalGetCurrentActa;
});

test('crea una planilla ENVIADA usando usuario, agencia, fecha y codigo del servidor', async () => {
  let persisted;
  planillaRepository.findSolicitudUsage = async () => ({ solicitudUtilizada: false, chequeUtilizado: false });
  planillaRepository.createWithSolicitudes = async (planilla, solicitudes) => {
    persisted = { planilla, solicitudes };
    return { id: 99, ...planilla, solicitudes: [] };
  };

  const result = await createPlanilla(user, {
    ...submission(validRequest()),
    agenciaId: 999,
    usuarioId: 999,
    estado: 'PROCESADA',
    fechaEnvio: '2000-01-01',
    codigo: 'FALSIFICADO',
  }, {
    now: () => now,
    generateCode: () => 'PLN-CODIGO-SERVIDOR',
  });

  assert.equal(result.id, 99);
  assert.deepEqual(persisted.planilla, {
    codigo: 'PLN-CODIGO-SERVIDOR',
    agenciaId: 20,
    usuarioId: 10,
    fechaEnvio: now,
    estado: 'ENVIADA',
    numeroActa: 'ACTA-X',
  });
  assert.deepEqual(persisted.solicitudes[0], {
    numeroSolicitud: '123456',
    nombreCliente: 'CLIENTE PRUEBA',
    numeroCheque: 'CHK-100',
    metodologia: 'INDIVIDUAL',
    montoAprobado: 12000,
    montoCancelado: 2500,
    descuentos: 500,
    montoCheque: 9000,
    fechaExtraccion: new Date('2026-09-29T13:45:12.000Z'),
    estado: 'PENDIENTE',
  });
});

test('genera codigos tecnicos UUID dentro del limite SQL', () => {
  const code = generatePlanillaCode();
  assert.match(code, /^PLN-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(code.length, 40);
});

test('rechaza body inexistente, solicitudes ausentes y planilla vacia', () => {
  for (const [body, code] of [
    [undefined, 'INVALID_BODY'],
    [{}, 'INVALID_REQUESTS'],
    [{ solicitudes: '123' }, 'INVALID_REQUESTS'],
    [{ solicitudes: [] }, 'EMPTY_PLANILLA'],
  ]) {
    assert.throws(
      () => validateSubmission(body, { userId: user.id, now }),
      (error) => error instanceof PlanillaError && error.code === code,
    );
  }
});

test('rechaza solicitudes incompletas y numeros invalidos', () => {
  assert.throws(
    () => validateSubmission(submission({ numeroSolicitud: '123' }), { userId: user.id, now }),
    (error) => error.code === 'INVALID_CHECK_NUMBER',
  );
  assert.throws(
    () => validateSubmission(submission({ ...validRequest(), numeroSolicitud: '../123' }), { userId: user.id, now }),
    (error) => error.code === 'INVALID_REQUEST_NUMBER',
  );
  assert.throws(
    () => validateSubmission(submission({ ...validRequest(), numeroCheque: 'CHK 100' }), { userId: user.id, now }),
    (error) => error.code === 'INVALID_CHECK_NUMBER',
  );
});

test('rechaza snapshots firmados con montos financieramente inconsistentes', () => {
  assert.throws(
    () => validateSubmission(
      submission(validRequest({ montoAprobadoCentavos: 1_199_999 })),
      { userId: user.id, now },
    ),
    (error) => error.code === 'INCONSISTENT_AMOUNTS',
  );
});

test('acepta montos coherentes y metodologia INDIVIDUAL', () => {
  const requests = validateSubmission(submission(validRequest()), { userId: user.id, now });
  assert.equal(requests[0].montoAprobado, 12000);
  assert.equal(requests[0].metodologia, 'INDIVIDUAL');
  assert.equal(requests[0].fechaExtraccion.toISOString(), '2026-09-29T13:45:12.000Z');
});

test('ignora una fecha de extraccion libre y conserva la firmada', () => {
  const requests = validateSubmission(submission({
    ...validRequest(),
    fechaExtraccion: '2000-01-01T00:00:00.000Z',
  }), { userId: user.id, now });

  assert.equal(requests[0].fechaExtraccion.toISOString(), '2026-09-29T13:45:12.000Z');
});

test('acepta todos los miembros de un grupo calculado e identificado', () => {
  const requests = validateSubmission(submission(
    validRequest({ metodologia: 'GRUPAL', miembroId: '19536', cantidadMiembros: 2, grupoFingerprint: 'a'.repeat(43) }),
    validRequest({ metodologia: 'GRUPAL', miembroId: '19537', cantidadMiembros: 2, grupoFingerprint: 'a'.repeat(43), numeroCheque: 'CHK-101' }),
  ), { userId: user.id, now });
  assert.deepEqual(requests.map((item) => item.miembroId), ['19536', '19537']);
  assert.ok(requests.every((item) => item.fechaExtraccion.toISOString() === '2026-09-29T13:45:12.000Z'));
});

test('rechaza un grupo incompleto y una identidad de miembro manipulada', () => {
  const request = validRequest({ metodologia: 'GRUPAL', miembroId: '19536', cantidadMiembros: 2, grupoFingerprint: 'a'.repeat(43) });
  assert.throws(
    () => validateSubmission(submission(request), { userId: user.id, now }),
    (error) => error.code === 'INCOMPLETE_GROUP_SUBMISSION' && error.status === 422,
  );
  assert.throws(
    () => validateSubmission(submission(
      { ...request, miembroId: 'ALTERADO' },
      validRequest({ metodologia: 'GRUPAL', miembroId: '19537', cantidadMiembros: 2, grupoFingerprint: 'a'.repeat(43), numeroCheque: 'CHK-101' }),
    ), { userId: user.id, now }),
    (error) => error.code === 'INVALID_SUBMISSION_TOKEN',
  );
});

test('rechaza mezclar miembros firmados desde snapshots grupales distintos', () => {
  assert.throws(
    () => validateSubmission(submission(
      validRequest({ metodologia: 'GRUPAL', miembroId: '19536', cantidadMiembros: 2, grupoFingerprint: 'a'.repeat(43) }),
      validRequest({ metodologia: 'GRUPAL', miembroId: '19537', cantidadMiembros: 2, grupoFingerprint: 'b'.repeat(43), numeroCheque: 'CHK-101' }),
    ), { userId: user.id, now }),
    (error) => error.code === 'INCOMPLETE_GROUP_SUBMISSION',
  );
});

test('rechaza numeros de solicitud y cheque duplicados dentro del envio', () => {
  assert.throws(
    () => validateSubmission(submission(
      validRequest(),
      validRequest({ numeroCheque: 'CHK-101' }),
    ), { userId: user.id, now }),
    (error) => error.code === 'DUPLICATE_REQUEST_IN_SUBMISSION' && error.status === 409,
  );
  assert.throws(
    () => validateSubmission(submission(
      validRequest(),
      validRequest({ numeroSolicitud: '123457', numeroCheque: 'chk-100' }),
    ), { userId: user.id, now }),
    (error) => error.code === 'DUPLICATE_CHECK_IN_SUBMISSION' && error.status === 409,
  );
});

test('aplica el limite tecnico de solicitudes por envio', () => {
  const solicitudes = Array.from({ length: MAX_SOLICITUDES + 1 }, (_, index) => validRequest({
    numeroSolicitud: String(100000 + index),
    numeroCheque: `CHK-${index}`,
  }));
  assert.throws(
    () => validateSubmission({ solicitudes }, { userId: user.id, now }),
    (error) => error.code === 'PLANILLA_TOO_LARGE' && error.status === 413,
  );
});

test('rechaza tokens alterados, vencidos o emitidos para otro usuario', () => {
  const request = validRequest();
  assert.throws(
    () => validateSubmission(submission({
      ...request,
      submissionToken: `${request.submissionToken.slice(0, -1)}x`,
    }), { userId: user.id, now }),
    (error) => error.code === 'INVALID_SUBMISSION_TOKEN',
  );
  assert.throws(
    () => validateSubmission(submission(request), { userId: 999, now }),
    (error) => error.code === 'INVALID_SUBMISSION_TOKEN',
  );
  assert.throws(
    () => validateSubmission(submission(request), {
      userId: user.id,
      now: new Date(now.getTime() + (9 * 60 * 60 * 1000)),
    }),
    (error) => error.code === 'INVALID_SUBMISSION_TOKEN',
  );
});

test('rechaza roles distintos de ASISTENTE y asistentes sin agencia', async () => {
  await assert.rejects(
    createPlanilla({ ...user, rol: 'ADMIN' }, submission()),
    (error) => error.code === 'ASSISTANT_AGENCY_REQUIRED' && error.status === 403,
  );
  await assert.rejects(
    createPlanilla({ ...user, agenciaId: null }, submission()),
    (error) => error.code === 'ASSISTANT_AGENCY_REQUIRED' && error.status === 403,
  );
});

test('rechaza solicitudes y cheques ya persistidos antes de insertar', async () => {
  planillaRepository.findSolicitudUsage = async () => ({ solicitudUtilizada: true, chequeUtilizado: false });
  await assert.rejects(
    createPlanilla(user, submission(), { now: () => now }),
    (error) => error.code === 'REQUEST_ALREADY_USED' && error.status === 409,
  );

  planillaRepository.findSolicitudUsage = async () => ({ solicitudUtilizada: false, chequeUtilizado: true });
  await assert.rejects(
    createPlanilla(user, submission(), { now: () => now }),
    (error) => error.code === 'CHECK_ALREADY_USED' && error.status === 409,
  );
});

test('rechaza el envio sin acta diaria y no acepta un acta falsificada por el cliente', async () => {
  planillaRepository.findSolicitudUsage = async () => ({ solicitudUtilizada: false, chequeUtilizado: false });
  actaService.getCurrentActa = async () => ({ fecha: '2026-09-29', acta: null });
  let persisted = false;
  planillaRepository.createWithSolicitudes = async () => { persisted = true; };
  await assert.rejects(
    createPlanilla(user, { ...submission(), numeroActa: 'ACTA-FALSA' }, { now: () => now }),
    (error) => error.code === 'DAILY_ACTA_REQUIRED' && error.status === 409,
  );
  assert.equal(persisted, false);
});

test('consulta el acta correspondiente al instante efectivo del envio', async () => {
  planillaRepository.findSolicitudUsage = async () => ({ solicitudUtilizada: false, chequeUtilizado: false });
  let receivedNow;
  actaService.getCurrentActa = async (options) => {
    receivedNow = options.now();
    return { fecha: '2026-10-01', acta: { numeroActa: 'ACTA-Y' } };
  };
  planillaRepository.createWithSolicitudes = async (planilla) => ({ id: 1, ...planilla });
  const midnight = new Date('2026-10-01T06:00:01.000Z');
  const result = await createPlanilla(user, submission(validRequest({ tokenNow: midnight })), { now: () => midnight });
  assert.equal(receivedNow.getTime(), midnight.getTime());
  assert.equal(result.numeroActa, 'ACTA-Y');
});

for (const [constraint, expectedCode] of [
  ['PK_solicitudes_asignadas', 'REQUEST_ALREADY_USED'],
  ['UQ_solicitudes_numero_cheque', 'CHECK_ALREADY_USED'],
]) {
  test(`convierte una carrera UNIQUE de ${constraint} en conflicto controlado`, async () => {
    planillaRepository.findSolicitudUsage = async () => ({ solicitudUtilizada: false, chequeUtilizado: false });
    planillaRepository.createWithSolicitudes = async () => {
      const error = new Error(`Violation of UNIQUE KEY constraint '${constraint}'.`);
      error.number = 2627;
      throw error;
    };
    await assert.rejects(
      createPlanilla(user, submission(), { now: () => now }),
      (error) => error.code === expectedCode && error.status === 409 && !/constraint|dbo/i.test(error.message),
    );
  });
}

test('reintenta una colision del codigo generado sin repetir la persistencia exitosa', async () => {
  let attempts = 0;
  planillaRepository.findSolicitudUsage = async () => ({ solicitudUtilizada: false, chequeUtilizado: false });
  planillaRepository.createWithSolicitudes = async (planilla) => {
    attempts += 1;
    if (attempts === 1) {
      const error = new Error("Violation of UNIQUE KEY constraint 'UQ_planillas_codigo'.");
      error.number = 2601;
      throw error;
    }
    return { id: 1, ...planilla };
  };

  const codes = ['PLN-PRIMERO', 'PLN-SEGUNDO'];
  const result = await createPlanilla(user, submission(), {
    now: () => now,
    generateCode: () => codes.shift(),
  });
  assert.equal(attempts, 2);
  assert.equal(result.codigo, 'PLN-SEGUNDO');
});
