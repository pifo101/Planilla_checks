const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const agencyRepository = require('../src/repositories/agency.repository');
const userRepository = require('../src/repositories/user.repository');
const authService = require('../src/services/auth.service');

const activeAgency = { id: 8, codigo: '008', nombre: 'AGENCIA TECPAN', activo: true };

function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function stopServer(server) {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

test('flujo publico de registro valida seguridad y crea solo ASISTENTE inactivo', async (t) => {
  const originals = {
    hash: bcrypt.hash,
    findActive: agencyRepository.findActive,
    findById: agencyRepository.findById,
    findByEmail: userRepository.findByEmail,
    create: userRepository.create,
    authenticate: authService.authenticate,
  };
  const inserted = [];
  const existing = {
    id: 2, nombre: 'Existente', email: 'existente@adicla.org.gt',
    rol: 'ADMIN', agenciaId: null, activo: true,
  };
  const existingSnapshot = structuredClone(existing);

  agencyRepository.findActive = async () => [activeAgency];
  agencyRepository.findById = async (id) => (Number(id) === activeAgency.id ? activeAgency : null);
  userRepository.findByEmail = async (email) => (email === existing.email ? existing : null);
  bcrypt.hash = async (password, rounds) => `bcrypt-${rounds}-${password.length}`;
  userRepository.create = async (account) => {
    inserted.push(account);
    return { id: 100 + inserted.length, ...account };
  };

  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await t.test('Login enlaza el registro', async () => {
      const response = await fetch(`${baseUrl}/login`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /href="\/crear-cuenta"[^>]*>Crear cuenta</);
    });

    await t.test('usuario autenticado vuelve al home de su rol', async () => {
      authService.authenticate = async () => ({
        id: 1,
        nombre: 'Admin',
        email: 'admin@adicla.org.gt',
        rol: 'ADMIN',
        agenciaId: null,
        agenciaNombre: null,
      });
      const login = await fetch(`${baseUrl}/login`, {
        method: 'POST',
        redirect: 'manual',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ email: 'admin@adicla.org.gt', password: 'no-se-registra' }),
      });
      const authenticatedCookie = login.headers.get('set-cookie').split(';', 1)[0];
      const response = await fetch(`${baseUrl}/crear-cuenta`, {
        redirect: 'manual',
        headers: { cookie: authenticatedCookie },
      });
      assert.equal(response.status, 302);
      assert.equal(response.headers.get('location'), '/dashboard');

      const errorPage = await fetch(`${baseUrl}/ruta-inexistente`, {
        headers: { cookie: authenticatedCookie },
      });
      const csrfToken = (await errorPage.text()).match(/name="_csrf" value="([A-Za-z0-9_-]+)"/)?.[1];
      assert.ok(csrfToken);
      const logout = await fetch(`${baseUrl}/logout`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          cookie: authenticatedCookie,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ _csrf: csrfToken }),
      });
      assert.equal(logout.status, 302);
      assert.equal(logout.headers.get('location'), '/login');
      authService.authenticate = originals.authenticate;
    });

    const registration = await fetch(`${baseUrl}/crear-cuenta`);
    const registrationHtml = await registration.text();
    const cookie = registration.headers.get('set-cookie').split(';', 1)[0];
    const csrfToken = registrationHtml.match(/name="_csrf" value="([A-Za-z0-9_-]+)"/)?.[1];

    await t.test('GET muestra formulario, CSRF y agencia sin roles privilegiados', () => {
      assert.equal(registration.status, 200);
      assert.ok(csrfToken);
      assert.match(registrationHtml, /action="\/crear-cuenta" method="post"/);
      assert.match(registrationHtml, /AGENCIA TECPAN/);
      assert.doesNotMatch(registrationHtml, /name="rol"|value="ADMIN"|value="CONTABILIDAD"/);
    });

    async function post(values, options = {}) {
      return fetch(`${baseUrl}/crear-cuenta`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
          cookie,
          'content-type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ ...values, ...(options.csrf === false ? {} : { _csrf: options.csrf || csrfToken }) }),
      });
    }

    const valid = {
      nombre: 'Persona Institucional',
      email: 'persona@adicla.org.gt',
      password: 'contrasena-12',
      confirmPassword: 'contrasena-12',
      agenciaId: '8',
    };

    await t.test('POST rechaza CSRF ausente e incorrecto', async () => {
      assert.equal((await post(valid, { csrf: false })).status, 403);
      assert.equal((await post(valid, { csrf: 'token-incorrecto' })).status, 403);
      assert.equal(inserted.length, 0);
    });

    await t.test('rechaza contrasena, confirmacion, correo y agencia invalidos', async () => {
      let response = await post({ ...valid, password: '', confirmPassword: '' });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /al menos 12 caracteres/);

      response = await post({ ...valid, confirmPassword: 'contrasena-13' });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /Las contrasenas no coinciden/);

      response = await post({ ...valid, email: 'persona@example.com' });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /correo institucional/);

      response = await post({ ...valid, email: "' OR 1=1--@adicla.org.gt" });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /correo institucional/);

      response = await post({ ...valid, agenciaId: '999999' });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /no existe o esta inactiva/);
      assert.equal(inserted.length, 0);
    });

    await t.test('correo duplicado no modifica la cuenta existente', async () => {
      const response = await post({ ...valid, email: existing.email });
      assert.equal(response.status, 400);
      assert.match(await response.text(), /Ya existe una cuenta con este correo/);
      assert.deepEqual(existing, existingSnapshot);
      assert.equal(inserted.length, 0);
    });

    await t.test('escapa XSS y no repuebla contrasenas', async () => {
      for (const attack of [
        'Cliente <img data-pwned src=x>',
        '"><img src=x onerror=alert(1)>',
        '<script>alert(1)</script>',
        "' onmouseover='alert(1)",
        '& < > " \'',
      ]) {
        const response = await post({ ...valid, nombre: attack, confirmPassword: 'diferente-12' });
        const html = await response.text();
        assert.equal(response.status, 400);
        assert.equal(html.includes(attack), false);
        assert.match(html, /&(?:lt|gt|quot|#39|amp);/);
        assert.doesNotMatch(html, /value="contrasena-12"|value="diferente-12"/);
      }
    });

    await t.test('ignora role y rol manipulados e inserta ASISTENTE inactivo', async () => {
      for (const [field, role, index] of [
        ['role', 'ADMIN', 1],
        ['rol', 'ADMIN', 2],
        ['role', 'CONTABILIDAD', 3],
        ['rol', 'CONTABILIDAD', 4],
      ]) {
        const response = await post({
          ...valid,
          email: `persona${index}@adicla.org.gt`,
          [field]: role,
        });
        assert.equal(response.status, 302);
        assert.equal(response.headers.get('location'), '/login?created=1');
      }

      assert.equal(inserted.length, 4);
      inserted.forEach((account) => {
        assert.equal(account.rol, 'ASISTENTE');
        assert.equal(account.agenciaId, 8);
        assert.equal(account.activo, false);
        assert.equal(account.passwordHash, 'bcrypt-12-13');
        assert.equal('password' in account, false);
      });
    });
  } finally {
    await stopServer(server);
    bcrypt.hash = originals.hash;
    agencyRepository.findActive = originals.findActive;
    agencyRepository.findById = originals.findById;
    userRepository.findByEmail = originals.findByEmail;
    userRepository.create = originals.create;
    authService.authenticate = originals.authenticate;
  }
});
