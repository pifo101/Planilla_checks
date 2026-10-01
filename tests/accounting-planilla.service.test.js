const test = require('node:test');
const assert = require('node:assert/strict');
const agencyRepository = require('../src/repositories/agency.repository');
const planillaRepository = require('../src/repositories/planilla.repository');
const {
  HISTORY_PAGE_SIZE,
  PlanillaError,
  getAccountingPlanillaDetail,
  listAccountingPlanillas,
  normalizeAccountingAgency,
} = require('../src/services/planilla.service');

const originalFindAgencies = agencyRepository.findAvailableForAccounting;
const originalFindList = planillaRepository.findForAccounting;
const originalFindDetail = planillaRepository.findAccountingDetail;
const user = { id: 30, rol: 'CONTABILIDAD', agenciaId: null };
const now = new Date('2026-10-01T14:00:00.000Z');
const agencies = [
  { id: 1, codigo: 'A', nombre: 'Agencia A', activo: true },
  { id: 2, codigo: 'B', nombre: 'Agencia B', activo: false },
];
const emptySummary = {
  cantidadPlanillas: 0,
  cantidadRegistros: 0,
  cantidadEnviadas: 0,
  cantidadRecibidas: 0,
  cantidadProcesadas: 0,
  totalAprobado: '0.00',
  totalCancelado: '0.00',
  totalDescuentos: '0.00',
  totalMontoCheque: '0.00',
};

test.afterEach(() => {
  agencyRepository.findAvailableForAccounting = originalFindAgencies;
  planillaRepository.findForAccounting = originalFindList;
  planillaRepository.findAccountingDetail = originalFindDetail;
});

test('contabilidad lista todas las agencias con fecha Guatemala y totales exactos', async () => {
  agencyRepository.findAvailableForAccounting = async () => agencies;
  let received;
  const rows = [
    { id: 10, agenciaId: 1, totalAprobado: '100.10', totalCancelado: '0.00' },
    { id: 11, agenciaId: 2, totalAprobado: '300.30', totalCancelado: '50.05' },
  ];
  const summary = { ...emptySummary, cantidadPlanillas: 2, cantidadRegistros: 4, totalAprobado: '400.40' };
  planillaRepository.findForAccounting = async (...args) => {
    received = args;
    return { total: 2, summary, planillas: rows };
  };

  const result = await listAccountingPlanillas(user, {}, { now: () => now });

  assert.equal(received[0].toISOString(), '2026-10-01T06:00:00.000Z');
  assert.equal(received[1].toISOString(), '2026-10-02T06:00:00.000Z');
  assert.deepEqual(received.slice(2), [null, 1, HISTORY_PAGE_SIZE]);
  assert.deepEqual(result.planillas.map((row) => row.agenciaId), [1, 2]);
  assert.equal(result.summary.totalAprobado, '400.40');
  assert.equal(result.selectedDate, '2026-10-01');
  assert.equal(result.agencies[1].activo, false);
});

test('aplica agencia, fecha y pagina combinadas sin perder precision monetaria', async () => {
  agencyRepository.findAvailableForAccounting = async () => agencies;
  let received;
  planillaRepository.findForAccounting = async (...args) => {
    received = args;
    return {
      total: 21,
      summary: { ...emptySummary, totalCancelado: '125.37', totalDescuentos: '10.11' },
      planillas: [{ id: 12, agenciaId: 2, totalMontoCheque: '999999999999.99' }],
    };
  };

  const result = await listAccountingPlanillas(user, {
    fecha: '2026-09-30', agencia: '2', page: '2',
  }, { now: () => now });

  assert.equal(received[0].toISOString(), '2026-09-30T06:00:00.000Z');
  assert.deepEqual(received.slice(2), [2, 2, HISTORY_PAGE_SIZE]);
  assert.equal(result.selectedAgencyId, 2);
  assert.equal(result.totalPages, 2);
  assert.equal(result.summary.totalCancelado, '125.37');
});

