const test = require('node:test');
const assert = require('node:assert/strict');
const userRepository = require('../src/repositories/user.repository');
const { requireAuth } = require('../src/middleware/auth.middleware');
const { requireRole } = require('../src/middleware/role.middleware');

const originalFindById = userRepository.findById;

function currentUser(overrides = {}) {
  return {
    id: 10,
    nombre: 'Usuario actual',
    email: 'actual@example.test',
    rol: 'ASISTENTE',
    agenciaId: 20,
    agenciaNombre: 'Agencia actual',
    activo: true,
    agenciaActivo: true,
    ...overrides,
  };
}

function request(sessionUser = { id: '10' }, originalUrl = '/dashboard', destroyError = null) {
  const session = {
    user: sessionUser,
    destroyed: false,
    destroy(callback) {
      this.destroyed = true;
      delete this.user;
      callback(destroyError);
    },
  };
  return { session, originalUrl };
}

function response() {
  return {
    locals: {},
    statusCode: null,
    body: null,
    redirectPath: null,
    cookieCleared: false,
    clearCookie() { this.cookieCleared = true; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    redirect(path) { this.redirectPath = path; return this; },
    render(view, body) { this.body = { view, ...body }; return this; },
  };
}

async function runAuth(req, res) {
  let nextError;
  let continued = false;
  await requireAuth(req, res, (error) => {
    nextError = error;
    continued = !error;
  });
  return { continued, nextError };
}

test.afterEach(() => {
  userRepository.findById = originalFindById;
});

test('revalida un usuario activo y actualiza rol y agencia en la misma peticion', async () => {
  let calls = 0;
  userRepository.findById = async (id) => {
    calls += 1;
    assert.equal(id, 10);
    return currentUser({ rol: 'CONTABILIDAD', agenciaId: null, agenciaNombre: null, agenciaActivo: null });
  };
  const req = request();
  const res = response();

  assert.deepEqual(await runAuth(req, res), { continued: true, nextError: undefined });
  assert.equal(calls, 1);
  assert.equal(req.session.user.rol, 'CONTABILIDAD');
  assert.equal(req.session.user.agenciaId, null);
  assert.deepEqual(res.locals.currentUser, req.session.user);

  requireRole('ASISTENTE')(req, res, () => assert.fail('No debe conservar el rol anterior'));
  assert.equal(res.statusCode, 403);
});

for (const [name, user] of [
  ['usuario desactivado', currentUser({ activo: false })],
  ['agencia desactivada', currentUser({ agenciaActivo: false })],
  ['asistente sin agencia', currentUser({ agenciaId: null, agenciaNombre: null, agenciaActivo: null })],
  ['rol sin agencia permitida que conserva una agencia', currentUser({ rol: 'CONTABILIDAD' })],
  ['usuario eliminado', null],
]) {
  test(`invalida inmediatamente la sesion de ${name}`, async () => {
    userRepository.findById = async () => user;
    const req = request();
    const res = response();

    assert.deepEqual(await runAuth(req, res), { continued: false, nextError: undefined });
    assert.equal(req.session.destroyed, true);
    assert.equal(res.redirectPath, '/login');
    assert.equal(res.cookieCleared, true);
  });
}

test('responde 401 JSON cuando una sesion de API deja de ser valida', async () => {
  userRepository.findById = async () => currentUser({ activo: false });
  const req = request({ id: 10 }, '/api/solicitudes/123/distribucion');
  const res = response();

  await runAuth(req, res);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'AUTH_REQUIRED');
});

test('rechaza la peticion aunque el almacen no pueda destruir la sesion', async () => {
  userRepository.findById = async () => null;
  const req = request({ id: '10' }, '/api/solicitudes/123/distribucion', new Error('store no disponible'));
  const res = response();
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    await runAuth(req, res);
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(req.session.user, undefined);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error.code, 'AUTH_REQUIRED');
  assert.equal(res.cookieCleared, true);
});

test('propaga errores SQL sin destruir una sesion potencialmente valida', async () => {
  const databaseError = new Error('SQL no disponible');
  userRepository.findById = async () => { throw databaseError; };
  const req = request();
  const res = response();

  const result = await runAuth(req, res);
  assert.equal(result.nextError, databaseError);
  assert.equal(req.session.destroyed, false);
});
