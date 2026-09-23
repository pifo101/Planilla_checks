const { sql, getPool } = require('../config/database');

async function findByEmail(email) {
  const pool = await getPool();
  const result = await pool.request()
    .input('email', sql.NVarChar(254), email)
    .query(`
      SELECT u.id,
             u.nombre,
             u.email,
             u.password_hash AS passwordHash,
             u.rol,
             u.agencia_id AS agenciaId,
             u.activo,
             a.nombre AS agenciaNombre,
             a.activo AS agenciaActivo
      FROM dbo.usuarios AS u
      LEFT JOIN dbo.agencias AS a ON a.id = u.agencia_id
      WHERE u.email = @email;
    `);

  return result.recordset[0] || null;
}

async function create({ nombre, email, passwordHash, rol, agenciaId = null, activo = true }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('nombre', sql.NVarChar(150), nombre)
    .input('email', sql.NVarChar(254), email)
    .input('passwordHash', sql.NVarChar(255), passwordHash)
    .input('rol', sql.VarChar(20), rol)
    .input('agenciaId', sql.Int, agenciaId)
    .input('activo', sql.Bit, activo)
    .query(`
      INSERT INTO dbo.usuarios (nombre, email, password_hash, rol, agencia_id, activo)
      OUTPUT inserted.id, inserted.nombre, inserted.email, inserted.rol,
             inserted.agencia_id AS agenciaId, inserted.activo
      VALUES (@nombre, @email, @passwordHash, @rol, @agenciaId, @activo);
    `);

  return result.recordset[0];
}

module.exports = {
  findByEmail,
  create,
};
