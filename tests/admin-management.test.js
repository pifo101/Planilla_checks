const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcrypt');
const agencyRepository = require('../src/repositories/agency.repository');
const userRepository = require('../src/repositories/user.repository');
const adminService = require('../src/services/admin.service');
const adminController = require('../src/controllers/admin.controller');

const originals = {
  hash: bcrypt.hash,
  findAllAgencies: agencyRepository.findAll,
  findActive: agencyRepository.findActive,
  findAgencyById: agencyRepository.findById,
  create: userRepository.create,
  findAllUsers: userRepository.findAll,
  findByEmail: userRepository.findByEmail,
  updateAdministration: userRepository.updateAdministration,
};

const actor = { id: 1, rol: 'ADMIN' };
const activeAgency = { id: 8, codigo: '008', nombre: 'AGENCIA TECPAN', activo: true };

function validPayload(overrides = {}) {
  return {
    nombre: 'Persona Institucional',
    email: 'PERSONA@ADICLA.ORG.GT',
    password: 'contrasena-12',
    confirmPassword: 'contrasena-12',
    rol: 'ADMIN',
    agenciaId: '',
    ...overrides,
  };
}

function prepareCreate() {
  agencyRepository.findById = async () => activeAgency;
  userRepository.findByEmail = async () => null;
  bcrypt.hash = async () => 'bcrypt-hash';
  userRepository.create = async (user) => ({ id: 20, ...user });
}

test.afterEach(() => {
  bcrypt.hash = originals.hash;
  agencyRepository.findAll = originals.findAllAgencies;
  agencyRepository.findActive = originals.findActive;
  agencyRepository.findById = originals.findAgencyById;
  userRepository.create = originals.create;
  userRepository.findAll = originals.findAllUsers;
  userRepository.findByEmail = originals.findByEmail;
  userRepository.updateAdministration = originals.updateAdministration;
});

for (const [role, agenciaId, expectedAgency] of [
  ['ADMIN', '8', null],
  ['CONTABILIDAD', '8', null],
  ['ASISTENTE', '8', 8],
]) {
  test(`ADMIN crea ${role} con la regla de agencia correspondiente`, async () => {
    prepareCreate();
    let inserted;
    userRepository.create = async (user) => { inserted = user; return { id: 20, ...user }; };
    await adminService.createUser(validPayload({ rol: role, agenciaId }), actor);
    assert.equal(inserted.agenciaId, expectedAgency);
    assert.equal(inserted.activo, true);
    assert.equal(inserted.email, 'persona@adicla.org.gt');
  });
}

test('rechaza ASISTENTE sin agencia', async () => {
  prepareCreate();
  await assert.rejects(
    adminService.createUser(validPayload({ rol: 'ASISTENTE' }), actor),
    (error) => error.code === 'AGENCY_REQUIRED',
  );
});

test('rechaza agencia inexistente o inactiva', async () => {
  prepareCreate();
  agencyRepository.findById = async () => ({ ...activeAgency, activo: false });
  await assert.rejects(
    adminService.createUser(validPayload({ rol: 'ASISTENTE', agenciaId: '8' }), actor),
    (error) => error.code === 'INVALID_AGENCY',
  );
});

test('acepta correo institucional sin distinguir mayusculas y lo normaliza', () => {
  assert.equal(adminService.normalizeEmail(' PERSONA@ADICLA.ORG.GT '), 'persona@adicla.org.gt');
});

for (const email of ['persona@gmail.com', 'persona@adicla.com', 'persona@otro.org.gt', 'a..b@adicla.org.gt']) {
  test(`rechaza correo no institucional o invalido: ${email}`, () => {
    assert.throws(() => adminService.normalizeEmail(email), (error) => error.code === 'INVALID_EMAIL');
  });
}

test('maneja correo duplicado detectado antes de insertar', async () => {
  prepareCreate();
  userRepository.findByEmail = async () => ({ id: 99 });
  await assert.rejects(adminService.createUser(validPayload(), actor), (error) => error.code === 'DUPLICATE_EMAIL');
});

test('maneja carrera de UNIQUE sin exponer SQL', async () => {
  prepareCreate();
  userRepository.create = async () => { const error = new Error('UQ_usuarios_email'); error.number = 2627; throw error; };
  await assert.rejects(
    adminService.createUser(validPayload(), actor),
    (error) => error.code === 'DUPLICATE_EMAIL' && error.message === 'Ya existe un usuario con ese correo.',
  );
});

test('rechaza contrasena menor de 12 caracteres', async () => {
  prepareCreate();
  await assert.rejects(
    adminService.createUser(validPayload({ password: 'corta', confirmPassword: 'corta' }), actor),
    (error) => error.code === 'INVALID_PASSWORD',
  );
});

test('rechaza confirmacion diferente', async () => {
  prepareCreate();
  await assert.rejects(
    adminService.createUser(validPayload({ confirmPassword: 'otra-contrasena' }), actor),
    (error) => error.code === 'PASSWORD_MISMATCH',
  );
});

