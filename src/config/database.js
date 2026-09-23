const sql = require('mssql/msnodesqlv8');

let pool;
let poolPromise;

function getDatabaseConfig() {
  const server = String(process.env.DB_SERVER || '').trim();
  const database = String(process.env.DB_DATABASE || 'PlanillaChecksDB').trim();

  if (!server) {
    throw new Error('DB_SERVER es obligatorio para conectar con SQL Server.');
  }

  return {
    server,
    database,
    driver: process.env.DB_DRIVER || 'ODBC Driver 18 for SQL Server',
    pool: {
      max: Number.parseInt(process.env.DB_POOL_MAX, 10) || 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      trustedConnection: true,
      encrypt: process.env.DB_ENCRYPT === 'true',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE !== 'false',
    },
  };
}

async function getPool() {
  if (pool?.connected) {
    return pool;
  }

  if (!poolPromise) {
    pool = new sql.ConnectionPool(getDatabaseConfig());
    pool.on('error', (error) => console.error('Error del pool de SQL Server:', error));
    poolPromise = pool.connect().catch((error) => {
      pool = undefined;
      poolPromise = undefined;
      throw error;
    });
  }

  return poolPromise;
}

async function closePool() {
  if (pool) {
    await pool.close();
  }

  pool = undefined;
  poolPromise = undefined;
}

module.exports = {
  sql,
  getPool,
  closePool,
};
