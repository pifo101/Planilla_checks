const test = require('node:test');
const assert = require('node:assert/strict');
const actaService = require('../src/services/acta.service');
const { createDailyActa, getDailyActa } = require('../src/controllers/acta.controller');

const originalGet = actaService.getCurrentActa;
const originalCreate = actaService.createCurrentActa;

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test.afterEach(() => {
  actaService.getCurrentActa = originalGet;
  actaService.createCurrentActa = originalCreate;
});

test('GET expone el acta global vigente o null', async () => {
  actaService.getCurrentActa = async () => ({ fecha: '2026-09-30', acta: null });
  const res = response();
  await getDailyActa({}, res);
  assert.deepEqual(res.body, { success: true, data: { fecha: '2026-09-30', acta: null } });
});

test('POST entrega solo sesion y body al servicio', async () => {
  const user = { id: 1, rol: 'ASISTENTE' };
  const body = { numeroActa: 'ACTA-X', fecha: '2000-01-01', usuarioId: 999 };
  actaService.createCurrentActa = async (receivedUser, receivedBody) => {
    assert.equal(receivedUser, user);
    assert.equal(receivedBody, body);
    return { id: 1, fecha: '2026-09-30', numeroActa: 'ACTA-X' };
  };
  const res = response();
  await createDailyActa({ session: { user }, body }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.data.acta.numeroActa, 'ACTA-X');
});

test('conflicto concurrente devuelve el acta que quedo vigente', async () => {
  const existing = { id: 1, fecha: '2026-09-30', numeroActa: 'ACTA-X' };
  actaService.createCurrentActa = async () => {
    throw new actaService.ActaError('DAILY_ACTA_ALREADY_EXISTS', 'Ya existe.', 409, { acta: existing });
  };
  const res = response();
  await createDailyActa({ session: { user: {} }, body: {} }, res);
  assert.equal(res.statusCode, 409);
  assert.equal(res.body.error.code, 'DAILY_ACTA_ALREADY_EXISTS');
  assert.equal(res.body.data.acta, existing);
});
