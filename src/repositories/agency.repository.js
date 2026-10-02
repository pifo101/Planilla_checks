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
           AND p.estado IN ('ENVIADA', 'RECIBIDA', 'PROCESADA')
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
  findActive,
  findAvailableForAccounting,
  findById,
};
