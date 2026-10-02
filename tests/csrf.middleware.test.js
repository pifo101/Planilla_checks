const test = require('node:test');
const assert = require('node:assert/strict');
const { provideCsrfToken, requireCsrf } = require('../src/middleware/csrf.middleware');

function response() {
  return {
    locals: {}, statusCode: 200, body: null, view: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    render(view, body) { this.view = view; this.body = body; return this; },
  };
}

test('genera y reutiliza un token CSRF ligado a la sesion', () => {
  const req = { session: {} };
  const res = response();
  provideCsrfToken(req, res, () => {});
  const token = req.session.csrfToken;
  assert.match(token, /^[A-Za-z0-9_-]{40,}$/);
  assert.equal(res.locals.csrfToken, token);
  provideCsrfToken(req, res, () => {});
  assert.equal(req.session.csrfToken, token);
});

test('acepta token de formulario o header y rechaza token ausente', () => {
  const token = 'a'.repeat(43);
  for (const req of [
    { session: { csrfToken: token }, body: { _csrf: token }, get: () => null, is: () => false },
    { session: { csrfToken: token }, body: {}, get: () => token, is: () => true },
  ]) {
    let called = false;
    requireCsrf(req, response(), () => { called = true; });
    assert.equal(called, true);
  }

  const res = response();
  requireCsrf(
    { session: { csrfToken: token }, body: {}, get: () => null, is: () => true },
    res,
    () => assert.fail('No debe continuar sin token.'),
  );
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.error.code, 'INVALID_CSRF_TOKEN');
});
