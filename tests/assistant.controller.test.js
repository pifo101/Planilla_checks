const test = require('node:test');
const assert = require('node:assert/strict');
const planillaService = require('../src/services/planilla.service');
const actaService = require('../src/services/acta.service');
const { listSentPlanillas, showNewPlanilla, showSentPlanilla } = require('../src/controllers/assistant.controller');

const originalList = planillaService.listSentPlanillas;
const originalDetail = planillaService.getSentPlanillaDetail;
const originalGetActa = actaService.getCurrentActa;

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
  planillaService.listSentPlanillas = originalList;
  planillaService.getSentPlanillaDetail = originalDetail;
  actaService.getCurrentActa = originalGetActa;
});

test('nueva planilla muestra acta vigente o solicitud de captura sin bloquear historial', async () => {
  actaService.getCurrentActa = async () => ({ fecha: '2026-09-30', acta: null });
  const res = response();
  await showNewPlanilla({ session: { user: { id: 1 } } }, res);
  assert.equal(res.view, 'assistant/new-planilla');
  assert.deepEqual(res.body.dailyActa, { fecha: '2026-09-30', acta: null });
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('listado entrega al servicio la sesion revalidada y no usa agencia del navegador', async () => {
  const sessionUser = { id: 1, rol: 'ASISTENTE', agenciaId: 8 };
  const query = { fecha: '2026-09-29', agenciaId: '999' };
  planillaService.listSentPlanillas = async (receivedUser, receivedQuery) => {
    assert.equal(receivedUser, sessionUser);
    assert.equal(receivedQuery, query);
    return { planillas: [], selectedDate: query.fecha, total: 0, page: 1, totalPages: 1 };
  };
  const res = response();
  await listSentPlanillas({ session: { user: sessionUser }, query }, res);
  assert.equal(res.view, 'assistant/sent-planillas');
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('detalle propio se renderiza y detalle ajeno se oculta como 404', async () => {
  const req = { session: { user: { agenciaId: 8 } }, params: { id: '41' } };
  planillaService.getSentPlanillaDetail = async () => ({ id: 41, codigo: 'PLN-41' });
  const visible = response();
  await showSentPlanilla(req, visible);
  assert.equal(visible.view, 'assistant/planilla-detail');

  planillaService.getSentPlanillaDetail = async () => null;
  const hidden = response();
  await showSentPlanilla(req, hidden);
  assert.equal(hidden.statusCode, 404);
  assert.equal(hidden.view, '404');
  assert.doesNotMatch(hidden.body.errorMessage, /otra agencia|agencia 8/i);
});

test('errores SQL se sanea sin mostrar consultas ni constraints', async () => {
  planillaService.listSentPlanillas = async () => { throw new Error('SELECT dbo.planillas UQ_secreta'); };
  const originalConsoleError = console.error;
  console.error = () => {};
  const res = response();
  try {
    await listSentPlanillas({ session: { user: {} }, query: {} }, res);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(res.statusCode, 500);
  assert.equal(res.view, '500');
  assert.doesNotMatch(res.body.errorMessage, /SELECT|dbo|constraint|UQ_/i);
});
