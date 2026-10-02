function configureIntegrationEnvironment(env) {
  const developmentDatabase = String(env.DB_DATABASE || '').trim();
  const testDatabase = String(env.TEST_DB_DATABASE || '').trim();

  if (!developmentDatabase) {
    throw new Error('DB_DATABASE es obligatorio para comprobar que la base de pruebas sea independiente.');
  }
  if (testDatabase.toLowerCase() !== 'planillacheckstestdb') {
    throw new Error('TEST_DB_DATABASE debe ser exactamente PlanillaChecksTestDB.');
  }
  if (testDatabase.toLowerCase() === developmentDatabase.toLowerCase()) {
    throw new Error('TEST_DB_DATABASE debe ser distinta de DB_DATABASE para proteger los datos de desarrollo.');
  }

  env.NODE_ENV = 'test';
  env.DB_DATABASE = testDatabase;
  return testDatabase;
}

module.exports = { configureIntegrationEnvironment };
