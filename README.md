# Planilla Checks

Aplicacion web para administrar planillas de creditos y cheques entre asistentes de agencia, contabilidad y administradores.

## Tecnologias

- Node.js 22+, Express 5, CommonJS y EJS.
- SQL Server Express con SQL explicito mediante `mssql` y `msnodesqlv8`.
- Autenticacion con `bcrypt` y sesiones con `express-session`.
- Bootstrap 5 y Nodemon.

## Requisitos

- Node.js 22 o superior y npm. Esta es la version minima coherente con las dependencias bloqueadas actuales.
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
TEST_DB_DATABASE=PlanillaChecksTestDB
DB_DRIVER=ODBC Driver 18 for SQL Server
DB_ENCRYPT=false
DB_TRUST_SERVER_CERTIFICATE=true
DB_POOL_MAX=10
WEBSERVICE_BASE_URL=http://adicla-app.iso.com.gt:7001/ServicioSolicitudesREST/ServicioSolicitudes.svc
WEBSERVICE_TIMEOUT_MS=8000
```

No se necesitan `DB_USER` ni `DB_PASSWORD`: la conexion utiliza la identidad de Windows del proceso.

En produccion, `SESSION_SECRET` debe tener un valor real. La aplicacion rechaza valores vacios y placeholders documentados como `change_this_secret`, `development_only_secret` y `replace_with_a_long_random_secret`.

## Crear la base

Los scripts son incrementales y pueden volver a ejecutarse de forma segura sobre el esquema que crean. No eliminan bases ni datos existentes. `DB_DATABASE` es obligatorio para Node y debe pasarse tambien a `sqlcmd`; los scripts no tienen una base destino implicita.

```powershell
$database = $env:DB_DATABASE
# Solo para crear la base inicial predeterminada PlanillaChecksDB:
sqlcmd -S ".\SQLEXPRESS" -E -C -i "database\001_create_database.sql" -b
sqlcmd -S ".\SQLEXPRESS" -E -C -d "$database" -i "database\002_create_tables.sql" -b
sqlcmd -S ".\SQLEXPRESS" -E -C -d "$database" -i "database\003_create_indexes.sql" -b
```

No se incluyen agencias de demostracion. Las agencias institucionales deben cargarse con sus codigos y nombres reales antes de crear asistentes.

`001_create_database.sql` es un bootstrap opcional que crea unicamente `PlanillaChecksDB`. Para otro `DB_DATABASE`, la base debe existir previamente y los scripts `002` y `003` deben ejecutarse con `-d` apuntando explicitamente a ella.

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

La verificacion integral requiere una base separada existente indicada por `TEST_DB_DATABASE`, cuyo nombre debe terminar en `TestDB` y ser distinto de `DB_DATABASE`. El script cambia a esa base antes de cargar la aplicacion y comprueba `DB_NAME()` antes de crear fixtures. Si la base no existe o no cumple esas condiciones, falla sin operar sobre la base de desarrollo.

La base de pruebas no se crea ni se elimina automaticamente. Un operador debe crearla explicitamente y aplicar `002` y `003` con `sqlcmd -d` antes de ejecutar:

```powershell
npm test
```

La integracion crea datos temporales en la base de pruebas, valida repositorios, sesiones, roles y restricciones, y elimina sus fixtures al finalizar.

## Arquitectura de persistencia

- `database`: scripts SQL versionados.
- `src/config/database.js`: configuracion y pool compartido de SQL Server.
- `src/repositories`: consultas parametrizadas y transacciones.
- `src/services`: autenticacion y reglas de negocio independientes de HTTP.
- `src/controllers`: adaptacion entre solicitudes HTTP y servicios.
- `src/middleware`: autenticacion y autorizacion backend por rol.
- `scripts/create-admin.js`: alta segura del primer administrador.

El login provisional fue reemplazado por consulta a SQL Server y `bcrypt.compare`. La sesion solo guarda `id`, `nombre`, `email`, `rol`, `agenciaId` y el nombre de agencia para presentacion; nunca guarda contrasenas ni hashes. Cada peticion protegida vuelve a consultar el usuario por ID para aplicar inmediatamente desactivaciones y cambios de rol o agencia.

La pantalla Nueva planilla consulta la distribucion mediante `GET /api/solicitudes/:numeroSolicitud/distribucion`. Express llama al Web Service externo, valida la respuesta y la normaliza antes de devolverla al navegador. Obtener datos no inserta registros SQL; los mocks de las otras pantallas permanecen temporalmente.

El contrato, campos, calculos conocidos, errores y reglas pendientes del Web Service estan en [`docs/webservice.md`](docs/webservice.md). El modelo SQL se describe en [`docs/database.md`](docs/database.md) y las reglas funcionales en [`docs/business-rules.md`](docs/business-rules.md).

## Hardening para despliegue

- El Web Service institucional disponible usa HTTP dentro de la red interna; su transporte depende del proveedor.
- El cifrado y los certificados de SQL Server deben definirse segun la infraestructura del despliegue. La configuracion actual corresponde a SQL Server Express local.
- El rate limiting de login es recomendable antes del despliegue definitivo, pero no forma parte de esta etapa interna.
- Los scripts `002` y `003` requieren que el operador o runner seleccione explicitamente la base destino con `sqlcmd -d`.
