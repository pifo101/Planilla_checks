require('dotenv').config();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const app = require('../src/app');
const { sql, getPool, closePool } = require('../src/config/database');
const userRepository = require('../src/repositories/user.repository');
const authService = require('../src/services/auth.service');
const planillaService = require('../src/services/planilla.service');

const suffix = `${Date.now()}${crypto.randomInt(1000, 9999)}`;
const agencyCode = `TEST-${suffix}`.slice(0, 30);
const activeEmail = `active-${suffix}@example.test`;
const inactiveEmail = `inactive-${suffix}@example.test`;
const password = crypto.randomBytes(18).toString('base64url');
let server;

function startServer() {
  return new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function stopServer() {
  return new Promise((resolve, reject) => {
    if (!server) return resolve();
    return server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function login(baseUrl, email, loginPassword) {
  return fetch(`${baseUrl}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ email, password: loginPassword }),
  });
}

async function cleanup() {
  const pool = await getPool();
  await pool.request()
    .input('agencyCode', sql.NVarChar(30), agencyCode)
    .input('activeEmail', sql.NVarChar(254), activeEmail)
    .input('inactiveEmail', sql.NVarChar(254), inactiveEmail)
    .query(`
      DELETE s
      FROM dbo.solicitudes_planilla AS s
      INNER JOIN dbo.planillas AS p ON p.id = s.planilla_id
      INNER JOIN dbo.agencias AS a ON a.id = p.agencia_id
      WHERE a.codigo = @agencyCode;

      DELETE p
      FROM dbo.planillas AS p
      INNER JOIN dbo.agencias AS a ON a.id = p.agencia_id
      WHERE a.codigo = @agencyCode;

      DELETE FROM dbo.usuarios WHERE email IN (@activeEmail, @inactiveEmail);
      DELETE FROM dbo.agencias WHERE codigo = @agencyCode;
    `);
}

async function main() {
  const pool = await getPool();
  const selectResult = await pool.request().query('SELECT 1 AS ok;');
  assert.equal(selectResult.recordset[0].ok, 1);

  const agencyResult = await pool.request()
    .input('codigo', sql.NVarChar(30), agencyCode)
    .input('nombre', sql.NVarChar(150), `Agencia temporal ${suffix}`)
    .query(`
      INSERT INTO dbo.agencias (codigo, nombre)
      OUTPUT inserted.id
      VALUES (@codigo, @nombre);
    `);
  const agenciaId = Number(agencyResult.recordset[0].id);
  const passwordHash = await bcrypt.hash(password, 10);

  const activeUser = await userRepository.create({
    nombre: 'Asistente temporal',
    email: activeEmail,
    passwordHash,
    rol: 'ASISTENTE',
    agenciaId,
  });
  await userRepository.create({
    nombre: 'Usuario inactivo temporal',
    email: inactiveEmail,
    passwordHash,
    rol: 'CONTABILIDAD',
    activo: false,
  });

  assert.equal((await userRepository.findByEmail(activeEmail)).id, activeUser.id);
  assert.equal(await bcrypt.compare(password, passwordHash), true);
  assert.ok(await authService.authenticate(activeEmail, password));
  assert.equal(await authService.authenticate(activeEmail, `${password}-incorrecta`), null);
  assert.equal(await authService.authenticate(inactiveEmail, password), null);

  await pool.request()
    .input('agenciaId', sql.Int, agenciaId)
    .query('UPDATE dbo.agencias SET activo = 0 WHERE id = @agenciaId;');
  assert.equal(await authService.authenticate(activeEmail, password), null);
  await pool.request()
    .input('agenciaId', sql.Int, agenciaId)
    .query('UPDATE dbo.agencias SET activo = 1 WHERE id = @agenciaId;');

  const solicitud = {
    numeroSolicitud: `SOL-${suffix}`,
    nombreCliente: 'Cliente temporal',
    montoAprobado: 1500,
    montoCancelado: 100,
    descuentos: 200,
    montoCheque: 1200,
    numeroCheque: `CHK-${suffix}`,
    fechaExtraccion: new Date(),
  };
  const createdPlanilla = await planillaService.createPlanilla(
    { ...activeUser, rol: 'ASISTENTE', agenciaId },
    { codigo: `PLN-${suffix}` },
    [solicitud],
  );
  assert.equal(createdPlanilla.agenciaId, agenciaId);

  const lockTransaction = new sql.Transaction(pool);
  await lockTransaction.begin();
  try {
    await new sql.Request(lockTransaction)
      .input('solicitudId', sql.BigInt, createdPlanilla.solicitudes[0].id)
      .query(`
        UPDATE dbo.solicitudes_planilla
        SET procesado = 1, estado = 'PROCESADA', fecha_procesado = SYSUTCDATETIME()
        WHERE id = @solicitudId;
      `);
    await assert.rejects(
      new sql.Request(lockTransaction)
        .input('solicitudId', sql.BigInt, createdPlanilla.solicitudes[0].id)
        .query(`
          UPDATE dbo.solicitudes_planilla
          SET nombre_cliente = 'Cambio no permitido'
          WHERE id = @solicitudId;
        `),
      (error) => error.number === 51000,
    );
  } finally {
    await lockTransaction.rollback();
  }

  await assert.rejects(
    planillaService.createPlanilla(
      { ...activeUser, rol: 'ASISTENTE', agenciaId },
      { codigo: `PLN-S-${suffix}` },
      [{ ...solicitud, numeroCheque: `CHK-S-${suffix}` }],
    ),
    (error) => error.number === 2627 || error.number === 2601,
  );

  const rollbackResult = await pool.request()
    .input('codigoSolicitud', sql.NVarChar(40), `PLN-S-${suffix}`)
    .input('codigoCheque', sql.NVarChar(40), `PLN-C-${suffix}`)
    .query(`
      SELECT COUNT(*) AS total
      FROM dbo.planillas
      WHERE codigo IN (@codigoSolicitud, @codigoCheque);
    `);
  assert.equal(rollbackResult.recordset[0].total, 0);
  await assert.rejects(
    planillaService.createPlanilla(
      { ...activeUser, rol: 'ASISTENTE', agenciaId },
      { codigo: `PLN-C-${suffix}` },
      [{ ...solicitud, numeroSolicitud: `SOL-C-${suffix}` }],
    ),
    (error) => error.number === 2627 || error.number === 2601,
  );

  const port = await startServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const withoutSession = await fetch(`${baseUrl}/dashboard`, { redirect: 'manual' });
  assert.equal(withoutSession.status, 302);
  assert.equal(withoutSession.headers.get('location'), '/login');

  assert.equal((await login(baseUrl, activeEmail, `${password}-incorrecta`)).status, 401);
  assert.equal((await login(baseUrl, inactiveEmail, password)).status, 401);

  const validLogin = await login(baseUrl, activeEmail, password);
  assert.equal(validLogin.status, 302);
  assert.equal(validLogin.headers.get('location'), '/dashboard');
  const cookie = validLogin.headers.get('set-cookie').split(';', 1)[0];

  const wrongRole = await fetch(`${baseUrl}/admin/usuarios`, { headers: { cookie } });
  assert.equal(wrongRole.status, 403);
  const correctRole = await fetch(`${baseUrl}/asistente/planillas`, { headers: { cookie } });
  assert.equal(correctRole.status, 200);

  console.log('Verificacion integral completada correctamente.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer();
    try {
      await cleanup();
    } finally {
      await closePool();
    }
  });
