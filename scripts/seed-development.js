require('dotenv').config({ quiet: true });

const bcrypt = require('bcrypt');
const {
  sql, getDatabaseConfig, getPool, closePool,
} = require('../src/config/database');

const SALT_ROUNDS = 12;
const DEVELOPMENT_DATABASE = 'PlanillaChecksDB';
const AGENCIES = Object.freeze([
  { codigo: '001', nombre: 'AGENCIA SOLOLÁ' },
  { codigo: '002', nombre: 'AGENCIA SANTO TOMÁS LA UNIÓN' },
  { codigo: '004', nombre: 'AGENCIA SAN ANDRÉS SEMETABAJ' },
  { codigo: '005', nombre: 'AGENCIA SANTA LUCÍA COTZUMALGUAPA' },
  { codigo: '006', nombre: 'AGENCIA PATZICIA' },
  { codigo: '007', nombre: 'AGENCIA SAN MARTÍN JILOTEPEQUE' },
  { codigo: '008', nombre: 'AGENCIA TECPAN' },
  { codigo: '009', nombre: 'AGENCIA GUINEALES' },
  { codigo: '010', nombre: 'AGENCIA MAZATENANGO' },
  { codigo: '011', nombre: 'AGENCIA SAN JUAN COMALAPA' },
]);
const ACCOUNT_DEFINITIONS = Object.freeze([
  { prefix: 'ADMIN', rol: 'ADMIN' },
  { prefix: 'ASSISTANT', rol: 'ASISTENTE' },
  { prefix: 'ACCOUNTING', rol: 'CONTABILIDAD' },
]);

function isLocalSqlExpress(server) {
  return /^(localhost|\.|\(local\))\\sqlexpress$/i.test(String(server || '').trim());
}

function validateEnvironment(environment) {
  if (String(environment.NODE_ENV || '').trim().toLowerCase() === 'production') {
    throw new Error('El seed de desarrollo no puede ejecutarse en produccion.');
  }

  const server = String(environment.DB_SERVER || '').trim();
  const database = String(environment.DB_DATABASE || '').trim();
  if (!isLocalSqlExpress(server)) {
    throw new Error('El seed de desarrollo solo puede ejecutarse sobre SQL Server Express local.');
  }
  if (database.toLowerCase() !== DEVELOPMENT_DATABASE.toLowerCase()) {
    throw new Error(`El seed de desarrollo solo puede ejecutarse sobre ${DEVELOPMENT_DATABASE}.`);
  }
}

function readDevelopmentUsers(environment) {
  return ACCOUNT_DEFINITIONS.map(({ prefix, rol }) => {
    const variable = (suffix) => `DEV_${prefix}_${suffix}`;
    const nombre = String(environment[variable('NAME')] || '').trim();
    const email = String(environment[variable('EMAIL')] || '').trim().toLowerCase();
    const password = String(environment[variable('PASSWORD')] || '');

    if (!nombre || !email || !password) {
      throw new Error(`Define ${variable('NAME')}, ${variable('EMAIL')} y ${variable('PASSWORD')} en el entorno.`);
    }
    if (nombre.length > 150) throw new Error(`${variable('NAME')} no puede exceder 150 caracteres.`);
    if (email.length > 254 || !/^[^\s@]+@adicla\.org\.gt$/i.test(email)) {
      throw new Error(`${variable('EMAIL')} debe ser un correo institucional @adicla.org.gt valido.`);
    }
    if (password.length < 12) {
      throw new Error(`${variable('PASSWORD')} debe tener al menos 12 caracteres.`);
    }

    return { nombre, email, password, rol };
  });
}

function planAgencyCatalog(existingAgencies) {
  const existingByCode = new Map(existingAgencies.map((agency) => [agency.codigo, agency]));
  const desiredCodes = new Set(AGENCIES.map((agency) => agency.codigo));
  return {
    upserts: AGENCIES.filter((agency) => {
      const existing = existingByCode.get(agency.codigo);
      return !existing || existing.nombre !== agency.nombre || !existing.activo;
    }),
    extras: existingAgencies.filter((agency) => !desiredCodes.has(agency.codigo)),
  };
}

function resolveAssistantAgencyCode(configuredCode, agencies) {
  const selectedCode = String(configuredCode || '').trim();
  if (!selectedCode) {
    throw new Error('DEV_ASSISTANT_AGENCY_CODE es obligatorio para crear el ASISTENTE.');
  }

  const agency = agencies.find((item) => item.codigo === selectedCode);
  if (!agency || !agency.activo) {
    throw new Error(`DEV_ASSISTANT_AGENCY_CODE=${selectedCode} no corresponde a una agencia operativa activa.`);
  }
  return selectedCode;
}

