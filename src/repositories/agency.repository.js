const { getPool } = require('../config/database');

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

module.exports = {
  findActive,
};
