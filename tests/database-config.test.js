const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getDatabaseConfig } = require('../src/config/database');

test('usa explicitamente un DB_DATABASE alternativo', () => {
  const originalServer = process.env.DB_SERVER;
  const originalDatabase = process.env.DB_DATABASE;
  try {
    process.env.DB_SERVER = 'servidor-pruebas';
    process.env.DB_DATABASE = 'PlanillaChecksAlterna';
    assert.equal(getDatabaseConfig().database, 'PlanillaChecksAlterna');
  } finally {
    if (originalServer === undefined) delete process.env.DB_SERVER;
    else process.env.DB_SERVER = originalServer;
    if (originalDatabase === undefined) delete process.env.DB_DATABASE;
    else process.env.DB_DATABASE = originalDatabase;
  }
});

test('rechaza una conexion sin DB_DATABASE explicita', () => {
  const originalServer = process.env.DB_SERVER;
  const originalDatabase = process.env.DB_DATABASE;
  try {
    process.env.DB_SERVER = 'servidor-pruebas';
    delete process.env.DB_DATABASE;
    assert.throws(() => getDatabaseConfig(), /DB_DATABASE es obligatorio/);
  } finally {
    if (originalServer === undefined) delete process.env.DB_SERVER;
    else process.env.DB_SERVER = originalServer;
    if (originalDatabase === undefined) delete process.env.DB_DATABASE;
    else process.env.DB_DATABASE = originalDatabase;
  }
});

test('los scripts de esquema no cambian la base seleccionada por el operador', () => {
  for (const file of [
    '002_create_tables.sql', '003_create_indexes.sql', '004_group_members.sql',
    '005_daily_actas.sql', '006_user_role_agency_constraint.sql',
    '007_accounting_transfer_decision.sql', '008_request_planilla_integrity.sql',
  ]) {
    const script = fs.readFileSync(path.join(__dirname, '..', 'database', file), 'utf8');
    assert.doesNotMatch(script, /\bUSE\s+\[/i);
    assert.doesNotMatch(script, /PlanillaChecksDB/);
  }
});

test('baseline y migracion garantizan una sola planilla por numero de solicitud', () => {
  const baseline = fs.readFileSync(path.join(__dirname, '..', 'database', '002_create_tables.sql'), 'utf8');
  const migration = fs.readFileSync(path.join(__dirname, '..', 'database', '008_request_planilla_integrity.sql'), 'utf8');

  for (const script of [baseline, migration]) {
    assert.match(script, /CREATE TABLE dbo\.solicitudes_asignadas/i);
    assert.match(script, /PK_solicitudes_asignadas PRIMARY KEY/i);
    assert.match(script, /FOREIGN KEY \(numero_solicitud, planilla_id\)[\s\S]*REFERENCES dbo\.solicitudes_asignadas/i);
  }
  assert.match(migration, /HAVING COUNT\(DISTINCT planilla_id\) > 1/i);
  assert.match(migration, /THROW 51002/i);
});
