const test = require('node:test');
const assert = require('node:assert/strict');
const { createRequestGuard } = require('../public/js/request-guard');

test('una consulta B invalida y aborta una consulta A lenta', () => {
  const guard = createRequestGuard();
  const requestA = guard.start();
  const requestB = guard.start();

  assert.equal(guard.hasActive(), true);
  assert.equal(requestA.signal.aborted, true);
  assert.equal(guard.isCurrent(requestA), false);
  assert.equal(guard.isCurrent(requestB), true);
});

test('Limpiar invalida la consulta aunque su respuesta llegue despues', () => {
  const guard = createRequestGuard();
  const request = guard.start();
  guard.cancel();

  assert.equal(request.signal.aborted, true);
  assert.equal(guard.isCurrent(request), false);
  assert.equal(guard.finish(request), false);
});

test('un error tardio de A no es actual despues de iniciar B', () => {
  const guard = createRequestGuard();
  const requestA = guard.start();
  guard.start();

  assert.equal(guard.isCurrent(requestA), false);
});

test('una consulta abortada deja de ser actual y no debe mostrar errores', () => {
  const guard = createRequestGuard();
  const request = guard.start();
  guard.cancel();

  assert.equal(guard.isCurrent(request), false);
  assert.equal(request.signal.aborted, true);
});

test('la consulta actual conserva sus errores legitimos hasta finalizar', () => {
  const guard = createRequestGuard();
  const request = guard.start();

  assert.equal(guard.isCurrent(request), true);
  assert.equal(guard.finish(request), true);
  assert.equal(guard.hasActive(), false);
});
