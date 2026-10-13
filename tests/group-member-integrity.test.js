const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

function read(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('baseline y migracion preservan miembro_id en el trigger INSTEAD OF UPDATE', () => {
  for (const relativePath of [
    'database/002_create_tables.sql',
    'database/009_preserve_group_member_updates.sql',
  ]) {
    const sql = read(relativePath);
    assert.match(sql, /CREATE OR ALTER TRIGGER dbo\.TR_solicitudes_bloquear_procesadas/);
    assert.match(sql, /miembro_id\s*=\s*source\.miembro_id/);
    assert.match(sql, /INNER JOIN inserted AS source ON source\.id = target\.id/);
  }
});

test('persistencia inserta identidad y montos de cada integrante en la misma fila', () => {
  const repository = read('src/repositories/planilla.repository.js');
  assert.match(repository, /\.input\('miembroId',[\s\S]+solicitud\.miembroId/);
  assert.match(repository, /miembro_id, nombre_cliente, monto_aprobado/);
  assert.match(repository, /@miembroId, @nombreCliente, @montoAprobado/);
  assert.match(read('database/002_create_tables.sql'), /UQ_solicitudes_numero_solicitud_miembro UNIQUE \(numero_solicitud, miembro_id\)/);
  assert.match(read('database/008_request_planilla_integrity.sql'), /PRIMARY KEY[\s\S]+numero_solicitud/);
});

test('documentacion de despliegue exige aplicar la migracion 009', () => {
  assert.match(read('README.md'), /002` a `009/);
  assert.match(read('README.md'), /009_preserve_group_member_updates\.sql/);
  assert.match(read('docs/database.md'), /009_preserve_group_member_updates\.sql/);
});
