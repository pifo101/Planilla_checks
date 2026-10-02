const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Node engine y documentacion requieren Node.js 22', () => {
  const packageJson = require('../package.json');
  const packageLock = require('../package-lock.json');
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

  assert.equal(packageJson.engines.node, '>=22');
  assert.equal(packageLock.packages[''].engines.node, '>=22');
  assert.match(readme, /Node\.js 22 o superior/);
});

test('pattern del cheque es compatible con RegExp v y conserva la regla actual', () => {
  const view = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'assistant', 'new-planilla.ejs'), 'utf8');
  const input = view.match(/<input[^>]+name="numeroCheque"[^>]+>/)?.[0];
  const pattern = input?.match(/pattern="([^"]+)"/)?.[1];
  assert.ok(pattern);

  const browserPattern = new RegExp(`^(?:${pattern})$`, 'v');
  assert.equal(browserPattern.test('CHK-123'), true);
  assert.equal(browserPattern.test('123456'), true);
  assert.equal(browserPattern.test('CHK 123'), false);
  assert.equal(browserPattern.test('A'.repeat(51)), false);
});

test('el endpoint de envio exige especificamente el rol ASISTENTE', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'api.routes.js'), 'utf8');
  assert.match(routes, /router\.post\('\/planillas', requireRole\('ASISTENTE'\), submitPlanilla\)/);
});

test('las APIs operativas de solicitud exigen especificamente el rol ASISTENTE', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'api.routes.js'), 'utf8');
  assert.match(routes, /router\.get\('\/solicitudes\/:numeroSolicitud\/distribucion', requireRole\('ASISTENTE'\), getDistribution\)/);
  assert.match(routes, /router\.get\('\/solicitudes\/:numeroSolicitud\/disponibilidad', requireRole\('ASISTENTE'\), checkAvailability\)/);
  assert.doesNotMatch(routes, /requireRole\('ASISTENTE', 'ADMIN'\)/);
});