test('admite cero resultados y rechaza una pagina fuera del conjunto', async () => {
  agencyRepository.findAvailableForAccounting = async () => agencies;
  planillaRepository.findForAccounting = async () => ({ total: 0, summary: emptySummary, planillas: [] });
  const result = await listAccountingPlanillas(user, {}, { now: () => now });
  assert.deepEqual(result.planillas, []);
  assert.equal(result.totalPages, 1);

  await assert.rejects(
    listAccountingPlanillas(user, { page: '2' }, { now: () => now }),
    (error) => error.code === 'INVALID_HISTORY_PAGE',
  );
});

test('rechaza agencia invalida, inexistente y valores no seguros antes de consultar planillas', async () => {
  for (const value of ['0', '-1', '1.2', 'abc', '1 OR 1=1', String(Number.MAX_SAFE_INTEGER + 1)]) {
    assert.throws(() => normalizeAccountingAgency(value), (error) => error.code === 'INVALID_AGENCY');
  }
  agencyRepository.findAvailableForAccounting = async () => agencies;
  let called = false;
  planillaRepository.findForAccounting = async () => { called = true; };
  await assert.rejects(
    listAccountingPlanillas(user, { agencia: '999' }, { now: () => now }),
    (error) => error.code === 'INVALID_AGENCY',
  );
  assert.equal(called, false);
});

test('rechaza fecha y pagina invalidas', async () => {
  agencyRepository.findAvailableForAccounting = async () => agencies;
  for (const filters of [{ fecha: '2026-02-30' }, { fecha: "2026-10-01' OR 1=1--" }, { page: '0' }, { page: '-1' }]) {
    await assert.rejects(listAccountingPlanillas(user, filters, { now: () => now }), PlanillaError);
  }
});

test('solamente CONTABILIDAD puede usar los contratos cross-agency', async () => {
  let called = false;
  agencyRepository.findAvailableForAccounting = async () => { called = true; return agencies; };
  for (const rol of ['ASISTENTE', 'ADMIN']) {
    await assert.rejects(
      listAccountingPlanillas({ id: 1, rol, agenciaId: 1 }, {}, { now: () => now }),
      (error) => error.code === 'ACCOUNTING_ROLE_REQUIRED' && error.status === 403,
    );
    await assert.rejects(
      getAccountingPlanillaDetail({ id: 1, rol, agenciaId: 1 }, '10'),
      (error) => error.code === 'ACCOUNTING_ROLE_REQUIRED' && error.status === 403,
    );
  }
  assert.equal(called, false);
});

test('detalle permite cualquier agencia, conserva miembros y acta historica', async () => {
  const detail = {
    id: 50,
    agenciaId: 2,
    numeroActa: 'ACTA-HISTORICA',
    totalAprobado: '6000.30',
    solicitudes: [
      { numeroSolicitud: '100', miembroId: null, montoCancelado: '0.00' },
      { numeroSolicitud: '200', miembroId: '19536', montoCancelado: '100.10' },
      { numeroSolicitud: '200', miembroId: '19537', montoCancelado: '200.20' },
    ],
  };
  let received;
  planillaRepository.findAccountingDetail = async (id) => { received = id; return detail; };
  const result = await getAccountingPlanillaDetail(user, '50');
  assert.equal(received, 50);
  assert.equal(result.numeroActa, 'ACTA-HISTORICA');
  assert.deepEqual(result.solicitudes.map((item) => item.miembroId), [null, '19536', '19537']);
});

test('detalle admite acta NULL, devuelve inexistente y rechaza ID invalido', async () => {
  planillaRepository.findAccountingDetail = async (id) => (id === 5 ? { id, numeroActa: null, solicitudes: [] } : null);
  assert.equal((await getAccountingPlanillaDetail(user, '5')).numeroActa, null);
  assert.equal(await getAccountingPlanillaDetail(user, '999'), null);
  for (const value of ['0', '-1', 'x', String(Number.MAX_SAFE_INTEGER + 1)]) {
    await assert.rejects(getAccountingPlanillaDetail(user, value), (error) => error.code === 'INVALID_PLANILLA_ID');
  }
});
