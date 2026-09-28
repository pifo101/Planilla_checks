const test = require('node:test');
const assert = require('node:assert/strict');
const { configureIntegrationEnvironment } = require('../scripts/integration-test-config');

test('configura una base separada reconocible como base de pruebas', () => {
  const env = { DB_DATABASE: 'PlanillaChecksDB', TEST_DB_DATABASE: 'PlanillaChecksTestDB' };
  assert.equal(configureIntegrationEnvironment(env), 'PlanillaChecksTestDB');
  assert.equal(env.NODE_ENV, 'test');
  assert.equal(env.DB_DATABASE, 'PlanillaChecksTestDB');
});

test('integracion rechaza una base que no sea de pruebas', () => {
  assert.throws(
    () => configureIntegrationEnvironment({ DB_DATABASE: 'PlanillaChecksDB', TEST_DB_DATABASE: 'PlanillaChecksProd' }),
    /termine en TestDB/,
  );
});

test('integracion rechaza reutilizar la base de desarrollo', () => {
  assert.throws(
    () => configureIntegrationEnvironment({ DB_DATABASE: 'SameTestDB', TEST_DB_DATABASE: 'SameTestDB' }),
    /distinta de DB_DATABASE/,
  );
});

test('integracion rechaza una configuracion sin base de desarrollo declarada', () => {
  assert.throws(
    () => configureIntegrationEnvironment({ TEST_DB_DATABASE: 'PlanillaChecksTestDB' }),
    /DB_DATABASE es obligatorio/,
  );
});
