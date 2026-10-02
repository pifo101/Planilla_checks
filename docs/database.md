# Base de datos

## Modelo inicial

```text
Agencia
   |
   +--- Usuario
   |
   +--- Planilla
           |
           +--- SolicitudAsignada --- SolicitudPlanilla

Usuario --- crea Planilla
Usuario --- decide traslado de Planilla
Usuario --- crea ActaDiaria (una por fecha global)
```

- `agencias.id`, `usuarios.id`, `actas_diarias.id`, `planillas.id` y `solicitudes_planilla.id` son las claves primarias.
- `usuarios.agencia_id` referencia `agencias.id`, es obligatorio para `ASISTENTE` y debe ser `NULL` para `ADMIN` y `CONTABILIDAD`.
- `planillas.agencia_id` referencia `agencias.id`.
- `planillas.creada_por_usuario_id` referencia `usuarios.id`.
- `planillas.decision_traslado_usuario_id` referencia `usuarios.id` cuando existe una decision.
- `solicitudes_asignadas.numero_solicitud` reserva cada solicitud para una sola `planilla_id`.
- `solicitudes_planilla.(numero_solicitud, planilla_id)` referencia esa reserva.
- `solicitudes_planilla.planilla_id` tambien referencia `planillas.id`.
- `actas_diarias.creada_por_usuario_id` referencia `usuarios.id`.

## Restricciones

- `agencias.codigo`, `usuarios.email` y `planillas.codigo` son unicos.
- `solicitudes_asignadas.numero_solicitud` es PK y garantiza que una solicitud completa pertenezca a una sola planilla, incluso bajo concurrencia.
- `(solicitudes_planilla.numero_solicitud, solicitudes_planilla.miembro_id)` es unico. `miembro_id` es `NULL` para individuales y contiene el `ID` tecnico del registro de Emision de cheque para grupales, permitiendo varias filas legitimas de una misma solicitud dentro de la planilla reservada sin repetir la misma emision. No representa la identidad funcional de la persona y nunca relaciona un abono con una emision; esa relacion se resuelve previamente mediante `NombreEnCheque` normalizado.
- `solicitudes_planilla.numero_cheque` es unico globalmente y no admite valores nulos.
- Los importes usan `DECIMAL(18,2)` y no admiten valores negativos.
- El monto aprobado debe coincidir con descuentos, cheque y monto cancelado; el servicio lo calcula antes de insertar.
- Los roles permitidos son `ADMIN`, `ASISTENTE` y `CONTABILIDAD`.
- `CK_usuarios_rol_agencia` mantiene consistente la relacion rol/agencia. La aplicacion valida ademas que una agencia asignada a un asistente este activa.
- Una solicitud marcada como procesada no puede modificarse ni eliminarse. El trigger permite el cambio inicial a procesada y bloquea cambios posteriores.
- Una planilla que ya salio de borrador no puede eliminarse y debe tener fecha de envio.
- `CK_planillas_decision_traslado` impide decisiones parciales: los tres campos de decision son todos `NULL` o todos no nulos.

## Decision de traslado

`planillas.trasladado BIT NULL` modela una decision independiente de `planillas.estado`: `NULL` es pendiente, `1` es trasladada y `0` es no trasladada. `fecha_decision_traslado DATETIME2(0)` y `decision_traslado_usuario_id` registran el instante y usuario de Contabilidad. Las filas historicas permanecen pendientes porque no existe evidencia para inventar una decision.

La decision corresponde a la planilla completa. No actualiza `solicitudes_planilla.estado`, `procesado` ni `fecha_procesado`. Tampoco representa aprobacion o rechazo crediticio. Los estados legados `RECIBIDA` y `PROCESADA` permanecen permitidos, pero no se interpretan como traslado.

## Acta

`actas_diarias` representa el acta global vigente de cada fecha operativa. Contiene `id BIGINT`, `fecha DATE`, `numero_acta NVARCHAR(50)`, `creada_por_usuario_id` y `fecha_creacion DATETIME2(0)`. `UQ_actas_diarias_fecha` garantiza una sola fila por fecha incluso ante creaciones concurrentes; el numero no es unico entre fechas.

El numero se captura manualmente, se recorta y admite de 1 a 50 caracteres sin caracteres de control. No se impone un formato empresarial. `planillas.numero_acta NVARCHAR(50) NULL` se conserva como snapshot: las planillas nuevas copian el valor vigente al enviarse y las historicas sin informacion real permanecen `NULL`. No se agrega `acta_diaria_id`, porque el snapshot existente cubre el requisito historico sin duplicar una relacion que hoy no se necesita.

## Indices

- `IX_usuarios_agencia` apoya consultas de usuarios asociados a una agencia.
- `IX_planillas_fecha_agencia` apoya consultas por fecha y agencia.
- `IX_planillas_agencia_estado` apoya historial y filtros por agencia/estado.
- `IX_solicitudes_planilla_estado` apoya el detalle y procesamiento de solicitudes de una planilla.
- `IX_planillas_traslado_pendiente` apoya la bandeja por decision, agencia y fecha de envio.
- `IX_planillas_historial_traslado` apoya historial por fecha de decision, agencia y resultado.
- Las restricciones UNIQUE crean indices para codigo, correo, identidad solicitud/miembro y numero de cheque.

## Persistencia Node

`src/config/database.js` mantiene un unico pool reutilizable de `mssql/msnodesqlv8`. Los repositorios contienen SQL parametrizado; los servicios aplican reglas que dependen del usuario autenticado. `planilla.repository.js` crea la planilla, reserva cada numero en `solicitudes_asignadas` e inserta todas sus solicitudes o miembros dentro de una transaccion, con rollback ante cualquier error. La PK de la reserva serializa envios concurrentes aun cuando los IDs de miembros no coincidan. El envio usa estado `ENVIADA` y una fecha de envio generada en el servidor.

