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

async function findById(id) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .query(`
      SELECT u.id,
             u.nombre,
             u.email,
             u.rol,
             u.agencia_id AS agenciaId,
             u.activo,
             a.nombre AS agenciaNombre,
             a.activo AS agenciaActivo
      FROM dbo.usuarios AS u
      LEFT JOIN dbo.agencias AS a ON a.id = u.agencia_id
      WHERE u.id = @id;
    `);

  return result.recordset[0] || null;
}

async function findAll() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT u.id,
           u.nombre,
           u.email,
           u.rol,
           u.agencia_id AS agenciaId,
           u.activo,
           u.created_at AS createdAt,
           a.nombre AS agenciaNombre
    FROM dbo.usuarios AS u
    LEFT JOIN dbo.agencias AS a ON a.id = u.agencia_id
    ORDER BY u.nombre, u.email;
  `);

  return result.recordset;
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

async function updateAdministration(id, { rol, agenciaId = null, activo }) {
  const pool = await getPool();
  const result = await pool.request()
    .input('id', sql.Int, id)
    .input('rol', sql.VarChar(20), rol)
    .input('agenciaId', sql.Int, agenciaId)
    .input('activo', sql.Bit, activo)
    .query(`
      UPDATE dbo.usuarios
      SET rol = @rol,
          agencia_id = @agenciaId,
          activo = @activo,
          updated_at = SYSUTCDATETIME()
      OUTPUT inserted.id, inserted.nombre, inserted.email, inserted.rol,
             inserted.agencia_id AS agenciaId, inserted.activo
      WHERE id = @id;
    `);

  return result.recordset[0] || null;
}

module.exports = {
  findAll,
  findByEmail,
  findById,
  create,
  updateAdministration,
};
