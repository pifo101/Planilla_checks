const test = require('node:test');
const assert = require('node:assert/strict');
const { DisbursementError, normalizeDisbursement } = require('../src/services/disbursement.service');
const fixtures = require('./fixtures/disbursements');

const extractionDate = new Date('2026-09-23T12:00:00.000Z');

function normalize(distribution) {
  return normalizeDisbursement(distribution, { fechaExtraccion: extractionDate });
}

function assertKnownResult(result, expected) {
  assert.equal(result.supported, true);
  assert.equal(result.montoCancelado, expected.montoCancelado);
  assert.equal(result.descuentos, expected.descuentos);
  assert.equal(result.montoCheque, expected.montoCheque);
  assert.equal(result.montoAprobado, expected.montoAprobado);
  assert.equal(result.cantidadCheques, 1);
  assert.equal(result.metodologia, 'INDIVIDUAL');
  assert.equal(result.fechaExtraccion, extractionDate);
}

test('normaliza Dorcas sin depender del orden del arreglo', () => {
  const result = normalize([...fixtures.dorcas].reverse());

  assertKnownResult(result, {
    montoCancelado: 6476.33,
    descuentos: 600,
    montoCheque: 4923.67,
    montoAprobado: 12000,
  });
  assert.equal(result.cliente, 'DORCAS ARACELY BUCH CUÁ DE MICULAX');
  assert.equal(result.numeroCredito, '0010060111000003328');
  assert.equal(result.ordenPago, 13582);
});

test('normaliza Isabela', () => {
  assertKnownResult(normalize(fixtures.isabela), {
    montoCancelado: 18738.87,
    descuentos: 9200,
    montoCheque: 156061.13,
    montoAprobado: 184000,
  });
});

test('normaliza Catarina', () => {
  assertKnownResult(normalize(fixtures.catarina), {
    montoCancelado: 3359.96,
    descuentos: 1250,
    montoCheque: 20390.04,
    montoAprobado: 25000,
  });
});

test('normaliza Vicente', () => {
  assertKnownResult(normalize(fixtures.vicente), {
    montoCancelado: 958.93,
    descuentos: 250,
    montoCheque: 3791.07,
    montoAprobado: 5000,
  });
});

test('marca solo abono como escenario no confirmado', () => {
  const result = normalize(fixtures.onlyLoanPayment);

  assert.equal(result.supported, false);
  assert.equal(result.reason, 'ONLY_LOAN_PAYMENT_UNCONFIRMED');
  assert.equal(result.montoAprobado, null);
});

test('rechaza un arreglo vacio', () => {
  assert.throws(
    () => normalize([]),
    (error) => error instanceof DisbursementError && error.code === 'EMPTY_DISTRIBUTION',
  );
});

test('rechaza una respuesta que no es arreglo', () => {
  assert.throws(
    () => normalize({}),
    (error) => error instanceof DisbursementError && error.code === 'INVALID_WEB_SERVICE_RESPONSE',
  );
});

test('marca operaciones no ejecutadas como no finales', () => {
  const fixture = structuredClone(fixtures.dorcas);
  fixture[0].Ejecutado = false;

  assert.equal(normalize(fixture).reason, 'NON_FINAL_DISTRIBUTION');
});

test('no elige silenciosamente entre nombres distintos', () => {
  const fixture = structuredClone(fixtures.dorcas);
  fixture[1].NombreEnCheque = 'OTRA PERSONA';

  assert.equal(normalize(fixture).reason, 'MULTIPLE_CLIENT_NAMES');
});

test('marca Gasto02 distinto de cero como regla no confirmada', () => {
  const fixture = structuredClone(fixtures.dorcas);
  fixture[1].Gasto02 = 10;
  const result = normalize(fixture);

  assert.equal(result.reason, 'UNCONFIRMED_EXPENSE_FIELDS');
  assert.match(result.warnings[0], /Gasto02/);
});

test('no usa silenciosamente Gasto01 de un abono en una distribucion mixta', () => {
  const fixture = structuredClone(fixtures.dorcas);
  fixture[0].Gasto01 = 25;
  const result = normalize(fixture);

  assert.equal(result.reason, 'UNCONFIRMED_EXPENSE_FIELDS');
  assert.match(result.warnings[0], /Gasto01/);
});

test('cuenta solo emisiones de cheque para metodologia grupal sin calcular montos', () => {
  const fixture = structuredClone(fixtures.dorcas);
  fixture.push({
    ...fixture[1],
    OrdenPago: 99999,
    ValorNeto: 100,
  });
  const result = normalize(fixture);

  assert.equal(result.cantidadCheques, 2);
  assert.equal(result.metodologia, 'GRUPAL');
  assert.equal(result.supported, false);
  assert.equal(result.reason, 'GROUPED_AMOUNT_CALCULATION_UNCONFIRMED');
  assert.equal(result.montoAprobado, null);
});

test('rechaza elementos que no son objetos', () => {
  assert.throws(
    () => normalize([null]),
    (error) => error.code === 'INVALID_WEB_SERVICE_RESPONSE',
  );
});

test('rechaza montos obligatorios ausentes o con fracciones de centavo', () => {
  const missingAmount = structuredClone(fixtures.dorcas);
  delete missingAmount[1].ValorNeto;
  assert.throws(
    () => normalize(missingAmount),
    (error) => error.code === 'INVALID_WEB_SERVICE_RESPONSE',
  );

  const subCentAmount = structuredClone(fixtures.dorcas);
  subCentAmount[1].ValorNeto = 10.075;
  assert.throws(
    () => normalize(subCentAmount),
    (error) => error.code === 'INVALID_WEB_SERVICE_RESPONSE',
  );
});

test('rechaza tipos monetarios que JavaScript podria convertir implicitamente', () => {
  const fixture = structuredClone(fixtures.dorcas);
  fixture[1].Gasto01 = true;

  assert.throws(
    () => normalize(fixture),
    (error) => error.code === 'INVALID_WEB_SERVICE_RESPONSE',
  );
});
