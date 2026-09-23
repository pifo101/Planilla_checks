# Planilla Checks

Aplicacion web para administrar planillas de creditos y cheques entre asistentes de agencia, contabilidad y administradores.

## Tecnologias

- Node.js 18+, Express 5, CommonJS y EJS.
- SQL Server Express con SQL explicito mediante `mssql` y `msnodesqlv8`.
- Autenticacion con `bcrypt` y sesiones con `express-session`.
- Bootstrap 5 y Nodemon.

## Requisitos

- Node.js 18 o superior y npm.
- SQL Server Express.
- ODBC Driver 18 for SQL Server.
- `sqlcmd` para ejecutar los scripts documentados.

La configuracion comprobada durante el desarrollo usa `localhost\SQLEXPRESS` con autenticacion integrada de Windows. La cuenta de Windows que ejecuta Node debe tener acceso a `PlanillaChecksDB`.

## Instalacion

```powershell
npm install
Copy-Item .env.example .env
```

Configurar `.env` sin incluirlo en Git:

```dotenv
PORT=3000
SESSION_SECRET=replace_with_a_long_random_secret
DB_SERVER=localhost\SQLEXPRESS
DB_DATABASE=PlanillaChecksDB
DB_DRIVER=ODBC Driver 18 for SQL Server
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
DB_POOL_MAX=10
```

No se necesitan `DB_USER` ni `DB_PASSWORD`: la conexion utiliza la identidad de Windows del proceso.

## Crear la base

Los scripts son incrementales y pueden volver a ejecutarse de forma segura sobre el esquema que crean. No eliminan bases ni datos existentes.

```powershell
sqlcmd -S ".\SQLEXPRESS" -E -C -i "database\001_create_database.sql" -b
sqlcmd -S ".\SQLEXPRESS" -E -C -i "database\002_create_tables.sql" -b
sqlcmd -S ".\SQLEXPRESS" -E -C -i "database\003_create_indexes.sql" -b
```

No se incluyen agencias de demostracion. Las agencias institucionales deben cargarse con sus codigos y nombres reales antes de crear asistentes.

## Crear el primer administrador

Definir las variables solo en el entorno del proceso y ejecutar el script. La contrasena debe tener al menos 12 caracteres y nunca se guarda en Git.

```powershell
$env:ADMIN_NAME="Nombre del administrador"
$env:ADMIN_EMAIL="admin@institucion.example"
$env:ADMIN_PASSWORD="una-contrasena-segura"
npm run create-admin
Remove-Item Env:ADMIN_PASSWORD
```

El script genera un hash bcrypt con 12 rounds. Los roles `ADMIN` y `CONTABILIDAD` pueden no tener agencia; `ASISTENTE` siempre requiere una agencia valida.

## Iniciar y probar

```powershell
npm start
```

La aplicacion queda en `http://localhost:3000`. Para recarga automatica usar `npm run dev`.

La verificacion integral requiere la base configurada en `.env`. Crea datos temporales, prueba repositorios, bcrypt, login, usuario inactivo, permisos y restricciones UNIQUE, y elimina los datos al finalizar:

```powershell
npm test
```

## Arquitectura de persistencia

- `database`: scripts SQL versionados.
- `src/config/database.js`: configuracion y pool compartido de SQL Server.
- `src/repositories`: consultas parametrizadas y transacciones.
- `src/services`: autenticacion y reglas de negocio independientes de HTTP.
- `src/controllers`: adaptacion entre solicitudes HTTP y servicios.
- `src/middleware`: autenticacion y autorizacion backend por rol.
- `scripts/create-admin.js`: alta segura del primer administrador.

El login provisional fue reemplazado por consulta a SQL Server y `bcrypt.compare`. La sesion solo guarda `id`, `nombre`, `email`, `rol`, `agenciaId` y el nombre de agencia para presentacion; nunca guarda contrasenas ni hashes.

El Web Service externo sigue aislado como placeholder en `src/services/webservice.service.js`. Los mocks de planillas y usuarios permanecen temporalmente para evitar reemplazos inseguros de interfaz.

El modelo, relaciones, indices y decision temporal sobre actas se describen en [`docs/database.md`](docs/database.md). Las reglas funcionales estan en [`docs/business-rules.md`](docs/business-rules.md).
