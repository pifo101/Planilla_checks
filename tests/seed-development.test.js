const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  AGENCIES,
  SALT_ROUNDS,
  planAgencyCatalog,
  readDevelopmentUsers,
  resolveAssistantAgencyCode,
  validateEnvironment,
} = require('../scripts/seed-development');

const EXPECTED_CODES = ['001', '002', '004', '005', '006', '007', '008', '009', '010', '011'];
const VALID_ENVIRONMENT = {
  NODE_ENV: 'development',
  DB_SERVER: 'localhost\\SQLEXPRESS',
  DB_DATABASE: 'PlanillaChecksDB',
};
const USER_ENVIRONMENT = {
  DEV_ADMIN_NAME: 'Admin Local',
  DEV_ADMIN_EMAIL: 'admin.local@adicla.org.gt',
  DEV_ADMIN_PASSWORD: 'admin-password-12',
  DEV_ASSISTANT_NAME: 'Assistant Local',
  DEV_ASSISTANT_EMAIL: 'assistant.local@adicla.org.gt',
  DEV_ASSISTANT_PASSWORD: 'assistant-password-12',
  DEV_ACCOUNTING_NAME: 'Accounting Local',
  DEV_ACCOUNTING_EMAIL: 'accounting.local@adicla.org.gt',
  DEV_ACCOUNTING_PASSWORD: 'accounting-password-12',
};

function activeAgencies() {
  return AGENCIES.map((agency, index) => ({ id: index + 40, ...agency, activo: true }));
}

test('define las diez agencias operativas y conserva las adicionales sin eliminarlas', () => {
  assert.deepEqual(AGENCIES.map((agency) => agency.codigo), EXPECTED_CODES);
  const existing = activeAgencies();
  existing.push({ id: 999, codigo: '998', nombre: 'Servicios Automáticos', activo: true });
  assert.deepEqual(planAgencyCatalog(existing), { upserts: [], extras: [existing.at(-1)] });
});

test('la sincronizacion corrige nombre o estado sin cambiar la identidad SQL', () => {
  const existing = activeAgencies();
  existing[0] = { ...existing[0], nombre: 'Nombre anterior', activo: false };
  assert.deepEqual(planAgencyCatalog(existing).upserts, [AGENCIES[0]]);
});

test('el ASISTENTE requiere una agencia operativa activa elegida por codigo', () => {
  const agencies = activeAgencies();
  assert.equal(resolveAssistantAgencyCode('001', agencies), '001');
  assert.throws(() => resolveAssistantAgencyCode('', agencies), /obligatorio/);
  assert.throws(() => resolveAssistantAgencyCode('003', agencies), /no corresponde/);
  assert.throws(
    () => resolveAssistantAgencyCode('001', agencies.map((agency) => ({ ...agency, activo: false }))),
    /activa/,
  );
});

test('las cuentas proceden del entorno, exigen 12 caracteres y mantienen roles', () => {
  const users = readDevelopmentUsers(USER_ENVIRONMENT);
  assert.equal(SALT_ROUNDS, 12);
  assert.deepEqual(users.map((user) => user.rol), ['ADMIN', 'ASISTENTE', 'CONTABILIDAD']);
  assert.equal(users.every((user) => user.password.length >= 12), true);
  assert.throws(
    () => readDevelopmentUsers({ ...USER_ENVIRONMENT, DEV_ADMIN_PASSWORD: 'short' }),
    /al menos 12/,
  );
  assert.throws(
    () => readDevelopmentUsers({ ...USER_ENVIRONMENT, DEV_ASSISTANT_EMAIL: '' }),
    /DEV_ASSISTANT_EMAIL/,
  );
});

test('el seed bloquea produccion, servidores no locales y cualquier base distinta de desarrollo', () => {
  assert.doesNotThrow(() => validateEnvironment(VALID_ENVIRONMENT));
  assert.throws(
    () => validateEnvironment({ ...VALID_ENVIRONMENT, NODE_ENV: 'production' }),
    /produccion/,
  );
  assert.throws(
    () => validateEnvironment({ ...VALID_ENVIRONMENT, DB_SERVER: 'sql.example.test' }),
    /local/,
  );
  assert.throws(
    () => validateEnvironment({ ...VALID_ENVIRONMENT, DB_DATABASE: 'PlanillaChecksTestDB' }),
    /PlanillaChecksDB/,
  );
});

test('el script usa transaccion, rollback y no contiene credenciales predeterminadas', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'seed-development.js'), 'utf8');
  assert.match(source, /await transaction\.begin\(\)/);
  assert.match(source, /await transaction\.commit\(\)/);
  assert.match(source, /await transaction\.rollback\(\)/);
  assert.match(source, /bcrypt\.hash\(user\.password, SALT_ROUNDS\)/);
  assert.doesNotMatch(source, /password:\s*['"][^'"]+['"]/);
  assert.doesNotMatch(source, /DELETE FROM dbo\.agencias/i);
  assert.doesNotMatch(source, /console\.(?:log|warn|error)\([^)]*(?:password|passwordHash)/);
});
