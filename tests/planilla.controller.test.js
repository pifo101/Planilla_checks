const test = require('node:test');
const assert = require('node:assert/strict');
const planillaService = require('../src/services/planilla.service');
const { submitPlanilla } = require('../src/controllers/planilla.controller');

const originalCreatePlanilla = planillaService.createPlanilla;

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test.afterEach(() => {
  planillaService.createPlanilla = originalCreatePlanilla;
});

test('responde 201 y entrega al servicio la sesion y el body recibidos', async () => {
  const user = { id: 7, rol: 'ASISTENTE', agenciaId: 8 };
  const body = { solicitudes: [{ numeroSolicitud: '123' }] };
  planillaService.createPlanilla = async (receivedUser, receivedBody) => {
    assert.equal(receivedUser, user);
    assert.equal(receivedBody, body);
    return { id: 9, codigo: 'PLN-TEST', estado: 'ENVIADA', solicitudes: [] };
  };
  const res = response();

  await submitPlanilla({ session: { user }, body }, res);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, {
    success: true,
    data: { planilla: { id: 9, codigo: 'PLN-TEST', estado: 'ENVIADA' } },
  });
});

test('expone errores de dominio sin detalles SQL', async () => {
  planillaService.createPlanilla = async () => {
    throw new planillaService.PlanillaError('CHECK_ALREADY_USED', 'El cheque ya fue utilizado.', 409);
  };
  const res = response();
  await submitPlanilla({ session: { user: {} }, body: {} }, res);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body.error, { code: 'CHECK_ALREADY_USED', message: 'El cheque ya fue utilizado.' });
});

test('sanea errores inesperados de persistencia', async () => {
  planillaService.createPlanilla = async () => { throw new Error('SELECT secreto desde dbo.planillas'); };
  const originalConsoleError = console.error;
  console.error = () => {};
  const res = response();
  try {
    await submitPlanilla({ session: { user: {} }, body: {} }, res);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(res.statusCode, 500);
  assert.equal(res.body.error.code, 'PLANILLA_PERSISTENCE_FAILED');
  assert.doesNotMatch(res.body.error.message, /SELECT|dbo/);
});
