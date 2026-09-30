const test = require('node:test');
const assert = require('node:assert/strict');
const planillaRepository = require('../src/repositories/planilla.repository');
const {
  HISTORY_PAGE_SIZE,
  PlanillaError,
  getSentPlanillaDetail,
  listSentPlanillas,
  normalizeHistoryDate,
  normalizePage,
  normalizePlanillaId,
} = require('../src/services/planilla.service');

const originalFindSent = planillaRepository.findSentByAgencyAndDate;
const originalFindDetail = planillaRepository.findDetailForAgency;
const user = { id: 10, rol: 'ASISTENTE', agenciaId: 20 };
const now = new Date('2026-09-29T14:00:00.000Z');

test.afterEach(() => {
  planillaRepository.findSentByAgencyAndDate = originalFindSent;
  planillaRepository.findDetailForAgency = originalFindDetail;
});

test('lista solamente la agencia autenticada con fecha, rango y paginacion normalizados', async () => {
  let received;
  const row = {
    id: 1,
    cantidadRegistros: 3,
    totalAprobado: 6000.30,
    totalCancelado: 100.10,
    totalDescuentos: 200.10,
    totalMontoCheque: 5700.10,
  };
  planillaRepository.findSentByAgencyAndDate = async (...args) => {
    received = args;
    return { total: 21, planillas: [row] };
  };

  const result = await listSentPlanillas(user, {
    fecha: '2026-09-28',
    page: '2',
    agenciaId: '999',
  }, { now: () => now });

  assert.equal(received[0], 20);
  assert.equal(received[1].toISOString(), '2026-09-28T06:00:00.000Z');
  assert.equal(received[2].toISOString(), '2026-09-29T06:00:00.000Z');
  assert.deepEqual(received.slice(3), [2, HISTORY_PAGE_SIZE]);
  assert.equal(result.totalPages, 2);
  assert.equal(result.planillas[0], row);
  assert.equal(result.planillas[0].totalAprobado, 6000.30);
});

test('usa la fecha Guatemala actual por defecto y admite cero resultados', async () => {
  planillaRepository.findSentByAgencyAndDate = async () => ({ total: 0, planillas: [] });
  const result = await listSentPlanillas(user, {}, { now: () => now });
  assert.equal(result.selectedDate, '2026-09-29');
  assert.equal(result.page, 1);
  assert.equal(result.totalPages, 1);
  assert.deepEqual(result.planillas, []);
});

test('el detalle conserva el snapshot historico aunque exista otra acta vigente', async () => {
  planillaRepository.findDetailForAgency = async () => ({ id: 41, numeroActa: 'ACTA-HISTORICA', solicitudes: [] });
  const result = await getSentPlanillaDetail(user, '41');
  assert.equal(result.numeroActa, 'ACTA-HISTORICA');
});

test('rechaza fechas, paginas e IDs invalidos', () => {
  for (const value of ['0000-01-01', '2026-02-30', '29/09/2026', '2026-9-29', "2026-09-29' OR 1=1--"]) {
    assert.throws(() => normalizeHistoryDate(value, now), (error) => error.code === 'INVALID_HISTORY_DATE');
  }
  for (const value of ['0', '-1', '1.5', 'x', String(Number.MAX_SAFE_INTEGER + 1)]) {
    assert.throws(() => normalizePage(value), (error) => error.code === 'INVALID_HISTORY_PAGE');
  }
  for (const value of ['0', '-1', '1.5', 'abc', '1 OR 1=1', String(Number.MAX_SAFE_INTEGER + 1)]) {
    assert.throws(() => normalizePlanillaId(value), (error) => error.code === 'INVALID_PLANILLA_ID');
  }
});

test('rechaza roles incorrectos y asistentes sin agencia antes de consultar SQL', async () => {
  let called = false;
  planillaRepository.findSentByAgencyAndDate = async () => { called = true; };
  for (const invalidUser of [{ ...user, rol: 'CONTABILIDAD' }, { ...user, agenciaId: null }]) {
    await assert.rejects(
      listSentPlanillas(invalidUser, {}, { now: () => now }),
      (error) => error instanceof PlanillaError && error.code === 'ASSISTANT_AGENCY_REQUIRED' && error.status === 403,
    );
  }
  assert.equal(called, false);
});

test('detalle exige simultaneamente ID valido y agencia autenticada', async () => {
  let received;
  const detail = {
    id: 41,
    solicitudes: [
      { numeroSolicitud: '100', miembroId: null, montoAprobado: 1000.10 },
      { numeroSolicitud: '200', miembroId: '19536', montoAprobado: 2000.10 },
      { numeroSolicitud: '200', miembroId: '19537', montoAprobado: 3000.10 },
    ],
  };
  planillaRepository.findDetailForAgency = async (...args) => { received = args; return detail; };

  const result = await getSentPlanillaDetail(user, '41');
  assert.deepEqual(received, [41, 20]);
  assert.equal(result.solicitudes.length, 3);
  assert.deepEqual(result.solicitudes.map((item) => item.miembroId), [null, '19536', '19537']);
});

test('detalle ajeno o inexistente no es visible', async () => {
  planillaRepository.findDetailForAgency = async () => null;
  assert.equal(await getSentPlanillaDetail(user, '999'), null);
});
