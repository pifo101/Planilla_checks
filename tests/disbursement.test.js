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

test('normaliza una distribucion individual mixta sin depender del orden del arreglo', () => {
  const result = normalize([...fixtures.individualWithLoanPayment].reverse());

  assertKnownResult(result, {
    montoCancelado: 100,
    descuentos: 25,
    montoCheque: 875,
    montoAprobado: 1000,
  });
  assert.equal(result.cliente, 'CLIENTE PRUEBA UNO');
  assert.equal(result.numeroCredito, 'TEST-CREDITO-001');
  assert.equal(result.ordenPago, 10001);
});

test('acepta FormaDesembolso numerico 1 como emision de cheque', () => {
  const cheque = structuredClone(fixtures.individualWithLoanPayment[1]);
  assert.equal(cheque.FormaDesembolso, 1);
  const result = normalize([cheque]);
  assert.equal(result.supported, true);
  assert.equal(result.metodologia, 'INDIVIDUAL');
});

test('rechaza FormaDesembolso string aunque represente el numero 1', () => {
  const fixture = structuredClone(fixtures.individualWithLoanPayment);
  fixture[1].FormaDesembolso = '1';
  assert.throws(
    () => normalize(fixture),
    (error) => error.code === 'INVALID_WEB_SERVICE_RESPONSE' && /FormaDesembolso/.test(error.message),
  );
});

test('acepta FormaDesembolso numerico 3 como abono reconocido', () => {
  const abono = structuredClone(fixtures.onlyLoanPayment[0]);
  assert.equal(abono.FormaDesembolso, 3);
  const result = normalize([abono]);
  assert.equal(result.reason, 'ONLY_LOAN_PAYMENT_UNCONFIRMED');
});

test('normaliza una distribucion individual pequena', () => {
  assertKnownResult(normalize(fixtures.individualSmallDisbursement), {
    montoCancelado: 200,
    descuentos: 50,
    montoCheque: 1750,
    montoAprobado: 2000,
  });
});

test('normaliza una distribucion individual estandar', () => {
  assertKnownResult(normalize(fixtures.individualStandardDisbursement), {
    montoCancelado: 300,
    descuentos: 75,
    montoCheque: 2625,
    montoAprobado: 3000,
  });
});

