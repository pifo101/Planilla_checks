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
sqlcmd -S ".\SQLEXPRESS" -E -C -d "$database" -i "database\004_group_members.sql" -b
sqlcmd -S ".\SQLEXPRESS" -E -C -d "$database" -i "database\005_daily_actas.sql" -b
sqlcmd -S ".\SQLEXPRESS" -E -C -d "$database" -i "database\006_user_role_agency_constraint.sql" -b
sqlcmd -S ".\SQLEXPRESS" -E -C -d "$database" -i "database\007_accounting_transfer_decision.sql" -b
sqlcmd -S ".\SQLEXPRESS" -E -C -d "$database" -i "database\008_request_planilla_integrity.sql" -b
```

Para preparar el entorno local, define las variables `DEV_ADMIN_*`, `DEV_ASSISTANT_*`, `DEV_ACCOUNTING_*` y `DEV_ASSISTANT_AGENCY_CODE` documentadas en `.env.example`, usando contrasenas locales de al menos 12 caracteres. Luego ejecuta:

```powershell
npm run seed:dev
```

El seed solo acepta `PlanillaChecksDB` en SQL Server Express local y se bloquea en produccion y en la base de integracion. Dentro de una transaccion crea o actualiza las diez agencias operativas (`001`, `002`, `004` a `011`) y restaura las cuentas locales `ADMIN`, `ASISTENTE` y `CONTABILIDAD`. Es idempotente, no imprime credenciales ni hashes y no elimina agencias adicionales: las conserva y reporta sus codigos para evitar afectar referencias existentes.

`001_create_database.sql` es un bootstrap opcional que crea unicamente `PlanillaChecksDB`. Para otro `DB_DATABASE`, la base debe existir previamente y los scripts `002` a `008` deben ejecutarse con `-d` apuntando explicitamente a ella.

## Crear el primer administrador

Definir las variables solo en el entorno del proceso y ejecutar el script. La contrasena debe tener al menos 12 caracteres y nunca se guarda en Git.

```powershell
$env:ADMIN_NAME="Nombre del administrador"
$env:ADMIN_EMAIL="admin@adicla.org.gt"
$env:ADMIN_PASSWORD="una-contrasena-segura"
npm run create-admin
Remove-Item Env:ADMIN_PASSWORD
```

El script genera un hash bcrypt con 12 rounds y exige correo `@adicla.org.gt`. Es un bootstrap operativo para el primer administrador; una vez disponible ese acceso, solo un `ADMIN` autenticado crea usuarios desde `/admin/usuarios/nuevo`.

La administracion utiliza SQL Server real. Un `ADMIN` puede listar usuarios, crear cuentas, cambiar rol/agencia y bloquear o reactivar accesos. `ADMIN` y `CONTABILIDAD` siempre quedan con `agencia_id = NULL`; `ASISTENTE` requiere una agencia activa. No existe auto-registro publico y `/crear-cuenta` responde 404.

## Iniciar y probar

```powershell
npm start
```

La aplicacion queda en `http://localhost:3000`. Para recarga automatica usar `npm run dev`.

La verificacion integral requiere la base separada existente `PlanillaChecksTestDB`, indicada por `TEST_DB_DATABASE` y distinta de `DB_DATABASE`. El script exige ese nombre exacto, cambia a esa base antes de cargar la aplicacion y comprueba `DB_NAME()` antes de crear fixtures.

La base de pruebas no se crea ni se elimina automaticamente. Un operador debe crearla explicitamente y aplicar `002` a `008` con `sqlcmd -d` antes de ejecutar:

```powershell
npm test
```

La integracion crea datos temporales en la base de pruebas, valida administracion, sesiones, roles, bandeja multiagencia, ambas decisiones de traslado, auditoria, inmutabilidad, historial y solicitudes intactas, y elimina exclusivamente sus fixtures al finalizar.

## Arquitectura de persistencia

- `database`: scripts SQL versionados.
- `src/config/database.js`: configuracion y pool compartido de SQL Server.
- `src/repositories`: consultas parametrizadas y transacciones.
- `src/services`: autenticacion y reglas de negocio independientes de HTTP.
- `src/controllers`: adaptacion entre solicitudes HTTP y servicios.
- `src/middleware`: autenticacion y autorizacion backend por rol.
- `scripts/create-admin.js`: alta segura del primer administrador.

