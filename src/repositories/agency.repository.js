const { sql, getPool } = require('../config/database');

async function findActive() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT id, codigo, nombre
    FROM dbo.agencias
    WHERE activo = 1
    ORDER BY nombre;
  `);

  return result.recordset;
}

async function findAvailableForAccounting() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT a.id, a.codigo, a.nombre, a.activo
    FROM dbo.agencias AS a
    WHERE a.activo = 1
       OR EXISTS (
          SELECT 1
          FROM dbo.planillas AS p
          WHERE p.agencia_id = a.id
            AND p.fecha_envio IS NOT NULL
       )
    ORDER BY a.nombre;
  `);

  return result.recordset;
}

async function findAll() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT a.id,
           a.codigo,
           a.nombre,
           a.activo,
           COUNT(u.id) AS usuarios
    FROM dbo.agencias AS a
    LEFT JOIN dbo.usuarios AS u ON u.agencia_id = a.id
    GROUP BY a.id, a.codigo, a.nombre, a.activo
    ORDER BY a.nombre;
  `);

  return result.recordset;
}

async function findAdminDashboardSummary() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT COUNT(*) AS totalAgencias,
           COALESCE(SUM(CASE WHEN activo = 1 THEN 1 ELSE 0 END), 0) AS agenciasActivas,
           COALESCE(SUM(CASE WHEN activo = 0 THEN 1 ELSE 0 END), 0) AS agenciasInactivas
    FROM dbo.agencias;

    SELECT a.id,
           a.codigo,
           a.nombre,
           a.activo,
           COUNT(u.id) AS asistentes
    FROM dbo.agencias AS a
    LEFT JOIN dbo.usuarios AS u
      ON u.agencia_id = a.id
     AND u.rol = 'ASISTENTE'
    GROUP BY a.id, a.codigo, a.nombre, a.activo
    ORDER BY a.nombre;
  `);

  return {
    summary: result.recordsets[0][0],
    assistantsByAgency: result.recordsets[1],
  };
}

async function findById(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query(`
      SELECT id, codigo, nombre, activo
      FROM dbo.agencias
      WHERE id = @id;
    `);

  return result.recordset[0] || null;
}

module.exports = {
  findAll,
  findAdminDashboardSummary,
  findActive,
  findAvailableForAccounting,
  findById,
};
