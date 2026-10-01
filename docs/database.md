# Base de datos

## Modelo inicial

```text
Agencia
   |
   +--- Usuario
   |
   +--- Planilla
           |
           +--- SolicitudPlanilla

Usuario --- crea Planilla
Usuario --- crea ActaDiaria (una por fecha global)
```

- `agencias.id`, `usuarios.id`, `actas_diarias.id`, `planillas.id` y `solicitudes_planilla.id` son las claves primarias.
- `usuarios.agencia_id` referencia `agencias.id` y es obligatorio para el rol `ASISTENTE`.
- `planillas.agencia_id` referencia `agencias.id`.
- `planillas.creada_por_usuario_id` referencia `usuarios.id`.
- `solicitudes_planilla.planilla_id` referencia `planillas.id`.
- `actas_diarias.creada_por_usuario_id` referencia `usuarios.id`.

## Restricciones

- `agencias.codigo`, `usuarios.email` y `planillas.codigo` son unicos.
- `(solicitudes_planilla.numero_solicitud, solicitudes_planilla.miembro_id)` es unico. `miembro_id` es `NULL` para individuales y contiene el `ID` tecnico del registro de Emision de cheque para grupales, permitiendo varias filas legitimas de una misma solicitud sin repetir la misma emision. No representa la identidad funcional de la persona y nunca relaciona un abono con una emision; esa relacion se resuelve previamente mediante `NombreEnCheque` normalizado.
- `solicitudes_planilla.numero_cheque` es unico globalmente y no admite valores nulos.
- Los importes usan `DECIMAL(18,2)` y no admiten valores negativos.
- El monto aprobado debe coincidir con descuentos, cheque y monto cancelado; el servicio lo calcula antes de insertar.
- Los roles permitidos son `ADMIN`, `ASISTENTE` y `CONTABILIDAD`.
- Una solicitud marcada como procesada no puede modificarse ni eliminarse. El trigger permite el cambio inicial a procesada y bloquea cambios posteriores.
- Una planilla que ya salio de borrador no puede eliminarse y debe tener fecha de envio.

## Acta

`actas_diarias` representa el acta global vigente de cada fecha operativa. Contiene `id BIGINT`, `fecha DATE`, `numero_acta NVARCHAR(50)`, `creada_por_usuario_id` y `fecha_creacion DATETIME2(0)`. `UQ_actas_diarias_fecha` garantiza una sola fila por fecha incluso ante creaciones concurrentes; el numero no es unico entre fechas.

El numero se captura manualmente, se recorta y admite de 1 a 50 caracteres sin caracteres de control. No se impone un formato empresarial. `planillas.numero_acta NVARCHAR(50) NULL` se conserva como snapshot: las planillas nuevas copian el valor vigente al enviarse y las historicas sin informacion real permanecen `NULL`. No se agrega `acta_diaria_id`, porque el snapshot existente cubre el requisito historico sin duplicar una relacion que hoy no se necesita.

## Indices

- `IX_usuarios_agencia` apoya consultas de usuarios asociados a una agencia.
- `IX_planillas_fecha_agencia` apoya consultas por fecha y agencia.
- `IX_planillas_agencia_estado` apoya historial y filtros por agencia/estado.
- `IX_solicitudes_planilla_estado` apoya el detalle y procesamiento de solicitudes de una planilla.
- Las restricciones UNIQUE crean indices para codigo, correo, identidad solicitud/miembro y numero de cheque.

## Persistencia Node

`src/config/database.js` mantiene un unico pool reutilizable de `mssql/msnodesqlv8`. Los repositorios contienen SQL parametrizado; los servicios aplican reglas que dependen del usuario autenticado. `planilla.repository.js` crea la planilla y todas sus solicitudes o miembros dentro de una transaccion, con rollback ante cualquier error. El envio usa estado `ENVIADA` y una fecha de envio generada en el servidor.

El historial del asistente consulta unicamente planillas enviadas de la agencia presente en la sesion revalidada. El listado usa el rango UTC correspondiente al dia calendario de `America/Guatemala`, pagina 20 filas y obtiene de SQL `COUNT` y `SUM` con `COALESCE` sobre `solicitudes_planilla`. El listado y detalle leen `planillas.numero_acta`, nunca el acta actualmente vigente. El detalle exige simultaneamente el ID de planilla y la agencia autorizada; una planilla ajena se comporta como inexistente.

