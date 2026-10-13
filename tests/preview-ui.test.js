const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const preview = require('../scripts/preview-ui');

const routes = [
  ['/login', 'Vista previa local'],
  ['/crear-cuenta', 'Crear cuenta'],
  ['/dashboard', 'Dashboard administrativo'],
  ['/asistente/nueva-planilla', 'Nueva planilla'],
  ['/asistente/planillas', 'Planillas enviadas'],
  ['/asistente/planillas/9901', 'PLA-DEMO-001'],
  ['/contabilidad/planillas', 'Pendientes de traslado'],
  ['/contabilidad/planillas/9901', 'Detalle de solo lectura'],
  ['/contabilidad/historial', 'Historial de traslados'],
  ['/admin/usuarios', 'Administracion de usuarios'],
  ['/admin/usuarios/nuevo', 'Crear usuario'],
  ['/admin/agencias', 'Directorio de agencias'],
];

async function withServer(run) {
  const server = await new Promise((resolve) => {
    const instance = preview.createPreviewApp().listen(0, preview.HOST, () => resolve(instance));
  });
  try {
    await run(server);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

test('preview renders every required view with fictitious data and local-only assets', async () => {
  await withServer(async (server) => {
    assert.equal(server.address().address, '127.0.0.1');
    const baseUrl = `http://${preview.HOST}:${server.address().port}`;

    for (const [route, marker] of routes) {
      const response = await fetch(`${baseUrl}${route}`);
      const html = await response.text();
      assert.equal(response.status, 200, route);
      assert.match(html, new RegExp(marker), route);
      assert.match(html, /Datos ficticios\. Sin autenticación ni persistencia\./, route);
      assert.doesNotMatch(html, /https?:\/\//, `${route} must not reference external resources`);
    }

    const bootstrap = await fetch(`${baseUrl}/preview-assets/bootstrap/css/bootstrap.min.css`);
    const icons = await fetch(`${baseUrl}/preview-assets/bootstrap-icons/bootstrap-icons.min.css`);
    const inter = await fetch(`${baseUrl}/preview-assets/inter/inter-latin-400-normal.woff2`);
    assert.equal(bootstrap.status, 200);
    assert.equal(icons.status, 200);
    assert.equal(inter.status, 200);
  });
});

test('preview rejects every write request and forbids browser connections', async () => {
  await withServer(async (server) => {
    const baseUrl = `http://${preview.HOST}:${server.address().port}`;
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await fetch(`${baseUrl}/login`, { method });
      const payload = await response.json();
      assert.equal(response.status, 405, method);
      assert.equal(payload.error.code, 'PREVIEW_READ_ONLY', method);
      assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
      assert.match(response.headers.get('content-security-policy'), /form-action 'none'/);
    }
  });
});

test('preview entry point is configured for fixed loopback only', () => {
  assert.equal(preview.HOST, '127.0.0.1');
  assert.equal(preview.PORT, 3100);
});

test('demonstration data is coherent, unique, and financially balanced', () => {
  const { DAILY_ACTA, agencies, demoUsers, allPlanillas, pendingPlanillas, historyPlanillas } = preview.demoData;
  const values = (items, key) => items.map((item) => item[key]);
  const unique = (items) => new Set(items).size === items.length;
  const cents = (value) => Math.round(Number(value) * 100);
  const requests = allPlanillas.flatMap((planilla) => planilla.solicitudes);

  assert.equal(demoUsers.length, 4);
  assert.equal(demoUsers.filter((user) => user.activo).length, 3);
  assert.equal(agencies.reduce((total, agency) => total + agency.usuarios, 0), 2);
  assert.ok(unique(values(allPlanillas, 'id')));
  assert.ok(unique(values(allPlanillas, 'codigo')));
  assert.ok(unique(values(requests, 'numeroSolicitud')));
  assert.ok(unique(values(requests, 'numeroCheque')));
  assert.ok(requests.every((item) => /^\d{1,30}$/.test(item.numeroSolicitud)));
  assert.ok(requests.every((item) => /^(?:[A-Za-z0-9]|-){1,50}$/.test(item.numeroCheque)));

  allPlanillas.forEach((planilla) => {
    const creator = demoUsers.find((user) => user.id === planilla.creadaPorId);
    assert.equal(creator.agenciaId, planilla.agenciaId, planilla.codigo);
    assert.equal(planilla.cantidadRegistros, planilla.solicitudes.length, planilla.codigo);
    assert.equal(cents(planilla.totalAprobado), planilla.solicitudes.reduce((sum, item) => sum + cents(item.montoAprobado), 0), planilla.codigo);
    assert.equal(cents(planilla.totalCancelado), planilla.solicitudes.reduce((sum, item) => sum + cents(item.montoCancelado), 0), planilla.codigo);
    assert.equal(cents(planilla.totalDescuentos), planilla.solicitudes.reduce((sum, item) => sum + cents(item.descuentos), 0), planilla.codigo);
    assert.equal(cents(planilla.totalMontoCheque), planilla.solicitudes.reduce((sum, item) => sum + cents(item.montoCheque), 0), planilla.codigo);
    planilla.solicitudes.forEach((item) => {
      assert.equal(cents(item.montoAprobado), cents(item.montoCancelado) + cents(item.descuentos) + cents(item.montoCheque), item.numeroSolicitud);
      assert.equal(item.procesado, Boolean(item.fechaProcesado), item.numeroSolicitud);
    });
  });

  assert.ok(allPlanillas.filter((item) => item.fechaOperativa === DAILY_ACTA.fecha).every((item) => item.numeroActa === DAILY_ACTA.numeroActa));
  assert.ok(pendingPlanillas.every((item) => item.trasladado === null));
  assert.ok(historyPlanillas.every((item) => item.trasladado !== null));
  assert.equal(pendingPlanillas.length + historyPlanillas.length, allPlanillas.length);
});

test('assistant preview is restricted to its agency and filters remain coherent', async () => {
  await withServer(async (server) => {
    const baseUrl = `http://${preview.HOST}:${server.address().port}`;
    const listResponse = await fetch(`${baseUrl}/asistente/planillas?fecha=2026-10-09`);
    const listHtml = await listResponse.text();
    assert.match(listHtml, /PLA-DEMO-001/);
    assert.match(listHtml, /PLA-DEMO-003/);
    assert.doesNotMatch(listHtml, /Agencia Occidente Demo/);

    assert.equal((await fetch(`${baseUrl}/asistente/planillas/9902`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/asistente/planillas/999999`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/contabilidad/planillas/999999`)).status, 404);

    const pendingWest = await (await fetch(`${baseUrl}/contabilidad/planillas?agencia=902`)).text();
    assert.match(pendingWest, /PLA-DEMO-002/);
    assert.doesNotMatch(pendingWest, /PLA-DEMO-001/);

    const transferred = await (await fetch(`${baseUrl}/contabilidad/historial?fecha=2026-10-09&resultado=trasladadas`)).text();
    assert.match(transferred, /PLA-DEMO-003/);
    assert.doesNotMatch(transferred, /PLA-DEMO-004/);
  });
});

test('preview imports only the isolated PDF service and no app, SQL, or repositories', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'preview-ui.js'), 'utf8');
  const srcImports = [...source.matchAll(/require\(['"](\.\.\/src\/[^'"]+)['"]\)/g)].map((match) => match[1]);
  assert.deepEqual(srcImports, ['../src/services/planilla-pdf.service']);
  assert.doesNotMatch(source, /msnodesqlv8|mssql|repositories|webservice/i);

  const loadedModules = Object.keys(require.cache).join('\n');
  assert.doesNotMatch(loadedModules, /msnodesqlv8|[\\/]mssql[\\/]|src[\\/]config[\\/]database/);
});

test('preview and tables use non-overlapping responsive layout rules', () => {
  const appCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'app.css'), 'utf8');
  const previewCss = fs.readFileSync(path.join(__dirname, '..', 'public', 'css', 'preview-ui.css'), 'utf8');
  const accountingView = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'accounting', 'received-planillas.ejs'), 'utf8');

  assert.doesNotMatch(previewCss, /\.preview-banner\s*{[^}]*position:\s*(?:sticky|fixed)/s);
  assert.match(appCss, /\.table-responsive\s*{[^}]*overflow-x:\s*auto/s);
  assert.match(appCss, /\.table-responsive\s*{[^}]*overflow-y:\s*hidden/s);
  assert.match(appCss, /\.table-extra-wide\s*{[^}]*min-width/s);
  assert.match(accountingView, /col-12 col-md-6 col-xl-4/g);
  assert.equal((accountingView.match(/col-12 col-md-6 col-xl-4/g) || []).length, 6);
  assert.match(accountingView, /accounting-actions/);
});

test('preview cannot be created in production mode', () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(() => preview.createPreviewApp(), /no puede ejecutarse en produccion/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
