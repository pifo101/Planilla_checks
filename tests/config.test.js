const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

function loadProductionConfig(sessionSecret) {
  const env = { ...process.env, NODE_ENV: 'production' };
  if (sessionSecret === undefined) delete env.SESSION_SECRET;
  else env.SESSION_SECRET = sessionSecret;
  return spawnSync(process.execPath, ['-e', "require('./src/config')"], {
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
