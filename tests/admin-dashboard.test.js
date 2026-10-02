const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const adminService = require('../src/services/admin.service');
const agencyRepository = require('../src/repositories/agency.repository');
const userRepository = require('../src/repositories/user.repository');
const { showDashboard } = require('../src/controllers/dashboard.controller');
const { requireAuth } = require('../src/middleware/auth.middleware');
const { requireRole } = require('../src/middleware/role.middleware');

const originalUserSummary = userRepository.findAdminDashboardSummary;
const originalAgencySummary = agencyRepository.findAdminDashboardSummary;
const originalServiceSummary = adminService.getAdminDashboardSummary;

function response() {
  return {
    statusCode: 200,
    headers: {},
    view: null,
    body: null,
    redirectPath: null,
    cookieCleared: false,
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    render(view, body) { this.view = view; this.body = body; return this; },
    redirect(pathname) { this.redirectPath = pathname; return this; },
    clearCookie() { this.cookieCleared = true; },
  };
}

test.afterEach(() => {
  userRepository.findAdminDashboardSummary = originalUserSummary;
  agencyRepository.findAdminDashboardSummary = originalAgencySummary;
  adminService.getAdminDashboardSummary = originalServiceSummary;
});

test('compone metricas reales de usuarios, roles y agencias', async () => {
  userRepository.findAdminDashboardSummary = async () => ({
    totalUsuarios: 9,
    usuariosActivos: 7,
    usuariosBloqueados: 2,
    administradores: 2,
    asistentes: 5,
    contabilidad: 2,
    asistentesConAgencia: 5,
  });
  agencyRepository.findAdminDashboardSummary = async () => ({
    summary: { totalAgencias: 3, agenciasActivas: 2, agenciasInactivas: 1 },
    assistantsByAgency: [
      { id: 1, codigo: '001', nombre: 'AGENCIA SOLOLA', activo: true, asistentes: 3 },
      { id: 2, codigo: '002', nombre: 'AGENCIA TECPAN', activo: false, asistentes: 2 },
    ],
  });

  const summary = await adminService.getAdminDashboardSummary({ id: 1, rol: 'ADMIN' });
  assert.deepEqual(summary.users, {
    totalUsuarios: 9,
    usuariosActivos: 7,
    usuariosBloqueados: 2,
    administradores: 2,
    asistentes: 5,
    contabilidad: 2,
    asistentesConAgencia: 5,
  });
  assert.deepEqual(summary.agencies, {
    totalAgencias: 3,
    agenciasActivas: 2,
    agenciasInactivas: 1,
  });
  assert.deepEqual(summary.assistantsByAgency, [
    { id: 1, codigo: '001', nombre: 'AGENCIA SOLOLA', activo: true, asistentes: 3 },
    { id: 2, codigo: '002', nombre: 'AGENCIA TECPAN', activo: false, asistentes: 2 },
  ]);
});

