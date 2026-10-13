const assert = require('node:assert/strict');
const test = require('node:test');

const planillaService = require('../src/services/planilla.service');
const {
  downloadAccountingPlanilla,
  downloadAssistantPlanilla,
  safePdfFilename,
} = require('../src/controllers/planilla-pdf.controller');

const originalAssistantDetail = planillaService.getSentPlanillaDetail;
const originalAccountingDetail = planillaService.getAccountingPlanillaDetail;

function planilla() {
  return {
    id: 41,
    codigo: 'PLN-41',
    agenciaNombre: 'Agencia Uno',
    numeroActa: 'ACTA-1',
    fechaEnvio: new Date('2026-10-09T11:30:00-06:00'),
    trasladado: null,
    solicitudes: [{
      numeroSolicitud: '10001',
      nombreCliente: 'Cliente Uno',
      montoAprobado: '1000.00',
      montoCancelado: '100.00',
      descuentos: '100.00',
      montoCheque: '800.00',
      numeroCheque: 'CHK-1',
      metodologia: 'INDIVIDUAL',
      fechaExtraccion: new Date('2026-10-09T10:00:00-06:00'),
    }],
  };
}

function response() {
  return {
    statusCode: 200,
    headers: {},
    view: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    set(values) { Object.assign(this.headers, values); return this; },
    render(view, body) { this.view = view; this.body = body; return this; },
    send(body) { this.body = body; return this; },
  };
}

test.afterEach(() => {
  planillaService.getSentPlanillaDetail = originalAssistantDetail;
  planillaService.getAccountingPlanillaDetail = originalAccountingDetail;
});

test('descarga ASISTENTE usa usuario e ID del servidor e ignora agencia y contexto manipulados', async () => {
  const user = { id: 7, rol: 'ASISTENTE', agenciaId: 3 };
  planillaService.getSentPlanillaDetail = async (receivedUser, id) => {
    assert.equal(receivedUser, user);
    assert.equal(id, '41');
    return planilla();
  };
  const res = response();
  await downloadAssistantPlanilla({
    session: { user },
    params: { id: '41' },
    query: { agenciaId: '999', context: 'CONTABILIDAD' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'application/pdf');
  assert.equal(res.headers['Content-Disposition'], 'attachment; filename="planilla-PLN-41.pdf"');
  assert.match(res.headers['Cache-Control'], /no-store/);
  assert.equal(res.headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(res.body.subarray(0, 5).toString('ascii'), '%PDF-');
});

test('descarga ASISTENTE oculta una planilla ajena o inexistente como 404', async () => {
  planillaService.getSentPlanillaDetail = async () => null;
  const res = response();
  await downloadAssistantPlanilla({ session: { user: { rol: 'ASISTENTE', agenciaId: 3 } }, params: { id: '99' } }, res);
  assert.equal(res.statusCode, 404);
  assert.equal(res.view, '404');
  assert.match(res.headers['Cache-Control'], /no-store/);
  assert.doesNotMatch(res.body.errorMessage, /agencia \d|otra agencia/i);
});

test('descarga CONTABILIDAD usa consulta global autorizada y genera PDF sin firma de asistente', async () => {
  const user = { id: 8, rol: 'CONTABILIDAD', agenciaId: null };
  planillaService.getAccountingPlanillaDetail = async (receivedUser, id) => {
    assert.equal(receivedUser, user);
    assert.equal(id, '41');
    return { ...planilla(), agenciaId: 999 };
  };
  const res = response();
  await downloadAccountingPlanilla({ session: { user }, params: { id: '41' }, query: { context: 'ASISTENTE' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['Content-Type'], 'application/pdf');
  assert.equal(res.body.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.doesNotMatch(res.body.toString('latin1'), /Jefe de Agencia/);
});

test('identificador invalido y errores inesperados no filtran SQL', async () => {
  planillaService.getSentPlanillaDetail = originalAssistantDetail;
  const invalid = response();
  await downloadAssistantPlanilla({
    session: { user: { id: 7, rol: 'ASISTENTE', agenciaId: 3 } },
    params: { id: '1 OR 1=1' },
  }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(invalid.view, '404');
  assert.match(invalid.headers['Cache-Control'], /no-store/);

  planillaService.getAccountingPlanillaDetail = async () => { throw new Error('SELECT dbo.planillas secreto'); };
  const originalConsoleError = console.error;
  console.error = () => {};
  const failed = response();
  try {
    await downloadAccountingPlanilla({ session: { user: { id: 8, rol: 'CONTABILIDAD' } }, params: { id: '41' } }, failed);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(failed.statusCode, 500);
  assert.equal(failed.view, '500');
  assert.match(failed.headers['Cache-Control'], /no-store/);
  assert.doesNotMatch(failed.body.errorMessage, /SELECT|dbo|secreto/i);
});

test('nombre de descarga elimina caracteres de cabecera y limita longitud', () => {
  const filename = safePdfFilename(`PLN\r\nmalicioso/${'A'.repeat(100)}`);
  assert.match(filename, /^planilla-[A-Za-z0-9_-]+\.pdf$/);
  assert.doesNotMatch(filename, /[\r\n/]/);
  assert.ok(filename.length <= 93);
});
