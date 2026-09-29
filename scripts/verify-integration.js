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
const { createGroupFingerprint, createSubmissionToken } = require('../src/services/planilla-token.service');
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
      UPDATE p
      SET estado = 'BORRADOR', fecha_envio = NULL
      FROM dbo.planillas AS p
      INNER JOIN dbo.agencias AS a ON a.id = p.agencia_id
      WHERE a.codigo = @agencyCode;

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

  const revalidatedAssistant = await userRepository.findById(Number(activeUser.id));
  assert.equal(revalidatedAssistant.rol, 'ASISTENTE');
  assert.equal(Boolean(revalidatedAssistant.activo), true);
  assert.equal(Boolean(revalidatedAssistant.agenciaActivo), true);
  assert.equal(Number(revalidatedAssistant.agenciaId), agenciaId);
  const serviceUser = {
    id: Number(revalidatedAssistant.id),
    nombre: revalidatedAssistant.nombre,
    email: revalidatedAssistant.email,
    rol: revalidatedAssistant.rol,
    agenciaId: Number(revalidatedAssistant.agenciaId),
    agenciaNombre: revalidatedAssistant.agenciaNombre,
  };
  assert.equal(Number.isSafeInteger(serviceUser.id), true);
  assert.equal(Number.isSafeInteger(serviceUser.agenciaId), true);

  const solicitud = {
    numeroSolicitud: suffix,
    cliente: 'Cliente temporal',
    montoAprobadoCentavos: 150000,
    montoCanceladoCentavos: 10000,
    descuentosCentavos: 20000,
    montoChequeCentavos: 120000,
    numeroCheque: `CHK-${suffix}`,
    metodologia: 'INDIVIDUAL',
  };
  solicitud.submissionToken = createSubmissionToken(serviceUser.id, solicitud.numeroSolicitud, {
    cliente: solicitud.cliente,
    metodologia: solicitud.metodologia,
    montoAprobado: solicitud.montoAprobadoCentavos / 100,
    montoCancelado: solicitud.montoCanceladoCentavos / 100,
    descuentos: solicitud.descuentosCentavos / 100,
    montoCheque: solicitud.montoChequeCentavos / 100,
  });
  const repositorySolicitud = {
    numeroSolicitud: solicitud.numeroSolicitud,
    nombreCliente: solicitud.cliente,
    montoAprobado: 1500,
    montoCancelado: 100,
    descuentos: 200,
    montoCheque: 1200,
    numeroCheque: solicitud.numeroCheque,
    metodologia: solicitud.metodologia,
    fechaExtraccion: new Date(),
  };
  const createdPlanilla = await planillaService.createPlanilla(
    serviceUser,
    { solicitudes: [solicitud] },
    { generateCode: () => `PLN-${suffix}` },
  );
  assert.equal(createdPlanilla.agenciaId, agenciaId);
  assert.equal(createdPlanilla.estado, 'ENVIADA');

  const groupedRequestNumber = `6${suffix}`;
  const groupedFingerprint = createGroupFingerprint(['19536', '19537'], new Date());
  const groupedRequests = ['19536', '19537'].map((miembroId, index) => {
    const numeroCheque = `GRP-${index}-${suffix}`;
    return {
      numeroSolicitud: groupedRequestNumber,
      miembroId,
      numeroCheque,
      submissionToken: createSubmissionToken(serviceUser.id, groupedRequestNumber, {
        cliente: `Miembro temporal ${index + 1}`,
        metodologia: 'GRUPAL',
        miembroId,
        cantidadMiembros: 2,
        grupoFingerprint: groupedFingerprint,
        montoAprobado: 2000,
        montoCancelado: 0,
        descuentos: 100,
        montoCheque: 1900,
      }),
    };
  });
  const groupedPlanilla = await planillaService.createPlanilla(
    serviceUser,
    { solicitudes: groupedRequests },
    { generateCode: () => `PLN-G-${suffix}` },
  );
  assert.equal(groupedPlanilla.solicitudes.length, 2);
  const groupedRows = await pool.request()
    .input('numeroSolicitud', sql.NVarChar(50), groupedRequestNumber)
    .query(`
      SELECT miembro_id AS miembroId, numero_cheque AS numeroCheque
      FROM dbo.solicitudes_planilla
      WHERE numero_solicitud = @numeroSolicitud
      ORDER BY miembro_id;
    `);
  assert.deepEqual(groupedRows.recordset.map((row) => row.miembroId), ['19536', '19537']);

  const rollbackGroupCode = `PLN-GR-${suffix}`;
  await assert.rejects(
    planillaRepository.createWithSolicitudes({
      codigo: rollbackGroupCode,
      agenciaId,
      usuarioId: serviceUser.id,
      fechaEnvio: new Date(),
      estado: 'ENVIADA',
    }, [{
      ...repositorySolicitud,
      numeroSolicitud: `5${suffix}`,
      miembroId: '20001',
      numeroCheque: `ROLLBACK-${suffix}`,
    }, {
      ...repositorySolicitud,
      numeroSolicitud: `5${suffix}`,
      miembroId: '20002',
      numeroCheque: solicitud.numeroCheque,
    }]),
    (error) => error.number === 2627 || error.number === 2601,
  );
  const rolledBackGroup = await pool.request()
    .input('codigo', sql.NVarChar(40), rollbackGroupCode)
    .input('numeroSolicitud', sql.NVarChar(50), `5${suffix}`)
    .query(`
      SELECT
        (SELECT COUNT(*) FROM dbo.planillas WHERE codigo = @codigo) AS planillas,
        (SELECT COUNT(*) FROM dbo.solicitudes_planilla WHERE numero_solicitud = @numeroSolicitud) AS miembros;
    `);
  assert.deepEqual(rolledBackGroup.recordset[0], { planillas: 0, miembros: 0 });

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
    planillaRepository.createWithSolicitudes({
      codigo: `PLN-S-${suffix}`,
      agenciaId,
      usuarioId: serviceUser.id,
      fechaEnvio: new Date(),
      estado: 'ENVIADA',
    }, [{ ...repositorySolicitud, numeroCheque: `CHK-S-${suffix}` }]),
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
    planillaRepository.createWithSolicitudes({
      codigo: `PLN-C-${suffix}`,
      agenciaId,
      usuarioId: serviceUser.id,
      fechaEnvio: new Date(),
      estado: 'ENVIADA',
    }, [{ ...repositorySolicitud, numeroSolicitud: `8${suffix}` }]),
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
  const submitWithoutSession = await fetch(`${baseUrl}/api/planillas`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ solicitudes: [] }),
  });
  assert.equal(submitWithoutSession.status, 401);

  assert.equal((await login(baseUrl, activeEmail, `${password}-incorrecta`)).status, 401);
  assert.equal((await login(baseUrl, inactiveEmail, password)).status, 401);

  const validLogin = await login(baseUrl, activeEmail, password);
  assert.equal(validLogin.status, 302);
  assert.equal(validLogin.headers.get('location'), '/asistente/nueva-planilla');
  const cookie = validLogin.headers.get('set-cookie').split(';', 1)[0];
  const submittedResponse = await fetch(`${baseUrl}/api/planillas`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      solicitudes: [{
        ...solicitud,
        numeroSolicitud: `7${suffix}`,
        numeroCheque: `WEB-${suffix}`,
        submissionToken: createSubmissionToken(serviceUser.id, `7${suffix}`, {
          cliente: solicitud.cliente,
          metodologia: solicitud.metodologia,
          montoAprobado: solicitud.montoAprobadoCentavos / 100,
          montoCancelado: solicitud.montoCanceladoCentavos / 100,
          descuentos: solicitud.descuentosCentavos / 100,
          montoCheque: solicitud.montoChequeCentavos / 100,
        }),
      }],
    }),
  });
  assert.equal(submittedResponse.status, 201);
  const submittedPayload = await submittedResponse.json();
  assert.equal(submittedPayload.data.planilla.estado, 'ENVIADA');
  const userBeforeProtectedRequest = await userRepository.findById(serviceUser.id);
  assert.equal(userBeforeProtectedRequest.rol, 'ASISTENTE');
  assert.equal(userBeforeProtectedRequest.activo, true);
  assert.equal(userBeforeProtectedRequest.agenciaActivo, true);
  assert.equal(userBeforeProtectedRequest.agenciaId, agenciaId);
  assert.equal(Number.isSafeInteger(serviceUser.id), true);

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
    .input('userId', sql.Int, serviceUser.id)
    .query("UPDATE dbo.usuarios SET rol = 'CONTABILIDAD' WHERE id = @userId;");
  assert.equal((await fetch(`${baseUrl}/asistente/planillas`, { headers: { cookie } })).status, 403);
  assert.equal((await fetch(`${baseUrl}/contabilidad/planillas`, { headers: { cookie } })).status, 200);

  await pool.request()
    .input('userId', sql.Int, serviceUser.id)
    .input('agenciaId', sql.Int, alternateAgencyId)
    .query("UPDATE dbo.usuarios SET rol = 'ASISTENTE', agencia_id = @agenciaId WHERE id = @userId;");
  const changedAgencyPage = await fetch(`${baseUrl}/asistente/nueva-planilla`, { headers: { cookie } });
  assert.equal(changedAgencyPage.status, 200);
  assert.match(await changedAgencyPage.text(), new RegExp(`Agencia alterna ${suffix}`));

  await pool.request()
    .input('userId', sql.Int, serviceUser.id)
    .input('agenciaId', sql.Int, agenciaId)
    .query('UPDATE dbo.usuarios SET agencia_id = @agenciaId, activo = 0 WHERE id = @userId;');
  const disabledUserResponse = await fetch(`${baseUrl}/api/solicitudes/123/distribucion`, {
    headers: { cookie },
  });
  assert.equal(disabledUserResponse.status, 401);
  assert.equal((await disabledUserResponse.json()).error.code, 'AUTH_REQUIRED');
  await pool.request()
    .input('userId', sql.Int, serviceUser.id)
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
  const forbiddenSubmission = await fetch(`${baseUrl}/api/planillas`, {
    method: 'POST',
    headers: { cookie: accountingCookie, 'content-type': 'application/json' },
    body: JSON.stringify({ solicitudes: [solicitud] }),
  });
  assert.equal(forbiddenSubmission.status, 403);

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