`user.repository.js` lista usuarios sin seleccionar `password_hash`, crea cuentas y actualiza exclusivamente `rol`, `agencia_id`, `activo` y `updated_at` para Administracion. `agency.repository.js` obtiene agencias activas para asignacion y el directorio completo con cantidad de usuarios asociados. Todas las entradas variables usan parametros y tipos `mssql` explicitos.

El historial del asistente consulta unicamente planillas enviadas de la agencia presente en la sesion revalidada. El listado usa el rango UTC correspondiente al dia calendario de `America/Guatemala`, pagina 20 filas y obtiene de SQL `COUNT` y `SUM` con `COALESCE` sobre `solicitudes_planilla`. El listado y detalle leen `planillas.numero_acta`, nunca el acta actualmente vigente. El detalle exige simultaneamente el ID de planilla y la agencia autorizada; una planilla ajena se comporta como inexistente.

Contabilidad usa contratos separados para no debilitar el aislamiento del asistente. `findPendingForAccounting` consulta `trasladado IS NULL` sin rango de fecha, agrega solicitudes y pagina 20 planillas ordenadas por agencia. `decideAccountingTransfer` usa un unico `UPDATE ... WHERE id = @id AND trasladado IS NULL`; las filas afectadas determinan al ganador concurrente. `findAccountingTransferHistory` consulta decisiones por rango de `fecha_decision_traslado`, agencia y resultado. `findAccountingDetail` devuelve ademas la auditoria, sin mutar datos.

El selector de agencias de Contabilidad procede de `dbo.agencias`: incluye agencias activas y tambien inactivas que tengan planillas historicas en un estado no borrador. Los importes se agregan como `DECIMAL(18,2)` en SQL y se devuelven como texto decimal para no introducir aritmetica de punto flotante en Node.

`POST /api/planillas` no acepta acta, agencia, usuario creador, codigo, estado, fechas ni montos libres como autoridad del navegador. `fecha_extraccion` procede del snapshot HMAC generado al validar el Web Service y se normaliza a segundos para `DATETIME2(0)`; `fecha_envio` se genera independientemente al recibir el POST. El servicio calcula con la fecha de envio la fecha operativa en Guatemala, consulta el acta en SQL y rechaza el envio con `DAILY_ACTA_REQUIRED` si falta. Si existe, copia `numero_acta` a la nueva planilla. La reserva de solicitud y las restricciones UNIQUE de cheques y codigo permanecen como defensa ante condiciones de carrera.

`GET /api/acta-diaria` requiere autenticacion y consulta la fecha operativa actual sin usar agencia. `POST /api/acta-diaria` requiere rol `ASISTENTE`, acepta solo el dato manual `numeroActa` como autoridad y toma fecha y creador del servidor. Los errores SQL `2601/2627` de `UQ_actas_diarias_fecha` se convierten en `DAILY_ACTA_ALREADY_EXISTS` y, cuando es posible, incluyen el acta ganadora. No hay endpoints de actualizacion o eliminacion.

`database/004_group_members.sql` migra instalaciones existentes: agrega `miembro_id`, elimina `UQ_solicitudes_numero_solicitud` y crea `UQ_solicitudes_numero_solicitud_miembro`. No elimina ni recrea tablas ni bases.

`database/005_daily_actas.sql` crea `actas_diarias` de forma incremental y no inventa actas para planillas historicas.

`database/006_user_role_agency_constraint.sql` normaliza a `NULL` las agencias antiguas de `ADMIN`/`CONTABILIDAD` y agrega incrementalmente `CK_usuarios_rol_agencia`. No elimina usuarios ni modifica planillas.

`database/007_accounting_transfer_decision.sql` agrega las tres columnas de decision, FK, CHECK e indices de bandeja e historial. Es incremental, conserva las planillas existentes con `trasladado = NULL` y no cambia estados tecnicos.

`database/008_request_planilla_integrity.sql` crea `solicitudes_asignadas`, migra una reserva por cada solicitud historica y agrega la FK compuesta desde sus miembros. Antes de migrar detecta si un numero existente pertenece a varias planillas y aborta sin elegir ni modificar datos. La tabla y la FK forman parte del baseline para instalaciones nuevas.

Las reglas confirmadas de asociacion no requieren cambios de esquema: los montos resultantes ya se almacenan por fila de emision y el constraint compuesto sigue evitando duplicar la misma emision tecnica dentro de una solicitud.

El borrador del navegador no es persistencia. El historial del asistente no cambia. Los GET de Contabilidad son de solo lectura; la unica mutacion es la decision explicita de traslado. La correccion posterior de una decision equivocada esta pendiente de definicion funcional.

`DB_DATABASE` es obligatorio. `001_create_database.sql` es un bootstrap opcional y crea unicamente la base inicial predeterminada `PlanillaChecksDB`; una base con otro nombre debe existir previamente. Los scripts `002` a `008` no contienen `USE`: deben ejecutarse con `sqlcmd -d "NombreBase"` y operan exclusivamente sobre esa conexion seleccionada. La verificacion integral compara `DB_NAME()` con `DB_DATABASE` antes de crear datos temporales.

Las pruebas de integracion exigen `TEST_DB_DATABASE=PlanillaChecksTestDB`, distinta de `DB_DATABASE` y existente previamente. La suite no crea ni elimina bases. La configuracion TLS definitiva de SQL Server depende de la infraestructura de despliegue; el entorno actual usa SQL Server Express local.

Las sesiones HTTP siguen almacenandose en memoria por ahora. No contienen hashes ni contrasenas y solo guardan identidad, rol y agencia. Antes de desplegar varias instancias de la aplicacion debe configurarse un almacen de sesiones compartido.
