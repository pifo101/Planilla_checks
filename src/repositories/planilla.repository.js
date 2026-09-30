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
           inserted.creada_por_usuario_id AS usuarioId, inserted.estado,
           inserted.numero_acta AS numeroActa
    VALUES (@codigo, @agenciaId, @usuarioId, @fechaEnvio, @estado, @numeroActa);
  `);

  return result.recordset[0];
}

async function insertSolicitud(transaction, planillaId, solicitud) {
  const result = await new sql.Request(transaction)
    .input('planillaId', sql.BigInt, planillaId)
    .input('numeroSolicitud', sql.NVarChar(50), solicitud.numeroSolicitud)
    .input('miembroId', sql.NVarChar(100), solicitud.miembroId || null)
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
        planilla_id, numero_solicitud, miembro_id, nombre_cliente, monto_aprobado,
        monto_cancelado, descuentos, monto_cheque, numero_cheque,
        metodologia, fecha_extraccion, estado
      )
      OUTPUT inserted.id, inserted.numero_solicitud AS numeroSolicitud,
             inserted.numero_cheque AS numeroCheque
      VALUES (
        @planillaId, @numeroSolicitud, @miembroId, @nombreCliente, @montoAprobado,
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

async function findSentByAgencyAndDate(agenciaId, startDate, endDate, page, pageSize) {
  const pool = await getPool();
  const offset = (page - 1) * pageSize;
  const countResult = await pool.request()
    .input('agenciaId', sql.Int, agenciaId)
    .input('startDate', sql.DateTime2(0), startDate)
    .input('endDate', sql.DateTime2(0), endDate)
    .query(`
      SELECT COUNT(*) AS total
      FROM dbo.planillas AS p
      WHERE p.agencia_id = @agenciaId
        AND p.fecha_envio >= @startDate
        AND p.fecha_envio < @endDate;
    `);
  const total = Number(countResult.recordset[0].total);
  if (offset >= total) return { total, planillas: [] };

  const result = await pool.request()
    .input('agenciaId', sql.Int, agenciaId)
    .input('startDate', sql.DateTime2(0), startDate)
    .input('endDate', sql.DateTime2(0), endDate)
    .input('offset', sql.Int, offset)
    .input('pageSize', sql.Int, pageSize)
    .query(`
      SELECT p.id, p.codigo, p.fecha_envio AS fechaEnvio, p.estado, p.numero_acta AS numeroActa,
             a.id AS agenciaId, a.nombre AS agenciaNombre,
             COUNT(sp.id) AS cantidadRegistros,
             CONVERT(VARCHAR(40), COALESCE(SUM(sp.monto_aprobado), CONVERT(DECIMAL(18, 2), 0))) AS totalAprobado,
             CONVERT(VARCHAR(40), COALESCE(SUM(sp.monto_cancelado), CONVERT(DECIMAL(18, 2), 0))) AS totalCancelado,
             CONVERT(VARCHAR(40), COALESCE(SUM(sp.descuentos), CONVERT(DECIMAL(18, 2), 0))) AS totalDescuentos,
             CONVERT(VARCHAR(40), COALESCE(SUM(sp.monto_cheque), CONVERT(DECIMAL(18, 2), 0))) AS totalMontoCheque
      FROM dbo.planillas AS p
      INNER JOIN dbo.agencias AS a ON a.id = p.agencia_id
      LEFT JOIN dbo.solicitudes_planilla AS sp ON sp.planilla_id = p.id
      WHERE p.agencia_id = @agenciaId
        AND p.fecha_envio >= @startDate
        AND p.fecha_envio < @endDate
      GROUP BY p.id, p.codigo, p.fecha_envio, p.estado, p.numero_acta, a.id, a.nombre
      ORDER BY p.fecha_envio DESC, p.id DESC
      OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY;
    `);

  return {
    total,
    planillas: result.recordset,
  };
}

async function findDetailForAgency(id, agenciaId) {
  const pool = await getPool();
  const request = pool.request()
    .input('id', sql.BigInt, id)
    .input('agenciaId', sql.Int, agenciaId);
  const result = await request.query(`
    SELECT p.id, p.codigo, p.fecha_creacion AS fechaCreacion, p.fecha_envio AS fechaEnvio,
           p.estado, p.numero_acta AS numeroActa, a.id AS agenciaId, a.nombre AS agenciaNombre,
           u.id AS usuarioId, u.nombre AS creadaPor,
           COUNT(sp.id) AS cantidadRegistros,
           CONVERT(VARCHAR(40), COALESCE(SUM(sp.monto_aprobado), CONVERT(DECIMAL(18, 2), 0))) AS totalAprobado,
           CONVERT(VARCHAR(40), COALESCE(SUM(sp.monto_cancelado), CONVERT(DECIMAL(18, 2), 0))) AS totalCancelado,
           CONVERT(VARCHAR(40), COALESCE(SUM(sp.descuentos), CONVERT(DECIMAL(18, 2), 0))) AS totalDescuentos,
           CONVERT(VARCHAR(40), COALESCE(SUM(sp.monto_cheque), CONVERT(DECIMAL(18, 2), 0))) AS totalMontoCheque
    FROM dbo.planillas AS p
    INNER JOIN dbo.agencias AS a ON a.id = p.agencia_id
    INNER JOIN dbo.usuarios AS u ON u.id = p.creada_por_usuario_id
    LEFT JOIN dbo.solicitudes_planilla AS sp ON sp.planilla_id = p.id
    WHERE p.id = @id AND p.agencia_id = @agenciaId AND p.fecha_envio IS NOT NULL
    GROUP BY p.id, p.codigo, p.fecha_creacion, p.fecha_envio, p.estado,
             p.numero_acta, a.id, a.nombre, u.id, u.nombre;

    SELECT sp.id, sp.numero_solicitud AS numeroSolicitud, sp.miembro_id AS miembroId,
           sp.nombre_cliente AS nombreCliente,
           CONVERT(VARCHAR(40), sp.monto_aprobado) AS montoAprobado,
           CONVERT(VARCHAR(40), sp.monto_cancelado) AS montoCancelado,
           CONVERT(VARCHAR(40), sp.descuentos) AS descuentos,
           CONVERT(VARCHAR(40), sp.monto_cheque) AS montoCheque, sp.numero_cheque AS numeroCheque,
           sp.metodologia, sp.fecha_extraccion AS fechaExtraccion, sp.estado, sp.procesado,
           sp.fecha_procesado AS fechaProcesado
    FROM dbo.solicitudes_planilla AS sp
    INNER JOIN dbo.planillas AS p ON p.id = sp.planilla_id
    WHERE sp.planilla_id = @id AND p.agencia_id = @agenciaId AND p.fecha_envio IS NOT NULL
    ORDER BY sp.id;
  `);

  if (!result.recordsets[0][0]) {
    return null;
  }

  return { ...result.recordsets[0][0], solicitudes: result.recordsets[1] };
}

async function findSolicitudUsage(numeroSolicitud, numeroCheque) {
  const pool = await getPool();
  const result = await pool.request()
    .input('numeroSolicitud', sql.NVarChar(50), numeroSolicitud)
    .input('numeroCheque', sql.NVarChar(50), numeroCheque)
    .query(`
      SELECT
        CAST(CASE WHEN EXISTS (
          SELECT 1
          FROM dbo.solicitudes_planilla
          WHERE numero_solicitud = @numeroSolicitud
        ) THEN 1 ELSE 0 END AS BIT) AS solicitudUtilizada,
        CAST(CASE WHEN EXISTS (
          SELECT 1
          FROM dbo.solicitudes_planilla
          WHERE numero_cheque = @numeroCheque
        ) THEN 1 ELSE 0 END AS BIT) AS chequeUtilizado;
    `);

  return {
    solicitudUtilizada: Boolean(result.recordset[0].solicitudUtilizada),
    chequeUtilizado: Boolean(result.recordset[0].chequeUtilizado),
  };
}

module.exports = {
  createWithSolicitudes,
  findSentByAgencyAndDate,
  findDetailForAgency,
  findSolicitudUsage,
};
