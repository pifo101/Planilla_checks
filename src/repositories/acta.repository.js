const { sql, getPool } = require('../config/database');

async function findByDate(fecha) {
  const pool = await getPool();
  const result = await pool.request()
    .input('fecha', sql.Date, fecha)
    .query(`
      SELECT ad.id, CONVERT(CHAR(10), ad.fecha, 23) AS fecha,
             ad.numero_acta AS numeroActa,
             ad.creada_por_usuario_id AS creadaPorUsuarioId,
             ad.fecha_creacion AS fechaCreacion
      FROM dbo.actas_diarias AS ad
      WHERE ad.fecha = @fecha;
    `);
  return result.recordset[0] || null;
}

async function create({ fecha, numeroActa, usuarioId }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('fecha', sql.Date, fecha)
    .input('numeroActa', sql.NVarChar(50), numeroActa)
    .input('usuarioId', sql.Int, usuarioId)
    .query(`
      INSERT INTO dbo.actas_diarias (fecha, numero_acta, creada_por_usuario_id)
      OUTPUT inserted.id, CONVERT(CHAR(10), inserted.fecha, 23) AS fecha,
             inserted.numero_acta AS numeroActa,
             inserted.creada_por_usuario_id AS creadaPorUsuarioId,
             inserted.fecha_creacion AS fechaCreacion
      VALUES (@fecha, @numeroActa, @usuarioId);
    `);
  return result.recordset[0];
}

module.exports = { create, findByDate };
