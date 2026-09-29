const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SubmissionTokenError,
  TOKEN_TTL_MS,
  createSubmissionToken,
  verifySubmissionToken,
} = require('../src/services/planilla-token.service');

const now = new Date('2026-09-29T14:00:00.000Z');
const distribution = {
  cliente: 'CLIENTE PRUEBA',
  metodologia: 'INDIVIDUAL',
  montoAprobado: 12000,
  montoCancelado: 2500,
  descuentos: 500,
  montoCheque: 9000,
};

test('firma y verifica el snapshot normalizado ligado al usuario', () => {
  const token = createSubmissionToken(10, '123456', distribution, { now: () => now, secret: 'test-secret' });
  const payload = verifySubmissionToken(token, 10, { now: () => now, secret: 'test-secret' });

  assert.equal(payload.numeroSolicitud, '123456');
  assert.equal(payload.montoAprobadoCentavos, 1_200_000);
  assert.equal(payload.montoCanceladoCentavos, 250_000);
  assert.equal(payload.descuentosCentavos, 50_000);
  assert.equal(payload.montoChequeCentavos, 900_000);
});

test('rechaza firma alterada, usuario distinto y token vencido', () => {
  const token = createSubmissionToken(10, '123456', distribution, { now: () => now, secret: 'test-secret' });
  for (const action of [
    () => verifySubmissionToken(`${token.slice(0, -1)}x`, 10, { now: () => now, secret: 'test-secret' }),
    () => verifySubmissionToken(token, 11, { now: () => now, secret: 'test-secret' }),
    () => verifySubmissionToken(token, 10, {
      now: () => new Date(now.getTime() + TOKEN_TTL_MS + 1),
      secret: 'test-secret',
    }),
  ]) {
    assert.throws(action, SubmissionTokenError);
  }
});
