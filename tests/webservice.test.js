const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getDistribucionDesembolso,
  validateRequestNumber,
} = require('../src/services/webservice.service');
const fixtures = require('./fixtures/disbursements');

const baseUrl = 'http://service.example.test/root';

test('construye un GET seguro y normaliza la respuesta', async () => {
  let capturedUrl;
  let capturedOptions;
  const result = await getDistribucionDesembolso('123456', {
    baseUrl,
    now: () => new Date('2026-09-23T12:00:00.000Z'),
    fetchImpl: async (url, options) => {
      capturedUrl = url;
      capturedOptions = options;
      return { ok: true, json: async () => fixtures.dorcas };
    },
  });

  assert.equal(capturedUrl, `${baseUrl}/RecuperarDistribucionDesembolso/123456`);
  assert.equal(capturedOptions.method, 'GET');
  assert.equal(capturedOptions.body, undefined);
  assert.equal(capturedOptions.redirect, 'manual');
  assert.equal(result.montoAprobado, 12000);
});

test('rechaza numeros de solicitud inseguros', async () => {
  const invalidValues = ['', '../123', '123?x=1', 'http://example.test', '12-34', '1'.repeat(31)];

  for (const value of invalidValues) {
    assert.throws(
      () => validateRequestNumber(value),
      (error) => error.code === 'INVALID_REQUEST_NUMBER',
    );
  }
});

test('distingue respuestas HTTP no exitosas', async () => {
  await assert.rejects(
    getDistribucionDesembolso('123', {
      baseUrl,
      fetchImpl: async () => ({ ok: false, status: 500 }),
    }),
    (error) => error.code === 'WEB_SERVICE_UNAVAILABLE' && error.status === 502,
  );
});

test('distingue JSON invalido', async () => {
  await assert.rejects(
    getDistribucionDesembolso('123', {
      baseUrl,
      fetchImpl: async () => ({
        ok: true,
        json: async () => { throw new SyntaxError('invalid json'); },
      }),
    }),
    (error) => error.code === 'INVALID_WEB_SERVICE_RESPONSE',
  );
});

test('cancela la consulta al superar el timeout', async () => {
  const fetchImpl = (url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    });
  });

  await assert.rejects(
    getDistribucionDesembolso('123', { baseUrl, fetchImpl, timeoutMs: 5 }),
    (error) => error.code === 'WEB_SERVICE_TIMEOUT' && error.status === 504,
  );
});
