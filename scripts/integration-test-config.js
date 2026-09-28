function configureIntegrationEnvironment(env) {
  const developmentDatabase = String(env.DB_DATABASE || '').trim();
  const testDatabase = String(env.TEST_DB_DATABASE || '').trim();

  if (!developmentDatabase) {
    throw new Error('DB_DATABASE es obligatorio para comprobar que la base de pruebas sea independiente.');
  }
  if (!testDatabase || !/TestDB$/i.test(testDatabase)) {
    throw new Error('TEST_DB_DATABASE debe identificar explicitamente una base de pruebas cuyo nombre termine en TestDB.');
  }
  if (testDatabase.toLowerCase() === developmentDatabase.toLowerCase()) {
    throw new Error('TEST_DB_DATABASE debe ser distinta de DB_DATABASE para proteger los datos de desarrollo.');
  }

  env.NODE_ENV = 'test';
  env.DB_DATABASE = testDatabase;
  return testDatabase;
}

module.exports = { configureIntegrationEnvironment };
