const { sql, getPool } = require('../config/database');

function addPlanillaInputs(request, planilla) {
  return request
    .input('codigo', sql.NVarChar(40), planilla.codigo)
    .input('agenciaId', sql.Int, planilla.agenciaId)
    .input('usuarioId', sql.Int, planilla.usuarioId)
    .input('fechaEnvio', sql.DateTime2(0), planilla.fechaEnvio || null)
    .input('estado', sql.VarChar(20), planilla.estado || 'BORRADOR')
    .input('numeroActa', sql.NVarChar(50), planilla.numeroActa || null);
}

async function insertPlanilla(transaction, planilla) {
  const result = await addPlanillaInputs(new sql.Request(transaction), planilla).query(`
    INSERT INTO dbo.planillas (
      codigo, agencia_id, creada_por_usuario_id, fecha_envio, estado, numero_acta
    )
    OUTPUT inserted.id, inserted.codigo, inserted.agencia_id AS agenciaId,
           inserted.creada_por_usuario_id AS usuarioId, inserted.estado
    VALUES (@codigo, @agenciaId, @usuarioId, @fechaEnvio, @estado, @numeroActa);
  `);

  return result.recordset[0];
}

async function insertSolicitud(transaction, planillaId, solicitud) {
  const result = await new sql.Request(transaction)
    .input('planillaId', sql.BigInt, planillaId)
    .input('numeroSolicitud', sql.NVarChar(50), solicitud.numeroSolicitud)
    .input('nombreCliente', sql.NVarChar(200), solicitud.nombreCliente)
    .input('montoAprobado', sql.Decimal(18, 2), solicitud.montoAprobado)
    .input('montoCancelado', sql.Decimal(18, 2), solicitud.montoCancelado || 0)
    .input('descuentos', sql.Decimal(18, 2), solicitud.descuentos || 0)
    .input('montoCheque', sql.Decimal(18, 2), solicitud.montoCheque)
    .input('numeroCheque', sql.NVarChar(50), solicitud.numeroCheque)
    .input('metodologia', sql.NVarChar(100), solicitud.metodologia || null)
    .input('fechaExtraccion', sql.DateTime2(0), solicitud.fechaExtraccion)
    .input('estado', sql.VarChar(20), solicitud.estado || 'PENDIENTE')
    .query(`
      INSERT INTO dbo.solicitudes_planilla (
        planilla_id, numero_solicitud, nombre_cliente, monto_aprobado,
        monto_cancelado, descuentos, monto_cheque, numero_cheque,
        metodologia, fecha_extraccion, estado
      )
      OUTPUT inserted.id, inserted.numero_solicitud AS numeroSolicitud,
             inserted.numero_cheque AS numeroCheque
      VALUES (
        @planillaId, @numeroSolicitud, @nombreCliente, @montoAprobado,
        @montoCancelado, @descuentos, @montoCheque, @numeroCheque,
        @metodologia, @fechaExtraccion, @estado
      );
    `);

  return result.recordset[0];
}

async function createWithSolicitudes(planilla, solicitudes) {
  const pool = await getPool();
  const transaction = new sql.Transaction(pool);

  await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);

  try {
    const created = await insertPlanilla(transaction, planilla);
    const createdSolicitudes = [];

    for (const solicitud of solicitudes) {
      createdSolicitudes.push(await insertSolicitud(transaction, created.id, solicitud));
    }

    await transaction.commit();
    return { ...created, solicitudes: createdSolicitudes };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch (rollbackError) {
      if (!transaction._aborted) {
        throw rollbackError;
      }
    }
    throw error;
  }
}

async function findByDate(fecha) {
  const pool = await getPool();
  const result = await pool.request()
    .input('fecha', sql.Date, fecha)
    .query(`
      SELECT p.id, p.codigo, p.fecha_creacion AS fechaCreacion,
             p.fecha_envio AS fechaEnvio, p.estado, a.id AS agenciaId, a.nombre AS agenciaNombre
      FROM dbo.planillas AS p
      INNER JOIN dbo.agencias AS a ON a.id = p.agencia_id
      WHERE p.fecha_creacion >= @fecha
        AND p.fecha_creacion < DATEADD(DAY, 1, @fecha)
      ORDER BY p.fecha_creacion DESC;
    `);

  return result.recordset;
}

async function findByAgency(agenciaId) {
  const pool = await getPool();
  const result = await pool.request()
    .input('agenciaId', sql.Int, agenciaId)
    .query(`
      SELECT p.id, p.codigo, p.fecha_creacion AS fechaCreacion,
             p.fecha_envio AS fechaEnvio, p.estado
      FROM dbo.planillas AS p
      WHERE p.agencia_id = @agenciaId
      ORDER BY p.fecha_creacion DESC;
    `);

  return result.recordset;
}

async function findDetail(id) {
  const pool = await getPool();
  const request = pool.request().input('id', sql.BigInt, id);
  const result = await request.query(`
    SELECT p.id, p.codigo, p.fecha_creacion AS fechaCreacion, p.fecha_envio AS fechaEnvio,
           p.estado, p.numero_acta AS numeroActa, a.id AS agenciaId, a.nombre AS agenciaNombre,
           u.id AS usuarioId, u.nombre AS creadaPor
    FROM dbo.planillas AS p
    INNER JOIN dbo.agencias AS a ON a.id = p.agencia_id
    INNER JOIN dbo.usuarios AS u ON u.id = p.creada_por_usuario_id
    WHERE p.id = @id;

    SELECT id, numero_solicitud AS numeroSolicitud, nombre_cliente AS nombreCliente,
           monto_aprobado AS montoAprobado, monto_cancelado AS montoCancelado,
           descuentos, monto_cheque AS montoCheque, numero_cheque AS numeroCheque,
           metodologia, fecha_extraccion AS fechaExtraccion, estado, procesado,
           fecha_procesado AS fechaProcesado
    FROM dbo.solicitudes_planilla
    WHERE planilla_id = @id
    ORDER BY id;
  `);

  if (!result.recordsets[0][0]) {
    return null;
  }

  return { ...result.recordsets[0][0], solicitudes: result.recordsets[1] };
}

module.exports = {
  createWithSolicitudes,
  findByDate,
  findByAgency,
  findDetail,
};
