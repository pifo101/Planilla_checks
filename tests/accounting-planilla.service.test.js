const test = require('node:test');
const assert = require('node:assert/strict');
const agencyRepository = require('../src/repositories/agency.repository');
const planillaRepository = require('../src/repositories/planilla.repository');
const {
  HISTORY_PAGE_SIZE,
  PlanillaError,
  decideAccountingTransfer,
  getAccountingPlanillaDetail,
  listAccountingPlanillas,
  listAccountingTransferHistory,
  normalizeAccountingAgency,
  normalizeTransferDecision,
} = require('../src/services/planilla.service');

const originals = {
  agencies: agencyRepository.findAvailableForAccounting,
  pending: planillaRepository.findPendingForAccounting,
  decide: planillaRepository.decideAccountingTransfer,
  history: planillaRepository.findAccountingTransferHistory,
  detail: planillaRepository.findAccountingDetail,
};
const user = { id: 30, rol: 'CONTABILIDAD', agenciaId: null };
const now = new Date('2026-10-01T14:00:00.999Z');
const agencies = [
  { id: 1, codigo: 'A', nombre: 'Agencia A', activo: true },
  { id: 2, codigo: 'B', nombre: 'Agencia B', activo: false },
];
const pendingSummary = {
  cantidadPlanillas: 0, cantidadRegistros: 0, totalAprobado: '0.00',
  totalCancelado: '0.00', totalDescuentos: '0.00', totalMontoCheque: '0.00',
};
const historySummary = {
  ...pendingSummary, cantidadTrasladadas: 0, cantidadNoTrasladadas: 0,
};

test.afterEach(() => {
  agencyRepository.findAvailableForAccounting = originals.agencies;
  planillaRepository.findPendingForAccounting = originals.pending;
  planillaRepository.decideAccountingTransfer = originals.decide;
  planillaRepository.findAccountingTransferHistory = originals.history;
  planillaRepository.findAccountingDetail = originals.detail;
});

test('bandeja incluye pendientes antiguas, varias agencias y totales exactos sin filtrar fecha', async () => {
  agencyRepository.findAvailableForAccounting = async () => agencies;
  let received;
  const rows = [
    { id: 10, agenciaId: 1, fechaEnvio: new Date('2025-01-01'), totalAprobado: '100.10' },
    { id: 11, agenciaId: 2, fechaEnvio: new Date('2026-10-01'), totalAprobado: '300.30' },
  ];
  planillaRepository.findPendingForAccounting = async (...args) => {
    received = args;
    return { total: 2, summary: { ...pendingSummary, cantidadPlanillas: 2, totalAprobado: '400.40' }, planillas: rows };
  };

  const result = await listAccountingPlanillas(user, { fecha: '2000-01-01' });

  assert.deepEqual(received, [null, 1, HISTORY_PAGE_SIZE]);
  assert.deepEqual(result.planillas.map((row) => row.agenciaId), [1, 2]);
  assert.equal(result.summary.totalAprobado, '400.40');
  assert.equal(result.agencies[1].activo, false);
});

test('bandeja combina agencia y paginacion y rechaza filtros invalidos', async () => {
  agencyRepository.findAvailableForAccounting = async () => agencies;
  let received;
  planillaRepository.findPendingForAccounting = async (...args) => {
    received = args;
    return { total: 21, summary: pendingSummary, planillas: [] };
  };
  const result = await listAccountingPlanillas(user, { agencia: '2', page: '2' });
  assert.deepEqual(received, [2, 2, HISTORY_PAGE_SIZE]);
  assert.equal(result.totalPages, 2);

  for (const value of ['0', '-1', '1.2', 'abc', '1 OR 1=1']) {
    assert.throws(() => normalizeAccountingAgency(value), (error) => error.code === 'INVALID_AGENCY');
  }
  await assert.rejects(listAccountingPlanillas(user, { agencia: '999' }), (error) => error.code === 'INVALID_AGENCY');
  await assert.rejects(listAccountingPlanillas(user, { page: '0' }), (error) => error.code === 'INVALID_HISTORY_PAGE');
});

test('CONTABILIDAD decide trasladada con usuario y fecha generados por servidor', async () => {
  let received;
  planillaRepository.decideAccountingTransfer = async (...args) => {
    received = args;
    return {
      decision: { id: 8, trasladado: true, fechaDecisionTraslado: args[3], decisionTrasladoUsuarioId: args[2] },
      current: { id: 8 },
    };
  };
  const result = await decideAccountingTransfer(
    user,
    '8',
    { trasladado: true, usuarioId: 999, fechaDecisionTraslado: '2000-01-01' },
    { now: () => now },
  );
  assert.deepEqual(received.slice(0, 3), [8, true, 30]);
  assert.equal(received[3].toISOString(), '2026-10-01T14:00:00.000Z');
  assert.equal(result.trasladado, true);
});

