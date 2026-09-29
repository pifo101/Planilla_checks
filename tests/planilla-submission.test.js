const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildSubmission,
  createPlanillaSubmitter,
} = require('../public/js/planilla-submission');

function draftRequest() {
  return {
    numeroSolicitud: '123456',
    cliente: 'CLIENTE PRUEBA',
    numeroCheque: 'CHK-100',
    submissionToken: 'snapshot-firmado',
    metodologia: 'INDIVIDUAL',
    montoAprobado: 1_200_000,
    montoCancelado: 250_000,
    descuentos: 50_000,
    montoCheque: 900_000,
    numeroCredito: 'NO-SE-ENVIA',
    ordenPago: 100,
  };
}

test('construye el contrato HTTP minimo con el snapshot firmado', () => {
  assert.deepEqual(buildSubmission([draftRequest()]), {
    solicitudes: [{
      numeroSolicitud: '123456',
      numeroCheque: 'CHK-100',
      submissionToken: 'snapshot-firmado',
    }],
  });
});

test('envia una sola peticion POST y devuelve la confirmacion persistida', async () => {
  let captured;
  const submitter = createPlanillaSubmitter(async (url, options) => {
    captured = { url, options };
    return {
      ok: true,
      json: async () => ({ success: true, data: { planilla: { codigo: 'PLN-TEST', estado: 'ENVIADA' } } }),
    };
  });

  const planilla = await submitter.submit([draftRequest()]);
  assert.equal(captured.url, '/api/planillas');
  assert.equal(captured.options.method, 'POST');
  assert.equal(captured.options.headers['content-type'], 'application/json');
  assert.deepEqual(JSON.parse(captured.options.body), buildSubmission([draftRequest()]));
  assert.deepEqual(planilla, { codigo: 'PLN-TEST', estado: 'ENVIADA' });
  assert.equal(submitter.isPending(), false);
});

test('bloquea un segundo envio mientras el primero esta pendiente', async () => {
  let resolveFetch;
  let calls = 0;
  const submitter = createPlanillaSubmitter(() => {
    calls += 1;
    return new Promise((resolve) => { resolveFetch = resolve; });
  });

  const first = submitter.submit([draftRequest()]);
  await assert.rejects(
    submitter.submit([draftRequest()]),
    (error) => error.code === 'SUBMISSION_IN_PROGRESS',
  );
  assert.equal(calls, 1);
  resolveFetch({
    ok: true,
    json: async () => ({ success: true, data: { planilla: { codigo: 'PLN-TEST' } } }),
  });
  await first;
});

test('propaga un error controlado sin modificar el borrador recibido', async () => {
  const draft = [draftRequest()];
  const original = structuredClone(draft);
  const submitter = createPlanillaSubmitter(async () => ({
    ok: false,
    json: async () => ({ success: false, error: { code: 'CHECK_ALREADY_USED', message: 'Cheque utilizado.' } }),
  }));

  await assert.rejects(
    submitter.submit(draft),
    (error) => error.code === 'CHECK_ALREADY_USED' && error.message === 'Cheque utilizado.',
  );
  assert.deepEqual(draft, original);
  assert.equal(submitter.isPending(), false);
});
