const test = require('node:test');
const assert = require('node:assert/strict');
const planillaService = require('../src/services/planilla.service');
const { listReceivedPlanillas, showReceivedPlanilla } = require('../src/controllers/accounting.controller');

const originalList = planillaService.listAccountingPlanillas;
const originalDetail = planillaService.getAccountingPlanillaDetail;

function response() {
  return {
    statusCode: 200,
    headers: {},
    view: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    render(view, body) { this.view = view; this.body = body; return this; },
  };
}

test.afterEach(() => {
  planillaService.listAccountingPlanillas = originalList;
  planillaService.getAccountingPlanillaDetail = originalDetail;
});

test('listado entrega usuario y filtros al servicio y desactiva cache', async () => {
  const sessionUser = { id: 1, rol: 'CONTABILIDAD' };
  const query = { fecha: '2026-10-01', agencia: '2', page: '1' };
  planillaService.listAccountingPlanillas = async (receivedUser, receivedQuery) => {
    assert.equal(receivedUser, sessionUser);
    assert.equal(receivedQuery, query);
    return { planillas: [], total: 0, page: 1, totalPages: 1 };
  };
  const res = response();
  await listReceivedPlanillas({ session: { user: sessionUser }, query }, res);
  assert.equal(res.view, 'accounting/received-planillas');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('detalle de cualquier agencia se renderiza y el inexistente produce 404', async () => {
  const req = { session: { user: { rol: 'CONTABILIDAD' } }, params: { id: '41' } };
  planillaService.getAccountingPlanillaDetail = async () => ({ id: 41, codigo: 'PLN-41', agenciaId: 9 });
  const visible = response();
  await showReceivedPlanilla(req, visible);
  assert.equal(visible.view, 'accounting/planilla-detail');
  assert.equal(visible.headers['Cache-Control'], 'no-store');

  planillaService.getAccountingPlanillaDetail = async () => null;
  const missing = response();
  await showReceivedPlanilla(req, missing);
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.view, '404');
});

test('errores SQL se sanea sin exponer consultas ni constraints', async () => {
  planillaService.listAccountingPlanillas = async () => { throw new Error('SELECT dbo.planillas UQ_secreta'); };
  const originalConsoleError = console.error;
  console.error = () => {};
  const res = response();
  try {
    await listReceivedPlanillas({ session: { user: {} }, query: {} }, res);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(res.statusCode, 500);
  assert.equal(res.view, '500');
  assert.doesNotMatch(res.body.errorMessage, /SELECT|dbo|constraint|UQ_/i);
});