El login provisional fue reemplazado por consulta a SQL Server y `bcrypt.compare`. La sesion solo guarda `id`, `nombre`, `email`, `rol`, `agenciaId` y el nombre de agencia para presentacion; nunca guarda contrasenas ni hashes. Cada peticion protegida vuelve a consultar el usuario por ID para aplicar inmediatamente desactivaciones y cambios de rol o agencia.

`admin.service.js` exige correo institucional `@adicla.org.gt`, nombre de hasta 150 caracteres, contrasena nueva de al menos 12 caracteres y confirmacion coincidente. Genera bcrypt con 12 rounds, normaliza el correo a minusculas y traduce conflictos UNIQUE de correo a un mensaje controlado. El administrador autenticado no puede bloquearse ni quitarse su propio rol. No existe por ahora una regla empresarial para impedir que otro administrador bloquee al ultimo ADMIN activo.

El dashboard de `ADMIN` es de solo lectura y obtiene de SQL Server los totales de usuarios, estados, roles, agencias y la cantidad de asistentes asociados por agencia. No consulta planillas ni presenta una actividad administrativa reciente, porque todavia no existe una auditoria capaz de respaldar ese historial.

La pantalla Nueva planilla del `ASISTENTE` consulta la distribucion mediante `GET /api/solicitudes/:numeroSolicitud/distribucion`. Express llama al Web Service externo, valida la respuesta y la normaliza antes de devolverla al navegador. Obtener datos no inserta registros SQL. El instante de extraccion se normaliza a segundos, se incluye en el snapshot HMAC y se conserva separado de la fecha posterior de envio.

Cada fecha operativa de `America/Guatemala` tiene una sola acta global, compartida por todas las agencias. El primer `ASISTENTE` del dia introduce manualmente el numero; los siguientes reutilizan el valor bloqueado. Sin acta se puede consultar y preparar un borrador, pero no enviarlo. El servidor vuelve a consultar el acta al enviar y guarda su numero como snapshot en la planilla. El acta no puede editarse durante el flujo ordinario; la correccion excepcional queda pendiente de una regla de autorizacion.

`GET /asistente/planillas` y `GET /asistente/planillas/:id` consultan el historial real de SQL Server en modo de solo lectura. La agencia siempre procede de la sesion revalidada, el listado filtra por el dia calendario de Guatemala de `fecha_envio`, pagina 20 planillas por consulta y muestra el snapshot del acta; el detalle conserva una fila por cada solicitud o miembro grupal.

`GET /contabilidad/planillas` muestra las planillas con `trasladado IS NULL`, sin filtro diario; una pendiente antigua permanece hasta que Contabilidad decide. La bandeja se organiza por agencia de origen y `POST /contabilidad/planillas/:id/traslado` decide la planilla completa. El servidor fija usuario y fecha. `trasladado = 1` significa trasladada y `trasladado = 0`, no trasladada; ninguna opcion aprueba o rechaza creditos, procesa solicitudes ni ejecuta desembolsos.

`GET /contabilidad/historial` contiene solo decisiones tomadas y filtra por `fecha_decision_traslado` interpretada con `America/Guatemala`, agencia y resultado. Conserva visible `fecha_envio`, acta, miembros, totales y usuario decisor. `GET /contabilidad/planillas/:id` sigue siendo read-only. Una decision es inmutable en la interfaz normal; su correccion esta pendiente de definicion funcional.

El contrato, campos, calculos conocidos, errores y reglas pendientes del Web Service estan en [`docs/webservice.md`](docs/webservice.md). El modelo SQL se describe en [`docs/database.md`](docs/database.md) y las reglas funcionales en [`docs/business-rules.md`](docs/business-rules.md).

## Hardening para despliegue

- El Web Service institucional disponible usa HTTP dentro de la red interna; su transporte depende del proveedor.
- El cifrado y los certificados de SQL Server deben definirse segun la infraestructura del despliegue. La configuracion actual corresponde a SQL Server Express local.
- El rate limiting de login es recomendable antes del despliegue definitivo, pero no forma parte de esta etapa interna.
- La decision de traslado, por ser inmutable, exige un token CSRF ligado a la sesion. Los demas formularios HTML existentes aun deben incorporarse a esta proteccion antes de exponer la aplicacion fuera del entorno controlado.
- Los scripts `002` a `008` requieren que el operador o runner seleccione explicitamente la base destino con `sqlcmd -d`.
