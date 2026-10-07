const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ejs = require('ejs');
const { homeForRole, safeReturnTo } = require('../src/utils/navigation');

const root = path.join(__dirname, '..');

function render(view, locals) {
  return ejs.renderFile(path.join(root, 'src', 'views', view), {
    currentPath: '/',
    currentUser: null,
    homePath: '/login',
    csrfToken: '',
    ...locals,
  });
}

test('resuelve el inicio por rol y rechaza retornos externos o no permitidos', () => {
  assert.equal(homeForRole('ADMIN'), '/dashboard');
  assert.equal(homeForRole('ASISTENTE'), '/asistente/nueva-planilla');
  assert.equal(homeForRole('CONTABILIDAD'), '/contabilidad/planillas');
  assert.equal(homeForRole(null), '/login');

  assert.equal(
    safeReturnTo('/asistente/planillas?fecha=2026-10-05&page=2', ['/asistente/planillas'], '/asistente/planillas'),
    '/asistente/planillas?fecha=2026-10-05&page=2',
  );
  for (const unsafe of [
    'https://evil.test/',
    'http://evil.test/',
    '//evil.test/',
    '\\evil.test',
    'javascript:alert(1)',
    'data:text/html,test',
    '/%2F%2Fevil.test/',
    '/%5C%5Cevil.test/',
    '/dashboard',
  ]) {
    assert.equal(safeReturnTo(unsafe, ['/asistente/planillas'], '/asistente/planillas'), '/asistente/planillas');
  }
});

test('navbar usa el mismo home seguro para sesiones anonimas', async () => {
  const html = await render('partials/navbar.ejs', {});
  assert.match(html, /class="navbar-brand[^>]+href="\/login"/);
  assert.doesNotMatch(html, /class="navbar-brand[^>]+href="\/dashboard"/);
});

test('errores usan el codigo recibido y el home correspondiente al rol', async () => {
  const html = await render('500.ejs', {
    currentUser: { rol: 'ASISTENTE', nombre: 'Asistente' },
    homePath: '/asistente/nueva-planilla',
    pageTitle: 'Solicitud no valida',
    errorMessage: 'No verificada.',
    errorCode: 403,
    csrfToken: 'csrf-test',
  });
  assert.match(html, />403</);
  assert.match(html, /href="\/asistente\/nueva-planilla"/);
  assert.doesNotMatch(html, />500</);
});

test('sidebar anonimo no renderiza navegacion privada', async () => {
  const html = await render('partials/sidebar.ejs', {});
  assert.doesNotMatch(html, /\/dashboard|\/admin\/|\/asistente\/|\/contabilidad\//);
});

test('la cuenta ADMIN actual no ofrece formulario de autoedicion', async () => {
  const html = await render('admin/users.ejs', {
    currentPath: '/admin/usuarios',
    currentUser: { id: 7, rol: 'ADMIN', nombre: 'Admin' },
    homePath: '/dashboard',
    csrfToken: 'csrf-test',
    pageTitle: 'Usuarios',
    message: null,
    users: [{
      id: 7, nombre: 'Admin Actual', email: 'admin@adicla.org.gt', rol: 'ADMIN',
      agenciaId: null, agenciaNombre: null, activo: true, createdAt: new Date('2026-10-01T12:00:00Z'),
    }],
    agencies: [],
    agencyFilters: [],
    roles: ['ADMIN', 'ASISTENTE', 'CONTABILIDAD'],
    roleLabels: { ADMIN: 'Administrador', ASISTENTE: 'Asistente', CONTABILIDAD: 'Contabilidad' },
    summary: { total: 1, active: 1, blocked: 0, assistants: 0 },
    dateTime: { format: () => '01/10/2026' },
  });
  assert.match(html, /Cuenta actual/);
  assert.doesNotMatch(html, /action="\/admin\/usuarios\/7"/);
});

test('paginacion contable deshabilitada no conserva href invalido', async () => {
  const html = await render('accounting/received-planillas.ejs', {
    currentPath: '/contabilidad/planillas',
    currentUser: { id: 9, rol: 'CONTABILIDAD', nombre: 'Contabilidad' },
    homePath: '/contabilidad/planillas',
    csrfToken: 'csrf-test',
    pageTitle: 'Pendientes',
    message: null,
    planillas: [],
    agencies: [],
    selectedAgencyId: null,
    summary: {
      cantidadPlanillas: 0, cantidadRegistros: 0, totalAprobado: 0,
      totalCancelado: 0, totalDescuentos: 0, totalMontoCheque: 0,
    },
    total: 21,
    page: 1,
    totalPages: 2,
    returnTo: '/contabilidad/planillas?page=1',
    decisionReturnTo: '/contabilidad/planillas',
    sqlCurrency: { format: () => 'Q 0.00' },
  });
  assert.doesNotMatch(html, /href="\?page=0/);
  assert.match(html, /aria-disabled="true">Anterior<\/span>/);
  assert.match(html, /href="\?page=2">Siguiente<\/a>/);
});

test('nueva planilla intercepta submit y no interpola datos externos con innerHTML', () => {
  const source = fs.readFileSync(path.join(root, 'public', 'js', 'app.js'), 'utf8');
  assert.match(source, /solicitudForm\.addEventListener\('submit',[\s\S]*?event\.preventDefault\(\)/);
  assert.doesNotMatch(source, /groupedMembers\.innerHTML\s*=/);
  assert.doesNotMatch(source, /draftBody\.innerHTML\s*=\s*draftRequests\.map/);
  assert.match(source, /input\.value = String\(value \?\? ''\)/);
  assert.match(source, /cell\.textContent = String\(value \?\? ''\)/);
});
