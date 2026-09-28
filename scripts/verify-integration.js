require('dotenv').config();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');
const { configureIntegrationEnvironment } = require('./integration-test-config');

configureIntegrationEnvironment(process.env);

const app = require('../src/app');
const {
  sql, getDatabaseConfig, getPool, closePool,
} = require('../src/config/database');
const userRepository = require('../src/repositories/user.repository');
const authService = require('../src/services/auth.service');
const planillaService = require('../src/services/planilla.service');
const planillaRepository = require('../src/repositories/planilla.repository');

const suffix = `${Date.now()}${crypto.randomInt(1000, 9999)}`;
const agencyCode = `TEST-${suffix}`.slice(0, 30);
const alternateAgencyCode = `ALT-${suffix}`.slice(0, 30);
const activeEmail = `active-${suffix}@example.test`;
const inactiveEmail = `inactive-${suffix}@example.test`;
const accountingEmail = `accounting-${suffix}@example.test`;
const deletedEmail = `deleted-${suffix}@example.test`;
const password = crypto.randomBytes(18).toString('base64url');
let server;
let fixturesCreated = false;

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
    .input('alternateAgencyCode', sql.NVarChar(30), alternateAgencyCode)
    .input('activeEmail', sql.NVarChar(254), activeEmail)
    .input('inactiveEmail', sql.NVarChar(254), inactiveEmail)
    .input('accountingEmail', sql.NVarChar(254), accountingEmail)
    .input('deletedEmail', sql.NVarChar(254), deletedEmail)
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

      DELETE FROM dbo.usuarios WHERE email IN (@activeEmail, @inactiveEmail, @accountingEmail, @deletedEmail);
      DELETE FROM dbo.agencias WHERE codigo IN (@agencyCode, @alternateAgencyCode);
    `);
}

async function main() {
  let pool;
  try {
    pool = await getPool();
  } catch (error) {
    throw new Error(`No se pudo abrir TEST_DB_DATABASE. Verifica que la base de pruebas exista y tenga el esquema requerido. ${error.message}`);
  }
  const selectResult = await pool.request().query('SELECT 1 AS ok, DB_NAME() AS databaseName;');
  assert.equal(selectResult.recordset[0].ok, 1);
  assert.equal(
    selectResult.recordset[0].databaseName.toLowerCase(),
    getDatabaseConfig().database.toLowerCase(),
  );

  const agencyResult = await pool.request()
    .input('codigo', sql.NVarChar(30), agencyCode)
    .input('nombre', sql.NVarChar(150), `Agencia temporal ${suffix}`)
    .query(`
      INSERT INTO dbo.agencias (codigo, nombre)
      OUTPUT inserted.id
      VALUES (@codigo, @nombre);
    `);
  fixturesCreated = true;
  const agenciaId = Number(agencyResult.recordset[0].id);
  const alternateAgencyResult = await pool.request()
    .input('codigo', sql.NVarChar(30), alternateAgencyCode)
    .input('nombre', sql.NVarChar(150), `Agencia alterna ${suffix}`)
    .query(`
      INSERT INTO dbo.agencias (codigo, nombre)
      OUTPUT inserted.id
      VALUES (@codigo, @nombre);
    `);
  const alternateAgencyId = Number(alternateAgencyResult.recordset[0].id);
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
  await userRepository.create({
    nombre: 'Contabilidad temporal',
    email: accountingEmail,
    passwordHash,
    rol: 'CONTABILIDAD',
  });
  const deletedUser = await userRepository.create({
    nombre: 'Usuario eliminable temporal',
    email: deletedEmail,
    passwordHash,
    rol: 'CONTABILIDAD',
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
    numeroSolicitud: suffix,
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
  const apiWithoutSession = await fetch(`${baseUrl}/api/solicitudes/123/distribucion`);
  assert.equal(apiWithoutSession.status, 401);
  const availabilityWithoutSession = await fetch(`${baseUrl}/api/solicitudes/123/disponibilidad?numeroCheque=5001`);
  assert.equal(availabilityWithoutSession.status, 401);

  assert.equal((await login(baseUrl, activeEmail, `${password}-incorrecta`)).status, 401);
  assert.equal((await login(baseUrl, inactiveEmail, password)).status, 401);

  const validLogin = await login(baseUrl, activeEmail, password);
  assert.equal(validLogin.status, 302);
  assert.equal(validLogin.headers.get('location'), '/dashboard');
  const cookie = validLogin.headers.get('set-cookie').split(';', 1)[0];
  const userBeforeProtectedRequest = await userRepository.findById(activeUser.id);
  assert.equal(userBeforeProtectedRequest.rol, 'ASISTENTE');
  assert.equal(userBeforeProtectedRequest.activo, true);
  assert.equal(userBeforeProtectedRequest.agenciaActivo, true);
  assert.equal(userBeforeProtectedRequest.agenciaId, agenciaId);
  assert.equal(Number.isSafeInteger(Number(activeUser.id)), true);

  const wrongRole = await fetch(`${baseUrl}/admin/usuarios`, { headers: { cookie }, redirect: 'manual' });
  assert.equal(wrongRole.status, 403, `Redireccion inesperada a ${wrongRole.headers.get('location')}`);
  const correctRole = await fetch(`${baseUrl}/asistente/planillas`, { headers: { cookie } });
  assert.equal(correctRole.status, 200);
  const newPlanillaPage = await fetch(`${baseUrl}/asistente/nueva-planilla`, { headers: { cookie } });
  assert.equal(newPlanillaPage.status, 200);
  assert.match(await newPlanillaPage.text(), /data-fetch-distribution/);
  const invalidRequest = await fetch(`${baseUrl}/api/solicitudes/invalida/distribucion`, {
    headers: { cookie },
  });
  assert.equal(invalidRequest.status, 400);
  const invalidAvailabilityRequest = await fetch(`${baseUrl}/api/solicitudes/invalida/disponibilidad?numeroCheque=5001`, {
    headers: { cookie },
  });
  assert.equal(invalidAvailabilityRequest.status, 400);
  const invalidCheck = await fetch(`${baseUrl}/api/solicitudes/123/disponibilidad?numeroCheque=`, {
    headers: { cookie },
  });
  assert.equal(invalidCheck.status, 400);

  const usedAvailability = await fetch(`${baseUrl}/api/solicitudes/${solicitud.numeroSolicitud}/disponibilidad?numeroCheque=${solicitud.numeroCheque}`, {
    headers: { cookie },
  });
  assert.equal(usedAvailability.status, 200);
  const usedAvailabilityData = await usedAvailability.json();
  assert.equal(usedAvailabilityData.data.solicitudDisponible, false);
  assert.equal(usedAvailabilityData.data.chequeDisponible, false);

  const freeAvailability = await fetch(`${baseUrl}/api/solicitudes/9${suffix}/disponibilidad?numeroCheque=FREE-${suffix}`, {
    headers: { cookie },
  });
  assert.equal(freeAvailability.status, 200);
  const freeAvailabilityData = await freeAvailability.json();
  assert.equal(freeAvailabilityData.data.solicitudDisponible, true);
  assert.equal(freeAvailabilityData.data.chequeDisponible, true);

  const injectionText = `${solicitud.numeroSolicitud}' OR 1=1--`;
  const parameterizedResult = await planillaRepository.findSolicitudUsage(injectionText, injectionText);
  assert.deepEqual(parameterizedResult, { solicitudUtilizada: false, chequeUtilizado: false });

  await pool.request()
    .input('userId', sql.Int, activeUser.id)
    .query("UPDATE dbo.usuarios SET rol = 'CONTABILIDAD' WHERE id = @userId;");
  assert.equal((await fetch(`${baseUrl}/asistente/planillas`, { headers: { cookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/contabilidad/planillas`, { headers: { cookie } })).status, 200);

  await pool.request()
    .input('userId', sql.Int, activeUser.id)
    .input('agenciaId', sql.Int, alternateAgencyId)
    .query("UPDATE dbo.usuarios SET rol = 'ASISTENTE', agencia_id = @agenciaId WHERE id = @userId;");
  const changedAgencyPage = await fetch(`${baseUrl}/asistente/nueva-planilla`, { headers: { cookie } });
  assert.equal(changedAgencyPage.status, 200);
  assert.match(await changedAgencyPage.text(), new RegExp(`Agencia alterna ${suffix}`));

  await pool.request()
    .input('userId', sql.Int, activeUser.id)
    .input('agenciaId', sql.Int, agenciaId)
    .query('UPDATE dbo.usuarios SET agencia_id = @agenciaId, activo = 0 WHERE id = @userId;');
  const disabledUserResponse = await fetch(`${baseUrl}/api/solicitudes/123/distribucion`, {
    headers: { cookie },
  });
  assert.equal(disabledUserResponse.status, 401);
  assert.equal((await disabledUserResponse.json()).error.code, 'AUTH_REQUIRED');
  await pool.request()
    .input('userId', sql.Int, activeUser.id)
    .query('UPDATE dbo.usuarios SET activo = 1 WHERE id = @userId;');

  const agencySession = await login(baseUrl, activeEmail, password);
  const agencyCookie = agencySession.headers.get('set-cookie').split(';', 1)[0];
  await pool.request()
    .input('agenciaId', sql.Int, agenciaId)
    .query('UPDATE dbo.agencias SET activo = 0 WHERE id = @agenciaId;');
  assert.equal((await fetch(`${baseUrl}/dashboard`, { headers: { cookie: agencyCookie }, redirect: 'manual' })).status, 302);
  await pool.request()
    .input('agenciaId', sql.Int, agenciaId)
    .query('UPDATE dbo.agencias SET activo = 1 WHERE id = @agenciaId;');

  const deletedSession = await login(baseUrl, deletedEmail, password);
  const deletedCookie = deletedSession.headers.get('set-cookie').split(';', 1)[0];
  await pool.request()
    .input('userId', sql.Int, deletedUser.id)
    .query('DELETE FROM dbo.usuarios WHERE id = @userId;');
  assert.equal((await fetch(`${baseUrl}/dashboard`, { headers: { cookie: deletedCookie }, redirect: 'manual' })).status, 302);

  const accountingLogin = await login(baseUrl, accountingEmail, password);
  const accountingCookie = accountingLogin.headers.get('set-cookie').split(';', 1)[0];
  const forbiddenApi = await fetch(`${baseUrl}/api/solicitudes/123/distribucion`, {
    headers: { cookie: accountingCookie },
  });
  assert.equal(forbiddenApi.status, 403);
  const forbiddenAvailability = await fetch(`${baseUrl}/api/solicitudes/123/disponibilidad?numeroCheque=5001`, {
    headers: { cookie: accountingCookie },
  });
  assert.equal(forbiddenAvailability.status, 403);

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
      if (fixturesCreated) await cleanup();
    } finally {
      await closePool();
    }
  });
