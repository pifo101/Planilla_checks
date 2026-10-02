const test = require('node:test');
const assert = require('node:assert/strict');
const planillaService = require('../src/services/planilla.service');
const {
  decideTransfer, listReceivedPlanillas, listTransferHistory, showReceivedPlanilla,
} = require('../src/controllers/accounting.controller');

const originalList = planillaService.listAccountingPlanillas;
const originalDetail = planillaService.getAccountingPlanillaDetail;
const originalDecide = planillaService.decideAccountingTransfer;
const originalHistory = planillaService.listAccountingTransferHistory;

function response() {
  return {
    statusCode: 200,
    headers: {},
    view: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers[name] = value; return this; },
    render(view, body) { this.view = view; this.body = body; return this; },
    json(body) { this.body = body; return this; },
    redirect(status, location) { this.statusCode = status; this.location = location; return this; },
  };
}

test.afterEach(() => {
  planillaService.listAccountingPlanillas = originalList;
  planillaService.getAccountingPlanillaDetail = originalDetail;
  planillaService.decideAccountingTransfer = originalDecide;
  planillaService.listAccountingTransferHistory = originalHistory;
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

test('decision entrega solo sesion, ID y body al servicio y redirige con 303', async () => {
  const sessionUser = { id: 7, rol: 'CONTABILIDAD' };
  const body = { trasladado: 'false', usuarioId: '99' };
  planillaService.decideAccountingTransfer = async (receivedUser, id, receivedBody) => {
    assert.equal(receivedUser, sessionUser);
    assert.equal(id, '41');
    assert.equal(receivedBody, body);
    return { id: 41, trasladado: false };
  };
  const res = response();
  await decideTransfer({ session: { user: sessionUser }, params: { id: '41' }, body, is: () => false }, res);
  assert.equal(res.statusCode, 303);
  assert.equal(res.location, '/contabilidad/planillas');
});

test('decision JSON devuelve conflicto controlado sin exponer SQL', async () => {
  planillaService.decideAccountingTransfer = async () => {
    throw new planillaService.PlanillaError('TRANSFER_DECISION_ALREADY_MADE', 'Decision ya tomada.', 409);
  };
  const res = response();
  await decideTransfer({ session: { user: { id: 7, rol: 'CONTABILIDAD' } }, params: { id: '41' }, body: {}, is: () => true }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error.code, 'TRANSFER_DECISION_ALREADY_MADE');
});

test('historial entrega filtros al servicio y renderiza la vista', async () => {
  const sessionUser = { id: 7, rol: 'CONTABILIDAD' };
  const query = { fecha: '2026-10-01', resultado: 'trasladadas' };
  planillaService.listAccountingTransferHistory = async (receivedUser, receivedQuery) => {
    assert.equal(receivedUser, sessionUser);
    assert.equal(receivedQuery, query);
    return { planillas: [], total: 0 };
  };
  const res = response();
  await listTransferHistory({ session: { user: sessionUser }, query }, res);
  assert.equal(res.view, 'accounting/transfer-history');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