Contabilidad usa contratos separados para no debilitar el aislamiento del asistente. `findForAccounting` consulta los estados oficiales `ENVIADA`, `RECIBIDA` y `PROCESADA`, filtra por un rango parametrizado de `fecha_envio` y por una agencia opcional validada, agrega cada fila de `solicitudes_planilla` y pagina 20 planillas con `OFFSET/FETCH`. Un agregado separado en la misma consulta devuelve totales del conjunto filtrado, no solo de la pagina visible. `findAccountingDetail` admite cualquier agencia para un usuario `CONTABILIDAD` y devuelve los valores financieros, miembro tecnico, estado y datos de procesamiento persistidos.

El selector de agencias de Contabilidad procede de `dbo.agencias`: incluye agencias activas y tambien inactivas que tengan planillas historicas en un estado no borrador. Los importes se agregan como `DECIMAL(18,2)` en SQL y se devuelven como texto decimal para no introducir aritmetica de punto flotante en Node.

`POST /api/planillas` no acepta acta, agencia, usuario creador, codigo, estado, fechas ni montos libres como autoridad del navegador. El servicio trunca el instante al segundo para coincidir con `DATETIME2(0)`, calcula sobre ese mismo valor la fecha operativa en Guatemala, consulta el acta en SQL y rechaza el envio con `DAILY_ACTA_REQUIRED` si falta. Si existe, copia `numero_acta` a la nueva planilla. Las restricciones UNIQUE de solicitudes, cheques y codigo permanecen como defensa ante condiciones de carrera.

`GET /api/acta-diaria` requiere autenticacion y consulta la fecha operativa actual sin usar agencia. `POST /api/acta-diaria` requiere rol `ASISTENTE`, acepta solo el dato manual `numeroActa` como autoridad y toma fecha y creador del servidor. Los errores SQL `2601/2627` de `UQ_actas_diarias_fecha` se convierten en `DAILY_ACTA_ALREADY_EXISTS` y, cuando es posible, incluyen el acta ganadora. No hay endpoints de actualizacion o eliminacion.

`database/004_group_members.sql` migra instalaciones existentes: agrega `miembro_id`, elimina `UQ_solicitudes_numero_solicitud` y crea `UQ_solicitudes_numero_solicitud_miembro`. No elimina ni recrea tablas ni bases.

`database/005_daily_actas.sql` crea `actas_diarias` de forma incremental y no inventa actas para planillas historicas.

Las reglas confirmadas de asociacion no requieren cambios de esquema: los montos resultantes ya se almacenan por fila de emision y el constraint compuesto sigue evitando duplicar la misma emision tecnica dentro de una solicitud.

El borrador del navegador no es persistencia. Los historiales del asistente y de Contabilidad usan SQL Server y son de solo lectura. Consultar desde Contabilidad no ejecuta `UPDATE` ni representa una recepcion de dominio. Las transiciones de recepcion y procesamiento continuan pendientes.

`DB_DATABASE` es obligatorio. `001_create_database.sql` es un bootstrap opcional y crea unicamente la base inicial predeterminada `PlanillaChecksDB`; una base con otro nombre debe existir previamente. Los scripts `002` a `005` no contienen `USE`: deben ejecutarse con `sqlcmd -d "NombreBase"` y operan exclusivamente sobre esa conexion seleccionada. La verificacion integral compara `DB_NAME()` con `DB_DATABASE` antes de crear datos temporales.

Las pruebas de integracion exigen una base separada mediante `TEST_DB_DATABASE`. El nombre debe terminar en `TestDB`, ser distinto de `DB_DATABASE` y existir previamente. La suite no crea ni elimina bases. La configuracion TLS definitiva de SQL Server depende de la infraestructura de despliegue; el entorno actual usa SQL Server Express local.

Las sesiones HTTP siguen almacenandose en memoria por ahora. No contienen hashes ni contrasenas y solo guardan identidad, rol y agencia. Antes de desplegar varias instancias de la aplicacion debe configurarse un almacen de sesiones compartido.
