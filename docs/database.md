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
```

- `agencias.id`, `usuarios.id`, `planillas.id` y `solicitudes_planilla.id` son las claves primarias.
- `usuarios.agencia_id` referencia `agencias.id` y es obligatorio para el rol `ASISTENTE`.
- `planillas.agencia_id` referencia `agencias.id`.
- `planillas.creada_por_usuario_id` referencia `usuarios.id`.
- `solicitudes_planilla.planilla_id` referencia `planillas.id`.

## Restricciones

- `agencias.codigo`, `usuarios.email` y `planillas.codigo` son unicos.
- `solicitudes_planilla.numero_solicitud` es unico globalmente porque una solicitud enviada no puede volver a enviarse.
- `solicitudes_planilla.numero_cheque` es unico globalmente y no admite valores nulos.
- Los importes usan `DECIMAL(18,2)` y no admiten valores negativos.
- El monto aprobado debe coincidir con descuentos, cheque y monto cancelado; el servicio lo calcula antes de insertar.
- Los roles permitidos son `ADMIN`, `ASISTENTE` y `CONTABILIDAD`.
- Una solicitud marcada como procesada no puede modificarse ni eliminarse. El trigger permite el cambio inicial a procesada y bloquea cambios posteriores.
- Una planilla que ya salio de borrador no puede eliminarse y debe tener fecha de envio.

## Acta

La decision temporal es conservar `planillas.numero_acta` como nullable. Esto permite capturar un numero manual o automatico sin imponer todavia su origen. Si el acta adquiere ciclo de vida, documentos o relaciones propias, se migrara a una entidad separada.

## Indices

- `IX_usuarios_agencia` apoya consultas de usuarios asociados a una agencia.
- `IX_planillas_fecha_agencia` apoya consultas por fecha y agencia.
- `IX_planillas_agencia_estado` apoya historial y filtros por agencia/estado.
- `IX_solicitudes_planilla_estado` apoya el detalle y procesamiento de solicitudes de una planilla.
- Las restricciones UNIQUE crean indices para codigo, correo, numero de solicitud y numero de cheque.

## Persistencia Node

`src/config/database.js` mantiene un unico pool reutilizable de `mssql/msnodesqlv8`. Los repositorios contienen SQL parametrizado; los servicios aplican reglas que dependen del usuario autenticado. `planilla.repository.js` crea la planilla y todas sus solicitudes dentro de una transaccion, con rollback ante cualquier error.

Las sesiones HTTP siguen almacenandose en memoria por ahora. No contienen hashes ni contrasenas y solo guardan identidad, rol y agencia. Antes de desplegar varias instancias de la aplicacion debe configurarse un almacen de sesiones compartido.