async function upsertAgency(transaction, agency) {
  await new sql.Request(transaction)
    .input('codigo', sql.NVarChar(30), agency.codigo)
    .input('nombre', sql.NVarChar(150), agency.nombre)
    .query(`
      UPDATE dbo.agencias
      SET nombre = @nombre, activo = 1, updated_at = SYSUTCDATETIME()
      WHERE codigo = @codigo;

      IF @@ROWCOUNT = 0
      BEGIN
        INSERT INTO dbo.agencias (codigo, nombre, activo)
        VALUES (@codigo, @nombre, 1);
      END;
    `);
}

async function upsertUser(transaction, user, agenciaId) {
  const result = await new sql.Request(transaction)
    .input('email', sql.NVarChar(254), user.email)
    .query('SELECT password_hash AS passwordHash FROM dbo.usuarios WHERE email = @email;');
  const existing = result.recordset[0];
  const passwordMatches = existing
    ? await bcrypt.compare(user.password, existing.passwordHash)
    : false;
  const passwordHash = passwordMatches
    ? existing.passwordHash
    : await bcrypt.hash(user.password, SALT_ROUNDS);

  await new sql.Request(transaction)
    .input('nombre', sql.NVarChar(150), user.nombre)
    .input('email', sql.NVarChar(254), user.email)
    .input('passwordHash', sql.NVarChar(255), passwordHash)
    .input('rol', sql.VarChar(20), user.rol)
    .input('agenciaId', sql.Int, agenciaId)
    .query(`
      IF EXISTS (SELECT 1 FROM dbo.usuarios WHERE email = @email)
      BEGIN
        UPDATE dbo.usuarios
        SET nombre = @nombre,
            password_hash = @passwordHash,
            rol = @rol,
            agencia_id = @agenciaId,
            activo = 1,
            updated_at = SYSUTCDATETIME()
        WHERE email = @email
          AND (
            nombre <> @nombre
            OR password_hash <> @passwordHash
            OR rol <> @rol
            OR ISNULL(agencia_id, -1) <> ISNULL(@agenciaId, -1)
            OR activo <> 1
          );
      END
      ELSE
      BEGIN
        INSERT INTO dbo.usuarios (nombre, email, password_hash, rol, agencia_id, activo)
        VALUES (@nombre, @email, @passwordHash, @rol, @agenciaId, 1);
      END;
    `);
}

async function seedDevelopment(environment = process.env) {
  validateEnvironment(environment);
  const users = readDevelopmentUsers(environment);
  const pool = await getPool();
  const databaseResult = await pool.request().query('SELECT DB_NAME() AS databaseName;');
  const actualDatabase = databaseResult.recordset[0].databaseName;
  const configuredDatabase = getDatabaseConfig().database;
  if (actualDatabase.toLowerCase() !== configuredDatabase.toLowerCase()
      || actualDatabase.toLowerCase() !== DEVELOPMENT_DATABASE.toLowerCase()) {
    throw new Error('La conexion SQL no corresponde a la base local de desarrollo permitida.');
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    const existingResult = await new sql.Request(transaction).query(`
      SELECT codigo, nombre, activo
      FROM dbo.agencias;
    `);
    const catalogPlan = planAgencyCatalog(existingResult.recordset);
    for (const agency of catalogPlan.upserts) await upsertAgency(transaction, agency);

    const agenciesResult = await new sql.Request(transaction).query(`
      SELECT id, codigo, nombre, activo
      FROM dbo.agencias
      WHERE codigo IN ('001', '002', '004', '005', '006', '007', '008', '009', '010', '011');
    `);
    const assistantAgencyCode = resolveAssistantAgencyCode(
      environment.DEV_ASSISTANT_AGENCY_CODE,
      agenciesResult.recordset,
    );
    const assistantAgency = agenciesResult.recordset.find(
      (agency) => agency.codigo === assistantAgencyCode,
    );

    for (const user of users) {
      await upsertUser(transaction, user, user.rol === 'ASISTENTE' ? assistantAgency.id : null);
    }

    await transaction.commit();
    return {
      agencyCount: AGENCIES.length,
      userCount: users.length,
      assistantAgencyCode,
      extraAgencyCodes: catalogPlan.extras.map((agency) => agency.codigo),
    };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function main() {
  const result = await seedDevelopment();
  console.log(
    `Seed completado: ${result.agencyCount} agencias operativas actualizadas, ${result.userCount} usuarios locales, ASISTENTE en agencia ${result.assistantAgencyCode}.`,
  );
  if (result.extraAgencyCodes.length > 0) {
    console.warn(`Agencias adicionales conservadas: ${result.extraAgencyCodes.join(', ')}.`);
  }
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(closePool);
}

module.exports = {
  ACCOUNT_DEFINITIONS,
  AGENCIES,
  DEVELOPMENT_DATABASE,
  SALT_ROUNDS,
  isLocalSqlExpress,
  planAgencyCatalog,
  readDevelopmentUsers,
  resolveAssistantAgencyCode,
  seedDevelopment,
  validateEnvironment,
};