test('CONTABILIDAD decide no trasladada sin modificar solicitudes', async () => {
  planillaRepository.decideAccountingTransfer = async (id, trasladado, usuarioId, fecha) => ({
    decision: { id, trasladado, decisionTrasladoUsuarioId: usuarioId, fechaDecisionTraslado: fecha },
    current: { id },
  });
  const result = await decideAccountingTransfer(user, '9', { trasladado: false }, { now: () => now });
  assert.equal(result.trasladado, false);
  assert.equal(result.decisionTrasladoUsuarioId, 30);
  assert.equal(Object.hasOwn(result, 'solicitudes'), false);
  assert.equal(Object.hasOwn(result, 'procesado'), false);
  assert.equal(Object.hasOwn(result, 'fechaProcesado'), false);
});

test('decision valida body e ID y rechaza ASISTENTE, ADMIN y usuario ausente', async () => {
  for (const value of [null, undefined, 1, 0, 'yes', '1', {}]) {
    if (value && typeof value === 'object') {
      assert.throws(() => normalizeTransferDecision(value.trasladado), (error) => error.code === 'INVALID_TRANSFER_DECISION');
    } else {
      assert.throws(() => normalizeTransferDecision(value), (error) => error.code === 'INVALID_TRANSFER_DECISION');
    }
  }
  await assert.rejects(decideAccountingTransfer(user, '0', { trasladado: true }), (error) => error.code === 'INVALID_PLANILLA_ID');
  for (const actor of [{ id: 1, rol: 'ASISTENTE' }, { id: 2, rol: 'ADMIN' }, null]) {
    await assert.rejects(decideAccountingTransfer(actor, '1', { trasladado: true }), (error) => error.code === 'ACCOUNTING_ROLE_REQUIRED');
  }
});

test('primera decision gana y una decision true o false es inmutable', async () => {
  for (const existing of [true, false]) {
    planillaRepository.decideAccountingTransfer = async () => ({ decision: null, current: { id: 10, trasladado: existing } });
    await assert.rejects(
      decideAccountingTransfer(user, '10', { trasladado: !existing }),
      (error) => error.code === 'TRANSFER_DECISION_ALREADY_MADE' && error.status === 409,
    );
  }
  planillaRepository.decideAccountingTransfer = async () => ({ decision: null, current: null });
  await assert.rejects(
    decideAccountingTransfer(user, '999', { trasladado: true }),
    (error) => error.code === 'PLANILLA_NOT_FOUND' && error.status === 404,
  );
});

test('historial filtra fecha de decision, agencia, resultado y combinaciones', async () => {
  agencyRepository.findAvailableForAccounting = async () => agencies;
  const calls = [];
  planillaRepository.findAccountingTransferHistory = async (...args) => {
    calls.push(args);
    return {
      total: 1,
      summary: { ...historySummary, cantidadPlanillas: 1, cantidadRegistros: 2 },
      planillas: [{ id: 1, numeroActa: 'ACTA-H', solicitudes: 2 }],
    };
  };
  const filters = [
    { fecha: '2026-09-30' },
    { fecha: '2026-09-30', agencia: '2' },
    { fecha: '2026-09-30', resultado: 'trasladadas' },
    { fecha: '2026-09-30', agencia: '1', resultado: 'no-trasladadas' },
  ];
  for (const filter of filters) await listAccountingTransferHistory(user, filter);
  assert.equal(calls[0][0].toISOString(), '2026-09-30T06:00:00.000Z');
  assert.deepEqual(calls.map((args) => [args[2], args[3]]), [[null, null], [2, null], [null, true], [1, false]]);
});

test('historial rechaza fecha, agencia y resultado invalidos', async () => {
  agencyRepository.findAvailableForAccounting = async () => agencies;
  for (const filters of [{ fecha: '2026-02-30' }, { agencia: '999' }, { resultado: 'rechazadas' }]) {
    await assert.rejects(listAccountingTransferHistory(user, filters, { now: () => now }), PlanillaError);
  }
});

test('detalle cross-agency conserva acta, miembros y auditoria de traslado', async () => {
  const detail = {
    id: 50, agenciaId: 2, numeroActa: 'ACTA-HISTORICA', trasladado: false,
    fechaDecisionTraslado: now, decisionTrasladoUsuario: 'Contadora',
    solicitudes: [{ numeroSolicitud: '200', miembroId: '19536' }, { numeroSolicitud: '200', miembroId: '19537' }],
  };
  planillaRepository.findAccountingDetail = async () => detail;
  const result = await getAccountingPlanillaDetail(user, '50');
  assert.equal(result.numeroActa, 'ACTA-HISTORICA');
  assert.equal(result.decisionTrasladoUsuario, 'Contadora');
  assert.deepEqual(result.solicitudes.map((item) => item.miembroId), ['19536', '19537']);
});

test('solo CONTABILIDAD usa listado, historial y detalle cross-agency', async () => {
  for (const rol of ['ASISTENTE', 'ADMIN']) {
    const actor = { id: 1, rol, agenciaId: 1 };
    await assert.rejects(listAccountingPlanillas(actor), (error) => error.code === 'ACCOUNTING_ROLE_REQUIRED');
    await assert.rejects(listAccountingTransferHistory(actor), (error) => error.code === 'ACCOUNTING_ROLE_REQUIRED');
    await assert.rejects(getAccountingPlanillaDetail(actor, '1'), (error) => error.code === 'ACCOUNTING_ROLE_REQUIRED');
  }
});
