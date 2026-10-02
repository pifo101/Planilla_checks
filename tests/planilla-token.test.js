const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SubmissionTokenError,
  TOKEN_TTL_MS,
  createGroupFingerprint,
  createSubmissionToken,
  verifySubmissionToken,
} = require('../src/services/planilla-token.service');

const now = new Date('2026-09-29T14:00:00.000Z');
const distribution = {
  fechaExtraccion: new Date('2026-09-29T13:45:12.789Z'),
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
  assert.equal(payload.fechaExtraccion, '2026-09-29T13:45:12.000Z');
  assert.equal(payload.montoAprobadoCentavos, 1_200_000);
  assert.equal(payload.montoCanceladoCentavos, 250_000);
  assert.equal(payload.descuentosCentavos, 50_000);
  assert.equal(payload.montoChequeCentavos, 900_000);
});

test('la fecha de extraccion forma parte del HMAC y no puede sustituirse', () => {
  const token = createSubmissionToken(10, '123456', distribution, { now: () => now, secret: 'test-secret' });
  const [encodedPayload, tokenSignature] = token.split('.');
  const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  payload.fechaExtraccion = '2026-09-29T14:00:00.000Z';
  const alteredPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

  assert.throws(
    () => verifySubmissionToken(`${alteredPayload}.${tokenSignature}`, 10, { now: () => now, secret: 'test-secret' }),
    SubmissionTokenError,
  );
});

test('consultas realizadas en segundos distintos producen snapshots distintos', () => {
  const first = createSubmissionToken(10, '123456', distribution, { now: () => now, secret: 'test-secret' });
  const second = createSubmissionToken(10, '123456', {
    ...distribution,
    fechaExtraccion: new Date('2026-09-29T13:45:13.000Z'),
  }, { now: () => now, secret: 'test-secret' });

  assert.notEqual(first, second);
  assert.notEqual(
    createGroupFingerprint(['19536', '19537'], distribution.fechaExtraccion),
    createGroupFingerprint(['19536', '19537'], new Date('2026-09-29T13:45:13.000Z')),
  );
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

test('protege identidad y cantidad de miembros en snapshots grupales', () => {
  const grupoFingerprint = createGroupFingerprint(['19536', '19537'], distribution.fechaExtraccion);
  const token = createSubmissionToken(10, '123456', {
    ...distribution,
    metodologia: 'GRUPAL',
    miembroId: '19536',
    cantidadMiembros: 5,
    grupoFingerprint,
  }, { now: () => now, secret: 'test-secret' });
  const payload = verifySubmissionToken(token, 10, { now: () => now, secret: 'test-secret' });

  assert.equal(payload.version, 2);
  assert.equal(payload.miembroId, '19536');
  assert.equal(payload.cantidadMiembros, 5);
  assert.equal(payload.grupoFingerprint, grupoFingerprint);
});