test('genera bcrypt con 12 rounds y nunca entrega la contrasena al repositorio', async () => {
  prepareCreate();
  let hashArguments;
  let inserted;
  bcrypt.hash = async (...args) => { hashArguments = args; return 'hash-seguro'; };
  userRepository.create = async (user) => { inserted = user; return { id: 20 }; };
  await adminService.createUser(validPayload(), actor);
  assert.deepEqual(hashArguments, ['contrasena-12', 12]);
  assert.equal(inserted.passwordHash, 'hash-seguro');
  assert.equal('password' in inserted, false);
});

function prepareUpdate() {
  agencyRepository.findById = async () => activeAgency;
  userRepository.updateAdministration = async (id, access) => ({ id, ...access });
}

test('cambiar rol a ASISTENTE requiere agencia activa', async () => {
  prepareUpdate();
  await assert.rejects(
    adminService.updateUser(2, { rol: 'ASISTENTE', activo: 'true' }, actor),
    (error) => error.code === 'AGENCY_REQUIRED',
  );
});

for (const role of ['ADMIN', 'CONTABILIDAD']) {
  test(`cambiar a ${role} elimina la agencia aunque llegue del navegador`, async () => {
    prepareUpdate();
    const updated = await adminService.updateUser(2, { rol: role, agenciaId: '8', activo: 'true' }, actor);
    assert.equal(updated.agenciaId, null);
  });
}

test('bloquea y reactiva usuarios', async () => {
  prepareUpdate();
  assert.equal((await adminService.updateUser(2, { rol: 'CONTABILIDAD', activo: 'false' }, actor)).activo, false);
  assert.equal((await adminService.updateUser(2, { rol: 'CONTABILIDAD', activo: 'true' }, actor)).activo, true);
});

test('ADMIN no puede bloquearse a si mismo', async () => {
  prepareUpdate();
  await assert.rejects(
    adminService.updateUser(1, { rol: 'ADMIN', activo: 'false' }, actor),
    (error) => error.code === 'SELF_BLOCK',
  );
});

test('ADMIN no puede quitarse su propio rol', async () => {
  prepareUpdate();
  await assert.rejects(
    adminService.updateUser(1, { rol: 'CONTABILIDAD', activo: 'true' }, actor),
    (error) => error.code === 'SELF_DEMOTION',
  );
});

test('rechaza rol arbitrario', async () => {
  prepareUpdate();
  await assert.rejects(
    adminService.updateUser(2, { rol: 'SUPERADMIN', activo: 'true' }, actor),
    (error) => error.code === 'INVALID_ROLE',
  );
});

test('rechaza estado ausente o arbitrario en vez de bloquear implicitamente', async () => {
  prepareUpdate();
  await assert.rejects(
    adminService.updateUser(2, { rol: 'CONTABILIDAD' }, actor),
    (error) => error.code === 'INVALID_STATUS',
  );
  await assert.rejects(
    adminService.updateUser(2, { rol: 'CONTABILIDAD', activo: 'on' }, actor),
    (error) => error.code === 'INVALID_STATUS',
  );
});

test('servicio rechaza mutaciones si el actor no es ADMIN', async () => {
  prepareCreate();
  await assert.rejects(
    adminService.createUser(validPayload(), { id: 2, rol: 'ASISTENTE' }),
    (error) => error.code === 'ADMIN_FORBIDDEN' && error.status === 403,
  );
});

test('listado obtiene usuarios y agencias de repositorios reales', async () => {
  const users = [{ id: 2, nombre: 'Asistente', email: 'a@adicla.org.gt', rol: 'ASISTENTE', agenciaNombre: 'AGENCIA TECPAN', activo: true }];
  userRepository.findAll = async () => users;
  agencyRepository.findActive = async () => [activeAgency];
  const data = await adminController.usersViewData({ query: {} });
  assert.equal(data.users, users);
  assert.deepEqual(data.agencyFilters, ['AGENCIA TECPAN']);
  assert.equal(data.summary.active, 1);
});

test('consulta administrativa no selecciona password_hash', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'repositories', 'user.repository.js'), 'utf8');
  const findAllBody = source.match(/async function findAll\(\)[\s\S]*?return result\.recordset;/)?.[0];
  assert.ok(findAllBody);
  assert.doesNotMatch(findAllBody, /password_hash|passwordHash/i);
});

test('rutas administrativas estan protegidas y solo mutan mediante POST', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'admin.routes.js'), 'utf8');
  assert.match(source, /router\.use\(requireAuth, requireRole\('ADMIN'\)\)/);
  assert.match(source, /router\.post\('\/usuarios', createUser\)/);
  assert.match(source, /router\.post\('\/usuarios\/:id', updateUser\)/);
  assert.doesNotMatch(source, /router\.get\([^\n]+(?:createUser|updateUser)/);
});

test('/crear-cuenta ya no existe como alta publica ni se enlaza desde login', () => {
  const routes = fs.readFileSync(path.join(__dirname, '..', 'src', 'routes', 'auth.routes.js'), 'utf8');
  const login = fs.readFileSync(path.join(__dirname, '..', 'src', 'views', 'auth', 'login.ejs'), 'utf8');
  assert.doesNotMatch(routes, /crear-cuenta/);
  assert.doesNotMatch(login, /crear-cuenta|Crear cuenta/);
});