test('normaliza una distribucion individual grande', () => {
  assertKnownResult(normalize(fixtures.individualLargeDisbursement), {
    montoCancelado: 400,
    descuentos: 100,
    montoCheque: 3500,
    montoAprobado: 4000,
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
  const fixture = structuredClone(fixtures.individualWithLoanPayment);
  fixture[0].Ejecutado = false;

  assert.equal(normalize(fixture).reason, 'NON_FINAL_DISTRIBUTION');
});

test('no elige silenciosamente entre nombres distintos', () => {
  const fixture = structuredClone(fixtures.individualWithLoanPayment);
  fixture[1].NombreEnCheque = 'OTRA PERSONA';

  assert.equal(normalize(fixture).reason, 'MULTIPLE_CLIENT_NAMES');
});

test('usa solo Gasto01 del cheque aunque Gasto02-Gasto10 tengan valores', () => {
  const fixture = structuredClone(fixtures.individualWithLoanPayment);
  fixture[1].Gasto01 = 600;
  for (let expenseNumber = 2; expenseNumber <= 10; expenseNumber += 1) {
    const field = `Gasto${String(expenseNumber).padStart(2, '0')}`;
    fixture[0][field] = expenseNumber * 100;
    fixture[1][field] = expenseNumber * 200;
  }
  const result = normalize(fixture);

  assert.equal(result.supported, true);
  assert.equal(result.descuentos, 600);
  assert.equal(result.montoAprobado, 1575);
});

test('ignora Gasto01 no cero del abono en una distribucion individual', () => {
  const fixture = structuredClone(fixtures.individualWithLoanPayment);
  fixture[0].ValorNeto = 2500;
  fixture[0].Gasto01 = 999;
  fixture[1].ValorNeto = 9000;
  fixture[1].Gasto01 = 500;
  const result = normalize(fixture);

  assertKnownResult(result, {
    montoCancelado: 2500,
    descuentos: 500,
    montoCheque: 9000,
    montoAprobado: 12000,
  });
});

test('no calcula un grupo cuyos miembros no tienen identidad confirmada', () => {
  const fixture = structuredClone(fixtures.individualWithLoanPayment);
  fixture[0].Gasto01 = 999;
  fixture.push({
    ...fixture[1],
    OrdenPago: 99999,
    ValorNeto: 100,
  });
  const result = normalize(fixture);

  assert.equal(result.cantidadCheques, 2);
  assert.equal(result.metodologia, 'GRUPAL');
  assert.equal(result.supported, false);
  assert.equal(result.reason, 'GROUPED_MEMBER_IDENTITY_UNCONFIRMED');
  assert.equal(result.montoAprobado, null);
});

test('convierte N emisiones identificadas sin abonos en N miembros calculados', () => {
  const fixture = [1, 2, 3].map((id) => ({
    ...structuredClone(fixtures.individualWithLoanPayment[1]),
    ID: 19000 + id,
    NombreEnCheque: `MIEMBRO ${id}`,
    OrdenPago: 13000 + id,
    Gasto01: 100,
    ValorNeto: 1900,
  }));
  const result = normalize(fixture);

  assert.equal(result.supported, true);
  assert.equal(result.metodologia, 'GRUPAL');
  assert.equal(result.miembros.length, 3);
  assert.deepEqual(result.miembros.map((item) => item.miembroId), ['19001', '19002', '19003']);
  assert.deepEqual(result.miembros.map((item) => item.cliente), ['MIEMBRO 1', 'MIEMBRO 2', 'MIEMBRO 3']);
  assert.ok(result.miembros.every((item) => item.calculado && item.montoAprobado === 2000));
});

test('no inventa asociacion de abonos para miembros grupales', () => {
  const cheques = [1, 2].map((id) => ({
    ...structuredClone(fixtures.individualWithLoanPayment[1]),
    ID: 19000 + id,
    NombreEnCheque: `MIEMBRO ${id}`,
  }));
  const result = normalize([...cheques, structuredClone(fixtures.individualWithLoanPayment[0])]);

  assert.equal(result.reason, 'GROUPED_LOAN_PAYMENT_ASSOCIATION_UNCONFIRMED');
  assert.ok(result.miembros.every((item) => item.calculado === false && item.montoAprobado === null));
});

test('identifica datos incompletos de un miembro grupal', () => {
  const cheques = [1, 2].map((id) => ({
    ...structuredClone(fixtures.individualWithLoanPayment[1]),
    ID: 19000 + id,
    NombreEnCheque: id === 1 ? 'MIEMBRO 1' : '',
  }));
  const result = normalize(cheques);

  assert.equal(result.supported, false);
  assert.equal(result.reason, 'GROUPED_MEMBER_DATA_INVALID');
  assert.equal(result.miembros[0].calculado, true);
  assert.equal(result.miembros[1].calculado, false);
});

test('rechaza elementos que no son objetos', () => {
  assert.throws(
    () => normalize([null]),
    (error) => error.code === 'INVALID_WEB_SERVICE_RESPONSE',
  );
});

test('rechaza montos obligatorios ausentes o con fracciones de centavo', () => {
  const missingAmount = structuredClone(fixtures.individualWithLoanPayment);
  delete missingAmount[1].ValorNeto;
  assert.throws(
    () => normalize(missingAmount),
    (error) => error.code === 'INVALID_WEB_SERVICE_RESPONSE',
  );

  const subCentAmount = structuredClone(fixtures.individualWithLoanPayment);
  subCentAmount[1].ValorNeto = 10.075;
  assert.throws(
    () => normalize(subCentAmount),
    (error) => error.code === 'INVALID_WEB_SERVICE_RESPONSE',
  );
});

test('rechaza tipos monetarios que JavaScript podria convertir implicitamente', () => {
  const fixture = structuredClone(fixtures.individualWithLoanPayment);
  fixture[1].Gasto01 = true;

  assert.throws(
    () => normalize(fixture),
    (error) => error.code === 'INVALID_WEB_SERVICE_RESPONSE',
  );
});

test('calcula valores monetarios dentro del rango seguro', () => {
  const result = normalize(fixtures.individualWithLoanPayment);
  for (const amount of [result.montoAprobado, result.montoCancelado, result.descuentos, result.montoCheque]) {
    assert.equal(Number.isSafeInteger(Math.round(amount * 100)), true);
  }
});

test('rechaza un valor monetario fuera del rango seguro', () => {
  const fixture = structuredClone(fixtures.individualWithLoanPayment);
  const cents = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
  fixture[1].ValorNeto = `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`;
  assert.throws(
    () => normalize(fixture),
    (error) => error.code === 'INVALID_WEB_SERVICE_RESPONSE' && /maximo permitido/.test(error.message),
  );
});

test('rechaza una suma monetaria que excede el rango seguro', () => {
  const fixture = structuredClone(fixtures.individualWithLoanPayment);
  const maxCents = BigInt(Number.MAX_SAFE_INTEGER);
  fixture[0].ValorNeto = 0;
  fixture[1].ValorNeto = `${maxCents / 100n}.${String(maxCents % 100n).padStart(2, '0')}`;
  fixture[1].Gasto01 = '0.01';
  assert.throws(
    () => normalize(fixture),
    (error) => error.code === 'INVALID_WEB_SERVICE_RESPONSE' && /suma de los montos excede/.test(error.message),
  );
});

test('rechaza centavos seguros que no pueden serializarse sin perdida', () => {
  const fixture = structuredClone(fixtures.individualWithLoanPayment);
  const maxCents = BigInt(Number.MAX_SAFE_INTEGER);
  fixture[0].ValorNeto = 0;
  fixture[1].ValorNeto = `${maxCents / 100n}.${String(maxCents % 100n).padStart(2, '0')}`;
  fixture[1].Gasto01 = 0;
  assert.throws(
    () => normalize(fixture),
    (error) => error.code === 'INVALID_WEB_SERVICE_RESPONSE' && /precision de centavos/.test(error.message),
  );
});
