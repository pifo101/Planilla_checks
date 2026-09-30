const test = require('node:test');
const assert = require('node:assert/strict');
const actaRepository = require('../src/repositories/acta.repository');
const {
  ActaError,
  MAX_ACTA_NUMBER_LENGTH,
  createCurrentActa,
  getCurrentActa,
  normalizeActaNumber,
} = require('../src/services/acta.service');

const originalFind = actaRepository.findByDate;
const originalCreate = actaRepository.create;
const assistantA = { id: 1, rol: 'ASISTENTE', agenciaId: 10 };
const assistantB = { id: 2, rol: 'ASISTENTE', agenciaId: 20 };
const now = new Date('2026-10-01T05:30:00.000Z');

test.afterEach(() => {
  actaRepository.findByDate = originalFind;
  actaRepository.create = originalCreate;
});

test('consulta la misma acta global sin usar agencia', async () => {
  const calls = [];
  const acta = { id: 1, fecha: '2026-09-30', numeroActa: 'ACTA MANUAL' };
  actaRepository.findByDate = async (fecha) => { calls.push(fecha); return acta; };
  assert.equal((await getCurrentActa({ now: () => now })).acta, acta);
  assert.equal((await getCurrentActa({ now: () => now, user: assistantB })).acta, acta);
  assert.deepEqual(calls, ['2026-09-30', '2026-09-30']);
});

test('devuelve null cuando aun no existe acta del dia', async () => {
  actaRepository.findByDate = async () => null;
  assert.deepEqual(await getCurrentActa({ now: () => now }), { fecha: '2026-09-30', acta: null });
});

test('primer asistente crea el acta con fecha y usuario controlados por servidor', async () => {
  let persisted;
  actaRepository.findByDate = async () => null;
  actaRepository.create = async (data) => { persisted = data; return { id: 1, ...data }; };
  const result = await createCurrentActa(assistantA, {
    numeroActa: '  ACTA libre-01  ', fecha: '2000-01-01', usuarioId: 999, agenciaId: 999,
  }, { now: () => now });
  assert.deepEqual(persisted, { fecha: '2026-09-30', numeroActa: 'ACTA libre-01', usuarioId: 1 });
  assert.equal(result.numeroActa, 'ACTA libre-01');
});

test('un acta existente no se reemplaza', async () => {
  const existing = { id: 1, fecha: '2026-09-30', numeroActa: 'ACTA-X' };
  let created = false;
  actaRepository.findByDate = async () => existing;
  actaRepository.create = async () => { created = true; };
  await assert.rejects(
    createCurrentActa(assistantB, { numeroActa: 'ACTA-Y' }, { now: () => now }),
    (error) => error instanceof ActaError
      && error.code === 'DAILY_ACTA_ALREADY_EXISTS'
      && error.status === 409
      && error.acta === existing,
  );
  assert.equal(created, false);
});

for (const number of [2601, 2627]) {
  test(`resuelve carrera UNIQUE SQL ${number} devolviendo el acta ganadora`, async () => {
    const winner = { id: 2, fecha: '2026-09-30', numeroActa: 'ACTA-X' };
    let reads = 0;
    actaRepository.findByDate = async () => { reads += 1; return reads === 1 ? null : winner; };
    actaRepository.create = async () => {
      const error = new Error("Violation of UNIQUE KEY constraint 'UQ_actas_diarias_fecha'.");
      error.number = number;
      throw error;
    };
    await assert.rejects(
      createCurrentActa(assistantB, { numeroActa: 'ACTA-Y' }, { now: () => now }),
      (error) => error.code === 'DAILY_ACTA_ALREADY_EXISTS' && error.acta === winner,
    );
  });
}

test('valida contenido, longitud y rol sin imponer formato empresarial', async () => {
  assert.equal(normalizeActaNumber(' Acta 01/A '), 'Acta 01/A');
  for (const value of ['', '   ', 'ACTA\nX', 'x'.repeat(MAX_ACTA_NUMBER_LENGTH + 1), null]) {
    assert.throws(() => normalizeActaNumber(value), (error) => error.code === 'INVALID_ACTA_NUMBER');
  }
  await assert.rejects(
    createCurrentActa({ ...assistantA, rol: 'ADMIN' }, { numeroActa: 'ACTA-X' }, { now: () => now }),
    (error) => error.code === 'FORBIDDEN' && error.status === 403,
  );
});
