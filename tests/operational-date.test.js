const test = require('node:test');
const assert = require('node:assert/strict');
const {
  OPERATIONAL_TIME_ZONE,
  getOperationalDate,
  getOperationalDateRange,
  toSecondPrecision,
} = require('../src/utils/operational-date');

test('determina la fecha operativa en America/Guatemala', () => {
  assert.equal(OPERATIONAL_TIME_ZONE, 'America/Guatemala');
  assert.equal(getOperationalDate(new Date('2026-09-30T14:00:00.000Z')), '2026-09-30');
});

test('no adelanta el dia de Guatemala cuando UTC ya cambio de fecha', () => {
  assert.equal(getOperationalDate(new Date('2026-10-01T05:59:59.999Z')), '2026-09-30');
  assert.equal(getOperationalDate(new Date('2026-10-01T06:00:00.000Z')), '2026-10-01');
});

test('trunca al segundo para coincidir con DATETIME2(0) sin cruzar medianoche', () => {
  const result = toSecondPrecision(new Date('2026-10-01T05:59:59.999Z'));
  assert.equal(result.toISOString(), '2026-10-01T05:59:59.000Z');
  assert.equal(getOperationalDate(result), '2026-09-30');
});

test('construye el rango UTC del dia calendario de Guatemala', () => {
  const range = getOperationalDateRange('2026-09-30');
  assert.equal(range.startDate.toISOString(), '2026-09-30T06:00:00.000Z');
  assert.equal(range.endDate.toISOString(), '2026-10-01T06:00:00.000Z');
  assert.throws(() => getOperationalDateRange('2026-02-30'));
});
