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
  for (const file of ['002_create_tables.sql', '003_create_indexes.sql']) {
    const script = fs.readFileSync(path.join(__dirname, '..', 'database', file), 'utf8');
    assert.doesNotMatch(script, /\bUSE\s+\[/i);
    assert.doesNotMatch(script, /PlanillaChecksDB/);
  }
});
