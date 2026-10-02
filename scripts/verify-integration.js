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
const actaService = require('../src/services/acta.service');
const { getOperationalDate, getOperationalDateRange } = require('../src/utils/operational-date');

const suffix = `${Date.now()}${crypto.randomInt(1000, 9999)}`;
const agencyCode = `TEST-${suffix}`.slice(0, 30);
const alternateAgencyCode = `ALT-${suffix}`.slice(0, 30);
const activeEmail = `active-${suffix}@example.test`;
const alternateEmail = `alternate-${suffix}@example.test`;
const inactiveEmail = `inactive-${suffix}@example.test`;
const accountingEmail = `accounting-${suffix}@example.test`;
const deletedEmail = `deleted-${suffix}@example.test`;
const adminEmail = `admin-${suffix}@adicla.org.gt`;
const managedAssistantEmail = `managed-assistant-${suffix}@adicla.org.gt`;
const managedAccountingEmail = `managed-accounting-${suffix}@adicla.org.gt`;
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

async function postForm(url, cookie, values) {
  return fetch(url, {
    method: 'POST',
    redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(values),
  });
}

async function cleanup() {
  const pool = await getPool();
  await pool.request()
    .input('agencyCode', sql.NVarChar(30), agencyCode)
    .input('alternateAgencyCode', sql.NVarChar(30), alternateAgencyCode)
    .input('activeEmail', sql.NVarChar(254), activeEmail)
    .input('alternateEmail', sql.NVarChar(254), alternateEmail)
    .input('inactiveEmail', sql.NVarChar(254), inactiveEmail)
    .input('accountingEmail', sql.NVarChar(254), accountingEmail)
    .input('deletedEmail', sql.NVarChar(254), deletedEmail)
    .input('adminEmail', sql.NVarChar(254), adminEmail)
    .input('managedAssistantEmail', sql.NVarChar(254), managedAssistantEmail)
    .input('managedAccountingEmail', sql.NVarChar(254), managedAccountingEmail)
    .query(`
      UPDATE p
      SET estado = 'BORRADOR', fecha_envio = NULL
      FROM dbo.planillas AS p
      INNER JOIN dbo.agencias AS a ON a.id = p.agencia_id
       WHERE a.codigo IN (@agencyCode, @alternateAgencyCode);

      DELETE s
      FROM dbo.solicitudes_planilla AS s
      INNER JOIN dbo.planillas AS p ON p.id = s.planilla_id
      INNER JOIN dbo.agencias AS a ON a.id = p.agencia_id
       WHERE a.codigo IN (@agencyCode, @alternateAgencyCode);

      DELETE p
      FROM dbo.planillas AS p
      INNER JOIN dbo.agencias AS a ON a.id = p.agencia_id
       WHERE a.codigo IN (@agencyCode, @alternateAgencyCode);

      DELETE ad
      FROM dbo.actas_diarias AS ad
      INNER JOIN dbo.usuarios AS u ON u.id = ad.creada_por_usuario_id
      WHERE u.email IN (@activeEmail, @alternateEmail, @inactiveEmail, @accountingEmail, @deletedEmail,
                        @adminEmail, @managedAssistantEmail, @managedAccountingEmail);

      DELETE FROM dbo.usuarios WHERE email IN (@activeEmail, @alternateEmail, @inactiveEmail, @accountingEmail, @deletedEmail,
                                               @adminEmail, @managedAssistantEmail, @managedAccountingEmail);
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
  const alternateUser = await userRepository.create({
    nombre: 'Asistente alterno temporal',
    email: alternateEmail,
    passwordHash,
    rol: 'ASISTENTE',
    agenciaId: alternateAgencyId,
  });
  await userRepository.create({
    nombre: 'Usuario inactivo temporal',
    email: inactiveEmail,
    passwordHash,
    rol: 'CONTABILIDAD',
    activo: false,
  });
  const accountingUser = await userRepository.create({
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
  const adminPasswordHash = await bcrypt.hash(password, 12);
  const adminUser = await userRepository.create({
    nombre: 'Administrador temporal',
    email: adminEmail,
    passwordHash: adminPasswordHash,
    rol: 'ADMIN',
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

  const alternateServiceUser = {
    id: Number(alternateUser.id),
    rol: 'ASISTENTE',
    agenciaId: alternateAgencyId,
  };
  const integrationNow = new Date();
  const operationalDate = getOperationalDate(integrationNow);
  assert.equal((await actaService.getCurrentActa({ now: () => integrationNow })).acta, null);
  const dailyActa = await actaService.createCurrentActa(
    serviceUser,
    { numeroActa: `ACTA-X-${suffix}` },
    { now: () => integrationNow },
  );
  assert.equal(dailyActa.fecha, operationalDate);
  assert.equal(
    (await actaService.getCurrentActa({ now: () => integrationNow, user: alternateServiceUser })).acta.numeroActa,
    dailyActa.numeroActa,
  );
  await assert.rejects(
    actaService.createCurrentActa(
      alternateServiceUser,
      { numeroActa: `ACTA-NO-REEMPLAZAR-${suffix}` },
      { now: () => integrationNow },
    ),
    (error) => error.code === 'DAILY_ACTA_ALREADY_EXISTS'
      && error.acta.numeroActa === dailyActa.numeroActa,
  );

  const concurrentNow = new Date('2035-01-15T12:00:00.000Z');
  const concurrentDate = getOperationalDate(concurrentNow);
  const concurrentResults = await Promise.allSettled([
    actaService.createCurrentActa(serviceUser, { numeroActa: `ACTA-C1-${suffix}` }, { now: () => concurrentNow }),
    actaService.createCurrentActa(alternateServiceUser, { numeroActa: `ACTA-C2-${suffix}` }, { now: () => concurrentNow }),
  ]);
  assert.equal(concurrentResults.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(concurrentResults.filter((result) => result.status === 'rejected'
    && result.reason.code === 'DAILY_ACTA_ALREADY_EXISTS').length, 1);
  const concurrentCount = await pool.request()
    .input('fecha', sql.Date, concurrentDate)
    .query('SELECT COUNT(*) AS total FROM dbo.actas_diarias WHERE fecha = @fecha;');
  assert.equal(concurrentCount.recordset[0].total, 1);

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
  }, { now: () => integrationNow });
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
    { now: () => integrationNow, generateCode: () => `PLN-${suffix}` },
  );
  assert.equal(createdPlanilla.agenciaId, agenciaId);
  assert.equal(createdPlanilla.estado, 'ENVIADA');

  const groupedRequestNumber = `6${suffix}`;
  const groupedFingerprint = createGroupFingerprint(['19536', '19537'], integrationNow);
  const groupedRequests = ['19536', '19537'].map((miembroId, index) => {
    const numeroCheque = `GRP-${index}-${suffix}`;
    const montoCancelado = index === 0 ? 500 : 0;
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
        montoAprobado: 2000 + montoCancelado,
        montoCancelado,
        descuentos: 100,
        montoCheque: 1900,
      }, { now: () => integrationNow }),
    };
  });
  const groupedPlanilla = await planillaService.createPlanilla(
    serviceUser,
    { solicitudes: groupedRequests },
    { now: () => integrationNow, generateCode: () => `PLN-G-${suffix}` },
  );
  assert.equal(groupedPlanilla.solicitudes.length, 2);
  const alternateRequestNumber = `4${suffix}`;
  const alternatePlanilla = await planillaService.createPlanilla(alternateServiceUser, {
    solicitudes: [{
      numeroSolicitud: alternateRequestNumber,
      numeroCheque: `ALT-${suffix}`,
      submissionToken: createSubmissionToken(alternateServiceUser.id, alternateRequestNumber, {
        cliente: 'Cliente agencia alterna', metodologia: 'INDIVIDUAL',
        montoAprobado: 1500, montoCancelado: 100, descuentos: 200, montoCheque: 1200,
      }, { now: () => integrationNow }),
    }],
  }, { now: () => integrationNow, generateCode: () => `PLN-ALT-${suffix}` });
  assert.equal(createdPlanilla.numeroActa, dailyActa.numeroActa);
  assert.equal(alternatePlanilla.numeroActa, dailyActa.numeroActa);
  const historyDate = operationalDate;
  const { startDate: historyStart, endDate: historyEnd } = getOperationalDateRange(historyDate);
  const agencyHistory = await planillaRepository.findSentByAgencyAndDate(
    agenciaId,
    historyStart,
    historyEnd,
    1,
    20,
  );
  assert.ok(agencyHistory.planillas.some((item) => Number(item.id) === Number(createdPlanilla.id)));
  assert.ok(agencyHistory.planillas.some((item) => Number(item.id) === Number(groupedPlanilla.id)));
  assert.equal(agencyHistory.planillas.some((item) => Number(item.id) === Number(alternatePlanilla.id)), false);
  const groupedSummary = agencyHistory.planillas.find((item) => Number(item.id) === Number(groupedPlanilla.id));
  assert.equal(groupedSummary.cantidadRegistros, 2);
  assert.equal(groupedSummary.totalAprobado, '4500.00');
  assert.equal(groupedSummary.totalCancelado, '500.00');
  assert.equal(groupedSummary.totalDescuentos, '200.00');
  assert.equal(groupedSummary.totalMontoCheque, '3800.00');

  const groupedDetail = await planillaRepository.findDetailForAgency(groupedPlanilla.id, agenciaId);
  assert.deepEqual(groupedDetail.solicitudes.map((item) => item.miembroId), ['19536', '19537']);
  assert.equal(groupedDetail.cantidadRegistros, 2);
  assert.equal(groupedDetail.totalAprobado, '4500.00');
  assert.equal(groupedDetail.totalCancelado, '500.00');
  assert.equal(groupedDetail.numeroActa, dailyActa.numeroActa);
  assert.deepEqual(groupedDetail.solicitudes.map((item) => item.montoCancelado), ['500.00', '0.00']);
  assert.equal(await planillaRepository.findDetailForAgency(alternatePlanilla.id, agenciaId), null);
  const groupedRows = await pool.request()
    .input('numeroSolicitud', sql.NVarChar(50), groupedRequestNumber)
    .query(`
      SELECT miembro_id AS miembroId, numero_cheque AS numeroCheque,
             CONVERT(VARCHAR(40), monto_cancelado) AS montoCancelado
      FROM dbo.solicitudes_planilla
      WHERE numero_solicitud = @numeroSolicitud
      ORDER BY miembro_id;
    `);
  assert.deepEqual(groupedRows.recordset.map((row) => row.miembroId), ['19536', '19537']);
  assert.deepEqual(groupedRows.recordset.map((row) => row.montoCancelado), ['500.00', '0.00']);

  const nextDayNow = new Date('2036-02-02T12:00:00.000Z');
  const nextDayDate = getOperationalDate(nextDayNow);
  assert.equal((await actaService.getCurrentActa({ now: () => nextDayNow })).acta, null);
  const nextDayRequest = `3${suffix}`;
  const nextDaySubmission = {
    solicitudes: [{
      numeroSolicitud: nextDayRequest,
      numeroCheque: `NEXT-${suffix}`,
      submissionToken: createSubmissionToken(serviceUser.id, nextDayRequest, {
        cliente: 'Cliente fecha siguiente', metodologia: 'INDIVIDUAL',
        montoAprobado: 1000, montoCancelado: 0, descuentos: 100, montoCheque: 900,
      }, { now: () => nextDayNow }),
    }],
  };
  await assert.rejects(
    planillaService.createPlanilla(serviceUser, nextDaySubmission, { now: () => nextDayNow }),
    (error) => error.code === 'DAILY_ACTA_REQUIRED',
  );
  const nextDayActa = await actaService.createCurrentActa(
    serviceUser,
    { numeroActa: `ACTA-Y-${suffix}` },
    { now: () => nextDayNow },
  );
  assert.equal(nextDayActa.fecha, nextDayDate);
  const nextDayPlanilla = await planillaService.createPlanilla(serviceUser, nextDaySubmission, {
    now: () => nextDayNow,
    generateCode: () => `PLN-Y-${suffix}`,
  });
  assert.equal(nextDayPlanilla.numeroActa, nextDayActa.numeroActa);
  assert.equal((await planillaRepository.findDetailForAgency(createdPlanilla.id, agenciaId)).numeroActa, dailyActa.numeroActa);

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
  const publicRegistration = await fetch(`${baseUrl}/crear-cuenta`, { redirect: 'manual' });
  assert.equal(publicRegistration.status, 404);
  const withoutSession = await fetch(`${baseUrl}/dashboard`, { redirect: 'manual' });
  assert.equal(withoutSession.status, 302);
  assert.equal(withoutSession.headers.get('location'), '/login');
  const historyWithoutSession = await fetch(`${baseUrl}/asistente/planillas`, { redirect: 'manual' });
  assert.equal(historyWithoutSession.status, 302);
  assert.equal(historyWithoutSession.headers.get('location'), '/login');
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

  const adminLogin = await login(baseUrl, adminEmail, password);
  assert.equal(adminLogin.status, 302);
  const adminCookie = adminLogin.headers.get('set-cookie').split(';', 1)[0];
  await pool.request()
    .input('agenciaId', sql.Int, alternateAgencyId)
    .query('UPDATE dbo.agencias SET activo = 0 WHERE id = @agenciaId;');
  const dashboardExpectedResult = await pool.request().query(`
    SELECT COUNT(*) AS totalUsuarios,
           COALESCE(SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END), 0) AS usuariosActivos,
           COALESCE(SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END), 0) AS usuariosBloqueados,
           COALESCE(SUM(CASE WHEN rol = 'ADMIN' THEN 1 ELSE 0 END), 0) AS administradores,
           COALESCE(SUM(CASE WHEN rol = 'ASISTENTE' THEN 1 ELSE 0 END), 0) AS asistentes,
           COALESCE(SUM(CASE WHEN rol = 'CONTABILIDAD' THEN 1 ELSE 0 END), 0) AS contabilidad,
           COALESCE(SUM(CASE WHEN rol = 'ASISTENTE' AND agencia_id IS NOT NULL THEN 1 ELSE 0 END), 0)
             AS asistentesConAgencia
    FROM dbo.usuarios;

    SELECT COUNT(*) AS totalAgencias,
           COALESCE(SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END), 0) AS agenciasActivas,
           COALESCE(SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END), 0) AS agenciasInactivas
    FROM dbo.agencias;
  `);
  const expectedUsers = dashboardExpectedResult.recordsets[0][0];
  const expectedAgencies = dashboardExpectedResult.recordsets[1][0];
  const dashboardResponse = await fetch(`${baseUrl}/dashboard`, { headers: { cookie: adminCookie } });
  assert.equal(dashboardResponse.status, 200);
  const dashboardHtml = await dashboardResponse.text();
  for (const [attribute, expected] of [
    ['data-dashboard-total-users', expectedUsers.totalUsuarios],
    ['data-dashboard-active-users', expectedUsers.usuariosActivos],
    ['data-dashboard-blocked-users', expectedUsers.usuariosBloqueados],
    ['data-dashboard-total-agencies', expectedAgencies.totalAgencias],
    ['data-dashboard-active-agencies', expectedAgencies.agenciasActivas],
    ['data-dashboard-inactive-agencies', expectedAgencies.agenciasInactivas],
    ['data-dashboard-assigned-assistants', expectedUsers.asistentesConAgencia],
  ]) {
    assert.match(dashboardHtml, new RegExp(`${attribute}[^>]*>${expected}<`));
  }
  for (const [role, expected] of [
    ['ADMIN', expectedUsers.administradores],
    ['ASISTENTE', expectedUsers.asistentes],
    ['CONTABILIDAD', expectedUsers.contabilidad],
  ]) {
    assert.match(dashboardHtml, new RegExp(`data-dashboard-role="${role}"[^>]*>${expected}<`));
  }
  assert.match(dashboardHtml, new RegExp(`Agencia temporal ${suffix}`));
  assert.match(dashboardHtml, new RegExp(`Agencia alterna ${suffix}`));
  assert.match(dashboardHtml, /Inactiva/);
  assert.doesNotMatch(dashboardHtml, /Datos de demostracion|Actividad reciente|password_hash/i);
  await pool.request()
    .input('agenciaId', sql.Int, alternateAgencyId)
    .query('UPDATE dbo.agencias SET activo = 1 WHERE id = @agenciaId;');
  const adminUsersPage = await fetch(`${baseUrl}/admin/usuarios`, { headers: { cookie: adminCookie } });
  assert.equal(adminUsersPage.status, 200);
  const adminUsersHtml = await adminUsersPage.text();
  assert.match(adminUsersHtml, new RegExp(adminEmail));
  assert.doesNotMatch(adminUsersHtml, /Datos de demostracion|password_hash/i);

  const createManagedAssistant = await postForm(`${baseUrl}/admin/usuarios`, adminCookie, {
    nombre: 'Asistente administrado',
    email: managedAssistantEmail.toUpperCase(),
    password,
    confirmPassword: password,
    rol: 'ASISTENTE',
    agenciaId: String(agenciaId),
  });
  assert.equal(createManagedAssistant.status, 302);
  const managedAssistantResult = await pool.request()
    .input('email', sql.NVarChar(254), managedAssistantEmail)
    .query('SELECT id, password_hash AS passwordHash, rol, agencia_id AS agenciaId, activo FROM dbo.usuarios WHERE email = @email;');
  const managedAssistant = managedAssistantResult.recordset[0];
  assert.ok(managedAssistant);
  assert.equal(managedAssistant.rol, 'ASISTENTE');
  assert.equal(Number(managedAssistant.agenciaId), agenciaId);
  assert.equal(bcrypt.getRounds(managedAssistant.passwordHash), 12);
  assert.equal(await bcrypt.compare(password, managedAssistant.passwordHash), true);

  const managedAssistantLogin = await login(baseUrl, managedAssistantEmail, password);
  assert.equal(managedAssistantLogin.status, 302);
  const managedAssistantCookie = managedAssistantLogin.headers.get('set-cookie').split(';', 1)[0];
  assert.equal((await fetch(`${baseUrl}/dashboard`, {
    headers: { cookie: managedAssistantCookie }, redirect: 'manual',
  })).status, 403);
  assert.equal((await postForm(`${baseUrl}/admin/usuarios`, managedAssistantCookie, {
    nombre: 'No autorizado', email: `forbidden-${suffix}@adicla.org.gt`, password,
    confirmPassword: password, rol: 'ADMIN', agenciaId: '',
  })).status, 403);

  assert.equal((await postForm(`${baseUrl}/admin/usuarios/${managedAssistant.id}`, adminCookie, {
    rol: 'ASISTENTE', agenciaId: String(agenciaId), activo: 'false',
  })).status, 302);
  assert.equal((await fetch(`${baseUrl}/asistente/nueva-planilla`, {
    headers: { cookie: managedAssistantCookie }, redirect: 'manual',
  })).status, 302);
  assert.equal((await postForm(`${baseUrl}/admin/usuarios/${managedAssistant.id}`, adminCookie, {
    rol: 'ASISTENTE', agenciaId: String(agenciaId), activo: 'true',
  })).status, 302);

  const reactivatedLogin = await login(baseUrl, managedAssistantEmail, password);
  const reactivatedCookie = reactivatedLogin.headers.get('set-cookie').split(';', 1)[0];
  assert.equal((await postForm(`${baseUrl}/admin/usuarios/${managedAssistant.id}`, adminCookie, {
    rol: 'ASISTENTE', agenciaId: String(alternateAgencyId), activo: 'true',
  })).status, 302);
  const revalidatedAgencyResponse = await fetch(`${baseUrl}/asistente/nueva-planilla`, {
    headers: { cookie: reactivatedCookie },
  });
  assert.equal(revalidatedAgencyResponse.status, 200);
  assert.match(await revalidatedAgencyResponse.text(), new RegExp(`Agencia alterna ${suffix}`));

  assert.equal((await postForm(`${baseUrl}/admin/usuarios`, adminCookie, {
    nombre: 'Contabilidad administrada', email: managedAccountingEmail, password,
    confirmPassword: password, rol: 'CONTABILIDAD', agenciaId: String(agenciaId),
  })).status, 302);
  const managedAccountingResult = await pool.request()
    .input('email', sql.NVarChar(254), managedAccountingEmail)
    .query('SELECT id, agencia_id AS agenciaId FROM dbo.usuarios WHERE email = @email;');
  assert.equal(managedAccountingResult.recordset[0].agenciaId, null);
  const managedAccountingLogin = await login(baseUrl, managedAccountingEmail, password);
  const managedAccountingCookie = managedAccountingLogin.headers.get('set-cookie').split(';', 1)[0];
  assert.equal((await fetch(`${baseUrl}/dashboard`, {
    headers: { cookie: managedAccountingCookie }, redirect: 'manual',
  })).status, 403);
  assert.equal((await postForm(`${baseUrl}/admin/usuarios/${managedAssistant.id}`, managedAccountingCookie, {
    rol: 'ASISTENTE', agenciaId: String(agenciaId), activo: 'true',
  })).status, 403);

  for (const invalidUser of [
    { email: managedAssistantEmail, password, confirmPassword: password },
    { email: `external-${suffix}@example.test`, password, confirmPassword: password },
    { email: `short-${suffix}@adicla.org.gt`, password: 'corta', confirmPassword: 'corta' },
  ]) {
    const response = await postForm(`${baseUrl}/admin/usuarios`, adminCookie, {
      nombre: 'Usuario invalido', rol: 'ADMIN', agenciaId: '', ...invalidUser,
    });
    assert.equal(response.status, 400);
  }
  assert.equal((await postForm(`${baseUrl}/admin/usuarios/${adminUser.id}`, adminCookie, {
    rol: 'CONTABILIDAD', agenciaId: '', activo: 'true',
  })).status, 400);
  assert.equal((await postForm(`${baseUrl}/admin/usuarios/${adminUser.id}`, adminCookie, {
    rol: 'ADMIN', agenciaId: '', activo: 'false',
  })).status, 400);

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
  assert.equal((await fetch(`${baseUrl}/contabilidad/planillas`, { headers: { cookie } })).status, 403);
  const correctRole = await fetch(`${baseUrl}/asistente/planillas?fecha=${historyDate}&agenciaId=${alternateAgencyId}`, { headers: { cookie } });
  assert.equal(correctRole.status, 200);
  const historyHtml = await correctRole.text();
  assert.match(historyHtml, new RegExp(`PLN-${suffix}`));
  assert.match(historyHtml, new RegExp(`PLN-G-${suffix}`));
  assert.doesNotMatch(historyHtml, new RegExp(`PLN-ALT-${suffix}`));
  const ownDetailResponse = await fetch(`${baseUrl}/asistente/planillas/${groupedPlanilla.id}`, { headers: { cookie } });
  assert.equal(ownDetailResponse.status, 200);
  const ownDetailHtml = await ownDetailResponse.text();
  assert.match(ownDetailHtml, /19536/);
  assert.match(ownDetailHtml, /19537/);
  assert.match(ownDetailHtml, /Q\s*4,500\.00/);
  assert.match(ownDetailHtml, /Q\s*500\.00/);
  assert.equal((await fetch(`${baseUrl}/asistente/planillas/${alternatePlanilla.id}`, { headers: { cookie } })).status, 404);
  assert.equal((await fetch(`${baseUrl}/asistente/planillas/0`, { headers: { cookie } })).status, 400);
  assert.equal((await fetch(`${baseUrl}/asistente/planillas?fecha=2026-02-30`, { headers: { cookie } })).status, 400);
  const emptyHistory = await fetch(`${baseUrl}/asistente/planillas?fecha=2000-01-01`, { headers: { cookie } });
  assert.equal(emptyHistory.status, 200);
  assert.match(await emptyHistory.text(), /No hay planillas enviadas/);
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
    .query("UPDATE dbo.usuarios SET rol = 'CONTABILIDAD', agencia_id = NULL WHERE id = @userId;");
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
  assert.equal((await fetch(`${baseUrl}/asistente/planillas`, { headers: { cookie: agencyCookie }, redirect: 'manual' })).status, 302);
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
  assert.equal(accountingLogin.status, 302);
  assert.equal(accountingLogin.headers.get('location'), '/contabilidad/planillas');
  const accountingCookie = accountingLogin.headers.get('set-cookie').split(';', 1)[0];
  const oldPendingPlanilla = await planillaRepository.createWithSolicitudes({
    codigo: `PLN-OLD-${suffix}`,
    agenciaId: alternateAgencyId,
    usuarioId: alternateServiceUser.id,
    fechaEnvio: new Date('2020-01-15T15:00:00.000Z'),
    estado: 'ENVIADA',
    numeroActa: dailyActa.numeroActa,
  }, [{
    ...repositorySolicitud,
    numeroSolicitud: `OLD-${suffix}`,
    numeroCheque: `OLD-${suffix}`,
    montoAprobado: 10,
    montoCancelado: 0,
    descuentos: 1,
    montoCheque: 9,
    fechaExtraccion: new Date('2020-01-15T15:00:00.000Z'),
  }]);
  const fixturePlanillaIds = [createdPlanilla.id, groupedPlanilla.id, alternatePlanilla.id];
  async function readAccountingState() {
    const state = await pool.request()
      .input('createdId', sql.BigInt, fixturePlanillaIds[0])
      .input('groupedId', sql.BigInt, fixturePlanillaIds[1])
      .input('alternateId', sql.BigInt, fixturePlanillaIds[2])
      .query(`
        SELECT id, estado, fecha_envio AS fechaEnvio
        FROM dbo.planillas
        WHERE id IN (@createdId, @groupedId, @alternateId)
        ORDER BY id;

        SELECT planilla_id AS planillaId, id, estado, procesado, fecha_procesado AS fechaProcesado
        FROM dbo.solicitudes_planilla
        WHERE planilla_id IN (@createdId, @groupedId, @alternateId)
        ORDER BY planilla_id, id;
      `);
    return state.recordsets.map((rows) => rows.map((row) => ({ ...row })));
  }
  const stateBeforeAccountingGets = await readAccountingState();

  const accountingList = await fetch(`${baseUrl}/contabilidad/planillas?fecha=${historyDate}`, {
    headers: { cookie: accountingCookie },
  });
  assert.equal(accountingList.status, 200);
  const accountingHtml = await accountingList.text();
  assert.match(accountingHtml, new RegExp(`PLN-${suffix}`));
  assert.match(accountingHtml, new RegExp(`PLN-G-${suffix}`));
  assert.match(accountingHtml, new RegExp(`PLN-ALT-${suffix}`));
  assert.match(accountingHtml, new RegExp(`PLN-OLD-${suffix}`));
  assert.match(accountingHtml, new RegExp(`Agencia temporal ${suffix}`));
  assert.match(accountingHtml, new RegExp(`Agencia alterna ${suffix}`));
  assert.match(accountingHtml, new RegExp(dailyActa.numeroActa));
  const csrfTokenMatch = accountingHtml.match(/name="_csrf" value="([A-Za-z0-9_-]+)"/);
  assert.ok(csrfTokenMatch);
  const accountingCsrfToken = csrfTokenMatch[1];

  const primaryAgencyList = await fetch(`${baseUrl}/contabilidad/planillas?fecha=${historyDate}&agencia=${agenciaId}`, {
    headers: { cookie: accountingCookie },
  });
  assert.equal(primaryAgencyList.status, 200);
  const primaryAgencyHtml = await primaryAgencyList.text();
  assert.match(primaryAgencyHtml, new RegExp(`PLN-${suffix}`));
  assert.match(primaryAgencyHtml, new RegExp(`PLN-G-${suffix}`));
  assert.doesNotMatch(primaryAgencyHtml, new RegExp(`PLN-ALT-${suffix}`));
  assert.match(primaryAgencyHtml, /Q\s*8,500\.00/);
  assert.match(primaryAgencyHtml, /Q\s*700\.00/);
  assert.match(primaryAgencyHtml, /Q\s*700\.00/);
  assert.match(primaryAgencyHtml, /Q\s*7,100\.00/);

  const alternateAgencyList = await fetch(`${baseUrl}/contabilidad/planillas?fecha=${historyDate}&agencia=${alternateAgencyId}`, {
    headers: { cookie: accountingCookie },
  });
  assert.equal(alternateAgencyList.status, 200);
  const alternateAgencyHtml = await alternateAgencyList.text();
  assert.match(alternateAgencyHtml, new RegExp(`PLN-ALT-${suffix}`));
  assert.doesNotMatch(alternateAgencyHtml, new RegExp(`PLN-G-${suffix}`));

  const accountingIndividualDetail = await fetch(`${baseUrl}/contabilidad/planillas/${createdPlanilla.id}`, {
    headers: { cookie: accountingCookie },
  });
  assert.equal(accountingIndividualDetail.status, 200);
  const accountingIndividualHtml = await accountingIndividualDetail.text();
  assert.match(accountingIndividualHtml, new RegExp(solicitud.numeroSolicitud));
  assert.match(accountingIndividualHtml, new RegExp(dailyActa.numeroActa));

  const accountingGroupDetail = await fetch(`${baseUrl}/contabilidad/planillas/${groupedPlanilla.id}`, {
    headers: { cookie: accountingCookie },
  });
  assert.equal(accountingGroupDetail.status, 200);
  const accountingGroupHtml = await accountingGroupDetail.text();
  assert.match(accountingGroupHtml, /19536/);
  assert.match(accountingGroupHtml, /19537/);
  assert.match(accountingGroupHtml, /Q\s*4,500\.00/);
  assert.match(accountingGroupHtml, /Q\s*500\.00/);

  const accountingAlternateDetail = await fetch(`${baseUrl}/contabilidad/planillas/${alternatePlanilla.id}`, {
    headers: { cookie: accountingCookie },
  });
  assert.equal(accountingAlternateDetail.status, 200);
  assert.match(await accountingAlternateDetail.text(), new RegExp(`Agencia alterna ${suffix}`));
  assert.equal((await fetch(`${baseUrl}/contabilidad/planillas/0`, { headers: { cookie: accountingCookie } })).status, 400);
  assert.equal((await fetch(`${baseUrl}/contabilidad/planillas/999999999999999`, { headers: { cookie: accountingCookie } })).status, 404);
  assert.equal((await fetch(`${baseUrl}/contabilidad/planillas?agencia=0`, { headers: { cookie: accountingCookie } })).status, 400);
  assert.equal((await fetch(`${baseUrl}/contabilidad/planillas?agencia=999999999`, { headers: { cookie: accountingCookie } })).status, 400);
  assert.equal((await fetch(`${baseUrl}/contabilidad/planillas?page=0`, { headers: { cookie: accountingCookie } })).status, 400);
  const stateAfterAccountingGets = await readAccountingState();
  assert.deepEqual(stateAfterAccountingGets, stateBeforeAccountingGets);

  const requestsBeforeDecision = await pool.request()
    .input('createdId', sql.BigInt, createdPlanilla.id)
    .input('alternateId', sql.BigInt, alternatePlanilla.id)
    .query(`
      SELECT planilla_id AS planillaId, id, estado, procesado, fecha_procesado AS fechaProcesado
      FROM dbo.solicitudes_planilla
      WHERE planilla_id IN (@createdId, @alternateId)
      ORDER BY planilla_id, id;
    `);
  const transferredResponse = await fetch(`${baseUrl}/contabilidad/planillas/${createdPlanilla.id}/traslado`, {
    method: 'POST',
    headers: { cookie: accountingCookie, 'content-type': 'application/json', 'x-csrf-token': accountingCsrfToken },
    body: JSON.stringify({ trasladado: true, usuarioId: 999, fechaDecisionTraslado: '2000-01-01' }),
  });
  assert.equal(transferredResponse.status, 200);
  assert.equal((await transferredResponse.json()).data.decision.trasladado, true);
  const notTransferredResponse = await fetch(`${baseUrl}/contabilidad/planillas/${alternatePlanilla.id}/traslado`, {
    method: 'POST',
    headers: { cookie: accountingCookie, 'content-type': 'application/json', 'x-csrf-token': accountingCsrfToken },
    body: JSON.stringify({ trasladado: false }),
  });
  assert.equal(notTransferredResponse.status, 200);
  assert.equal((await notTransferredResponse.json()).data.decision.trasladado, false);

  const decisions = await pool.request()
    .input('createdId', sql.BigInt, createdPlanilla.id)
    .input('alternateId', sql.BigInt, alternatePlanilla.id)
    .query(`
      SELECT id, trasladado, fecha_decision_traslado AS fechaDecisionTraslado,
             decision_traslado_usuario_id AS decisionTrasladoUsuarioId, estado
      FROM dbo.planillas
      WHERE id IN (@createdId, @alternateId)
      ORDER BY id;
    `);
  assert.deepEqual(decisions.recordset.map((row) => Boolean(row.trasladado)), [true, false]);
  assert.ok(decisions.recordset.every((row) => Number(row.decisionTrasladoUsuarioId) === Number(accountingUser.id)));
  assert.ok(decisions.recordset.every((row) => row.fechaDecisionTraslado instanceof Date));
  assert.ok(decisions.recordset.every((row) => row.estado === 'ENVIADA'));

  const requestsAfterDecision = await pool.request()
    .input('createdId', sql.BigInt, createdPlanilla.id)
    .input('alternateId', sql.BigInt, alternatePlanilla.id)
    .query(`
      SELECT planilla_id AS planillaId, id, estado, procesado, fecha_procesado AS fechaProcesado
      FROM dbo.solicitudes_planilla
      WHERE planilla_id IN (@createdId, @alternateId)
      ORDER BY planilla_id, id;
    `);
  assert.deepEqual(requestsAfterDecision.recordset, requestsBeforeDecision.recordset);

  const pendingAfterDecisions = await fetch(`${baseUrl}/contabilidad/planillas`, { headers: { cookie: accountingCookie } });
  const pendingAfterDecisionsHtml = await pendingAfterDecisions.text();
  assert.doesNotMatch(pendingAfterDecisionsHtml, new RegExp(`PLN-${suffix}(?![-A-Z])`));
  assert.doesNotMatch(pendingAfterDecisionsHtml, new RegExp(`PLN-ALT-${suffix}`));
  assert.match(pendingAfterDecisionsHtml, new RegExp(`PLN-OLD-${suffix}`));

  const secondDecision = await fetch(`${baseUrl}/contabilidad/planillas/${createdPlanilla.id}/traslado`, {
    method: 'POST',
    headers: { cookie: accountingCookie, 'content-type': 'application/json', 'x-csrf-token': accountingCsrfToken },
    body: JSON.stringify({ trasladado: false }),
  });
  assert.equal(secondDecision.status, 409);
  assert.equal((await secondDecision.json()).error.code, 'TRANSFER_DECISION_ALREADY_MADE');

  const decisionDate = getOperationalDate(new Date());
  const historyResponse = await fetch(`${baseUrl}/contabilidad/historial?fecha=${decisionDate}`, {
    headers: { cookie: accountingCookie },
  });
  assert.equal(historyResponse.status, 200);
  const transferHistoryHtml = await historyResponse.text();
  assert.match(transferHistoryHtml, new RegExp(`PLN-${suffix}`));
  assert.match(transferHistoryHtml, new RegExp(`PLN-ALT-${suffix}`));
  assert.match(transferHistoryHtml, /Trasladada/);
  assert.match(transferHistoryHtml, /No trasladada/);
  assert.match(transferHistoryHtml, /Contabilidad temporal/);
  assert.match(transferHistoryHtml, new RegExp(dailyActa.numeroActa));

  const transferredHistory = await fetch(`${baseUrl}/contabilidad/historial?fecha=${decisionDate}&agencia=${agenciaId}&resultado=trasladadas`, { headers: { cookie: accountingCookie } });
  const transferredHistoryHtml = await transferredHistory.text();
  assert.match(transferredHistoryHtml, new RegExp(`PLN-${suffix}`));
  assert.doesNotMatch(transferredHistoryHtml, new RegExp(`PLN-ALT-${suffix}`));
  const notTransferredHistory = await fetch(`${baseUrl}/contabilidad/historial?fecha=${decisionDate}&agencia=${alternateAgencyId}&resultado=no-trasladadas`, { headers: { cookie: accountingCookie } });
  const notTransferredHistoryHtml = await notTransferredHistory.text();
  assert.match(notTransferredHistoryHtml, new RegExp(`PLN-ALT-${suffix}`));
  assert.doesNotMatch(notTransferredHistoryHtml, new RegExp(`PLN-${suffix}(?![-A-Z])`));

  assert.equal((await fetch(`${baseUrl}/contabilidad/planillas/${oldPendingPlanilla.id}/traslado`, {
    method: 'POST', headers: { cookie: reactivatedCookie, 'content-type': 'application/json' }, body: JSON.stringify({ trasladado: true }),
  })).status, 403);
  assert.equal((await fetch(`${baseUrl}/contabilidad/planillas/${oldPendingPlanilla.id}/traslado`, {
    method: 'POST', headers: { cookie: adminCookie, 'content-type': 'application/json' }, body: JSON.stringify({ trasladado: true }),
  })).status, 403);
  assert.equal((await fetch(`${baseUrl}/contabilidad/planillas/${oldPendingPlanilla.id}/traslado`, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trasladado: true }),
  })).status, 302);
  assert.equal((await fetch(`${baseUrl}/contabilidad/planillas/${oldPendingPlanilla.id}/traslado`, {
    method: 'POST', headers: { cookie: accountingCookie, 'content-type': 'application/json' }, body: JSON.stringify({ trasladado: true }),
  })).status, 403);
  assert.equal((await fetch(`${baseUrl}/contabilidad/planillas/${oldPendingPlanilla.id}/traslado`, {
    method: 'POST', headers: { cookie: accountingCookie, 'content-type': 'application/json', 'x-csrf-token': accountingCsrfToken }, body: JSON.stringify({ trasladado: 'si' }),
  })).status, 400);
  assert.equal((await fetch(`${baseUrl}/contabilidad/planillas/0/traslado`, {
    method: 'POST', headers: { cookie: accountingCookie, 'content-type': 'application/json', 'x-csrf-token': accountingCsrfToken }, body: JSON.stringify({ trasladado: true }),
  })).status, 400);
  const malformedDecision = await fetch(`${baseUrl}/contabilidad/planillas/${oldPendingPlanilla.id}/traslado`, {
    method: 'POST',
    headers: { cookie: accountingCookie, 'content-type': 'application/json', 'x-csrf-token': accountingCsrfToken },
    body: '{',
  });
  assert.equal(malformedDecision.status, 400);
  assert.equal((await malformedDecision.json()).error.code, 'INVALID_JSON');

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
