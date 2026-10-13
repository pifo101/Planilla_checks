const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function loadProductionConfig(sessionSecret, institutionalPortalUrl) {
  const env = { ...process.env, NODE_ENV: 'production' };
  if (sessionSecret === undefined) delete env.SESSION_SECRET;
  else env.SESSION_SECRET = sessionSecret;
  if (institutionalPortalUrl === undefined) delete env.INSTITUTIONAL_PORTAL_URL;
  else env.INSTITUTIONAL_PORTAL_URL = institutionalPortalUrl;
  return spawnSync(process.execPath, ['-e', "process.stdout.write(JSON.stringify(require('./src/config').institutionalPortalUrl))"], {
    cwd: process.cwd(),
    env,
    encoding: 'utf8',
  });
}

test('acepta un SESSION_SECRET configurado en produccion', () => {
  assert.equal(loadProductionConfig('production-secret-for-config-test').status, 0);
});

test('rechaza SESSION_SECRET placeholder en produccion', () => {
  const result = loadProductionConfig('change_this_secret');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SESSION_SECRET debe configurarse/);
  assert.doesNotMatch(result.stderr, /change_this_secret/);
});

for (const placeholder of ['development_only_secret', 'replace_with_a_long_random_secret']) {
  test(`rechaza el placeholder de produccion ${placeholder}`, () => {
    const result = loadProductionConfig(placeholder);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /SESSION_SECRET debe configurarse/);
    assert.doesNotMatch(result.stderr, new RegExp(placeholder));
  });
}

test('rechaza SESSION_SECRET vacio en produccion', () => {
  const result = loadProductionConfig(undefined);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /SESSION_SECRET debe configurarse/);
});

test('permite omitir INSTITUTIONAL_PORTAL_URL', () => {
  const result = loadProductionConfig('production-secret-for-config-test');
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'null');
});

test('normaliza una INSTITUTIONAL_PORTAL_URL HTTPS absoluta', () => {
  const result = loadProductionConfig('production-secret-for-config-test', 'https://portal.adicla.org.gt/ProcesosInternos');
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout), 'https://portal.adicla.org.gt/ProcesosInternos');
});

for (const invalidUrl of ['javascript:alert(1)', '/ruta-relativa', 'https://usuario:clave@portal.adicla.org.gt/']) {
  test(`rechaza INSTITUTIONAL_PORTAL_URL insegura: ${invalidUrl}`, () => {
    const result = loadProductionConfig('production-secret-for-config-test', invalidUrl);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /INSTITUTIONAL_PORTAL_URL debe ser una URL absoluta HTTP\(S\)/);
    assert.doesNotMatch(result.stderr, /usuario:clave/);
  });
}
