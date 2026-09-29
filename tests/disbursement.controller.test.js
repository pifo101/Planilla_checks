const test = require('node:test');
const assert = require('node:assert/strict');

const webserviceService = require('../src/services/webservice.service');

const originalGetDistribution = webserviceService.getDistribucionDesembolso;

function loadControllerWithDistribution(distribution) {
  webserviceService.getDistribucionDesembolso = async () => distribution;
  const controllerPath = require.resolve('../src/controllers/disbursement.controller');
  delete require.cache[controllerPath];
  return require(controllerPath);
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test.afterEach(() => {
  webserviceService.getDistribucionDesembolso = originalGetDistribution;
  delete require.cache[require.resolve('../src/controllers/disbursement.controller')];
});

test('un desembolso no ejecutado devuelve error comprensible y ningun snapshot', async () => {
  const { getDistribution } = loadControllerWithDistribution({
    supported: false,
    reason: 'DISBURSEMENT_NOT_EXECUTED',
    cantidadCheques: 1,
    metodologia: 'INDIVIDUAL',
    warnings: [],
  });
  const response = responseRecorder();

  await getDistribution({ params: { numeroSolicitud: '123456' }, session: { user: { id: 10 } } }, response);

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.error.code, 'DISBURSEMENT_NOT_EXECUTED');
  assert.match(response.body.error.message, /no fue ejecutado correctamente/i);
  assert.equal(Object.hasOwn(response.body.data, 'submissionToken'), false);
});

test('solo abono devuelve la regla confirmada y ningun snapshot', async () => {
  const { getDistribution } = loadControllerWithDistribution({
    supported: false,
    reason: 'ONLY_LOAN_PAYMENT',
    cantidadCheques: 0,
    metodologia: null,
    warnings: [],
  });
  const response = responseRecorder();

  await getDistribution({ params: { numeroSolicitud: '123456' }, session: { user: { id: 10 } } }, response);

  assert.equal(response.statusCode, 422);
  assert.match(response.body.error.message, /no contiene una emision de cheque valida/i);
  assert.equal(Object.hasOwn(response.body.data, 'submissionToken'), false);
});