test('normaliza a cero un sistema sin usuarios ni agencias', async () => {
  userRepository.findAdminDashboardSummary = async () => ({
    totalUsuarios: 0,
    usuariosActivos: null,
    usuariosBloqueados: null,
    administradores: null,
    asistentes: null,
    contabilidad: null,
    asistentesConAgencia: null,
  });
  agencyRepository.findAdminDashboardSummary = async () => ({
    summary: { totalAgencias: 0, agenciasActivas: null, agenciasInactivas: null },
    assistantsByAgency: [],
  });

  const summary = await adminService.getAdminDashboardSummary({ id: 1, rol: 'ADMIN' });
  assert.deepEqual(Object.values(summary.users), [0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(Object.values(summary.agencies), [0, 0, 0]);
  assert.deepEqual(summary.assistantsByAgency, []);
});

for (const rol of ['ASISTENTE', 'CONTABILIDAD']) {
  test(`servicio rechaza acceso al dashboard para ${rol}`, async () => {
    await assert.rejects(
      adminService.getAdminDashboardSummary({ id: 2, rol }),
      (error) => error.code === 'ADMIN_FORBIDDEN' && error.status === 403,
    );
  });
}

test('controlador renderiza el resumen sin cachearlo', async () => {
  const summary = { users: {}, agencies: {}, assistantsByAgency: [] };
  adminService.getAdminDashboardSummary = async (actor) => {
    assert.deepEqual(actor, { id: 1, rol: 'ADMIN' });
    return summary;
  };
  const res = response();
  await showDashboard({ session: { user: { id: 1, rol: 'ADMIN' } } }, res);
  assert.equal(res.view, 'dashboard/index');
  assert.equal(res.body.summary, summary);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('error SQL se muestra saneado sin consulta ni constraint', async () => {
  adminService.getAdminDashboardSummary = async () => { throw new Error('SELECT password_hash FROM dbo.usuarios UQ_secreta'); };
  const originalConsoleError = console.error;
  console.error = () => {};
  const res = response();
  try {
    await showDashboard({ session: { user: { id: 1, rol: 'ADMIN' } } }, res);
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(res.statusCode, 500);
  assert.equal(res.view, '500');
  assert.doesNotMatch(res.body.errorMessage, /SELECT|password_hash|dbo|UQ_/i);
});

test('ruta exige autenticacion y rol ADMIN', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'index.routes.js'), 'utf8');
  assert.match(routes, /router\.get\('\/dashboard', requireAuth, requireRole\('ADMIN'\), showDashboard\)/);

  const unauthenticated = response();
  requireAuth({ originalUrl: '/dashboard' }, unauthenticated, () => assert.fail('No debe continuar'));
  assert.equal(unauthenticated.redirectPath, '/login');

  for (const rol of ['ASISTENTE', 'CONTABILIDAD']) {
    const denied = response();
    requireRole('ADMIN')({ session: { user: { rol } }, originalUrl: '/dashboard' }, denied, () => assert.fail('No debe continuar'));
    assert.equal(denied.statusCode, 403);
  }

  let allowed = false;
  requireRole('ADMIN')({ session: { user: { rol: 'ADMIN' } }, originalUrl: '/dashboard' }, response(), () => { allowed = true; });
  assert.equal(allowed, true);
});

test('consultas de dashboard agregan en SQL y no seleccionan datos sensibles', () => {
  const users = fs.readFileSync(path.join(__dirname, '..', 'src', 'repositories', 'user.repository.js'), 'utf8');
  const agencies = fs.readFileSync(path.join(__dirname, '..', 'src', 'repositories', 'agency.repository.js'), 'utf8');
  const userQuery = users.match(/async function findAdminDashboardSummary\(\)[\s\S]*?return result\.recordset\[0\];/)?.[0];
  const agencyQuery = agencies.match(/async function findAdminDashboardSummary\(\)[\s\S]*?assistantsByAgency: result\.recordsets\[1\],[\s\S]*?};/)?.[0];
  assert.match(userQuery, /COUNT\(\*\)|SUM\(CASE/);
  assert.match(agencyQuery, /COUNT\(u\.id\)/);
  assert.doesNotMatch(userQuery, /password_hash|passwordHash|SELECT \*/i);
  assert.doesNotMatch(agencyQuery, /password_hash|passwordHash|SELECT \*/i);
});

test('vista final no contiene metricas ni actividad simulada y enlaza funciones reales', () => {
  const controller = fs.readFileSync(path.join(__dirname, '..', 'src', 'controllers', 'dashboard.controller.js'), 'utf8');
  const view = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'dashboard', 'index.ejs'), 'utf8');
  const productionFlow = `${controller}\n${view}`;
  assert.doesNotMatch(productionFlow, /Datos de demostracion|Actividad reciente|Andrea Lopez|PLN-0004|Planillas del dia|Solicitudes procesadas|DEMO \/ MOCK/i);
  assert.doesNotMatch(view, /password_hash|passwordHash|SESSION_SECRET/i);
  assert.match(view, /href="\/admin\/usuarios"/);
  assert.match(view, /href="\/admin\/usuarios\/nuevo"/);
  assert.match(view, /href="\/admin\/agencias"/);
});
