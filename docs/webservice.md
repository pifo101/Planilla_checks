# Web Service de distribucion de desembolso

## Endpoint

Planilla Checks consulta mediante GET:

```text
{WEBSERVICE_BASE_URL}/RecuperarDistribucionDesembolso/{numeroSolicitud}
```

La URL base se configura con `WEBSERVICE_BASE_URL`. El numero de solicitud acepta solamente entre 1 y 30 digitos; no se permiten rutas, URLs ni caracteres de consulta.

## Arquitectura

```text
Navegador
   |
   v
GET /api/solicitudes/:numeroSolicitud/distribucion
   |
   v
webservice.service.js (HTTP, timeout y validacion JSON)
   |
   v
disbursement.service.js (normalizacion y reglas conocidas)
   |
   v
Respuesta interna estable
```

El navegador nunca llama directamente al servidor externo. Consultar no crea planillas, solicitudes ni otros registros SQL.

## Consulta, borrador e historial

- `Obtener datos` consulta el Web Service y muestra una solicitud; no la guarda.
- `Agregar a planilla` valida disponibilidad en SQL Server y agrega solo los campos necesarios a un borrador temporal en memoria del frontend; no inserta registros.
- El borrador se pierde al recargar la pagina mientras no se haya enviado.
- `Enviar planilla` usa `POST /api/planillas`. El servidor valida el contenido y persiste la planilla con todas sus solicitudes dentro de una transaccion.
- Si el envio falla, el borrador se conserva. Si se confirma, queda vacio y la planilla queda en estado `ENVIADA`.
- El historial real y el flujo de Contabilidad permanecen pendientes.

La disponibilidad se consulta con `GET /api/solicitudes/:numeroSolicitud/disponibilidad?numeroCheque=...`. Este endpoint protegido solo ejecuta una consulta parametrizada sobre `solicitudes_planilla`.

## Envio de planilla

`POST /api/planillas` requiere una sesion activa con rol `ASISTENTE`. El body contiene un arreglo `solicitudes` de entre 1 y 100 elementos. Cada elemento envia `numeroSolicitud`, `numeroCheque` y el `submissionToken` firmado que el backend genero al normalizar la consulta. Los miembros grupales tambien envian su `miembroId` protegido por el snapshot y el grupo debe enviarse completo. Todos los tokens del grupo contienen la misma huella firmada de identidades y fecha de extraccion, por lo que no pueden mezclarse miembros obtenidos en consultas distintas.

El navegador no envia como autoridad el usuario, agencia, codigo, estado, fechas, cliente, metodologia ni montos libres. El token esta ligado al usuario, vence a las ocho horas y protege el snapshot normalizado contra alteraciones. El backend toma usuario y agencia de la sesion revalidada, genera un codigo `PLN-<UUID>`, fuerza el estado `ENVIADA` y genera las fechas. Tambien valida duplicados internos, disponibilidad, metodologia `INDIVIDUAL`, montos enteros no negativos y coherencia financiera. No vuelve a llamar al Web Service institucional durante el POST.

Una respuesta exitosa usa estado HTTP `201` y devuelve solamente `id`, `codigo` y `estado` de la planilla. Los errores de estructura o token usan `400`, un envio demasiado grande usa `413`, una metodologia no confirmada usa `422` y los duplicados usan `409`. Autenticacion y rol conservan las respuestas `401` y `403` existentes.

Los prechecks no sustituyen las restricciones UNIQUE de SQL Server. Si otra peticion utiliza una solicitud o cheque entre la comprobacion y el INSERT, el error se devuelve como conflicto `409` sin exponer el mensaje SQL. Un fallo de cualquier INSERT revierte la planilla completa.

## Campos utilizados

- `FormaDesembolso = 1`: Emision de cheque.
- `FormaDesembolso = 3`: Abono a prestamo.
- `ID`: identifica una emision y se conserva como identidad tecnica del miembro grupal. Debe existir y ser unico dentro de la respuesta.
- `NombreEnCheque`: nombre del cliente. En una solicitud grupal pertenece al miembro de cada emision.
- `ValorNeto`: monto del cheque o del abono segun su forma.
- `Gasto01`: se usa como descuento solamente cuando pertenece a una Emision de cheque; en un Abono a prestamo se ignora, incluso si es distinto de cero.
- `NumeroCredito`: se conserva desde el abono.
- `OrdenPago`: se conserva desde la emision de cheque y no es el numero de cheque.
- `Ejecutado`: actualmente debe ser estrictamente `true`.

Los campos `Gasto02-Gasto10` no participan actualmente en el calculo, sin importar la forma de desembolso.

No se utiliza `Monto`, porque los ejemplos reales lo devuelven en cero. `numeroCheque` sigue siendo un dato manual de Planilla Checks.

## Calculo conocido

Para una emision de cheque individual con cero o un abono:

```text
montoCancelado = ValorNeto del abono, o 0 si no existe
descuentos     = Gasto01 de la emision de cheque
montoCheque    = ValorNeto de la emision de cheque
montoAprobado  = montoCancelado + descuentos + montoCheque
```

`Gasto01` del abono no se suma, no se trata como descuento y no invalida la distribucion.

Los importes se convierten a centavos enteros antes de sumarlos y se devuelven con dos decimales. La fecha de extraccion la genera Planilla Checks al recibir correctamente la respuesta.

`cantidadCheques` cuenta solo elementos con `FormaDesembolso = 1`. Una emision produce metodologia `INDIVIDUAL`; dos o mas producen `GRUPAL`, y cada emision produce un miembro/cuadro. Un grupo sin abonos se calcula por emision usando `montoCancelado = 0`, `descuentos = Gasto01` y `montoCheque = ValorNeto`. Si existe cualquier abono grupal, no se asigna a ningun miembro porque el contrato disponible no contiene una relacion confirmada; los miembros se muestran con calculo no confirmado y no pueden guardarse.

## Escenarios controlados

- Array vacio o JSON/formato invalido.
- Timeout, error de red y estado HTTP no exitoso.
- Operaciones con `Ejecutado !== true`.
- Nombres de cliente diferentes.
- Solo abono a prestamo.
- Formas de desembolso desconocidas.
- Metodologia grupal sin regla financiera confirmada.

La API devuelve codigos diferenciados y mensajes aptos para interfaz sin exponer respuestas completas ni datos internos.

El endpoint institucional disponible actualmente usa HTTP sin cifrado. Planilla Checks no sigue redirecciones automaticas, pero la confidencialidad e integridad del transporte dependen del servidor externo. Debe migrarse `WEBSERVICE_BASE_URL` a HTTPS cuando el proveedor lo habilite.

## Consultas por numero de solicitud

Por definicion del proceso institucional, las consultas no estan restringidas por agencia. Un usuario autorizado puede consultar cualquier numero de solicitud valido. Al enviar, la agencia se obtiene del asistente autenticado para identificar la procedencia de la planilla; no autoriza ni restringe la consulta de una solicitud.

## Pendiente de confirmacion del ingeniero

1. Como procesar una distribucion que tenga unicamente Abono a prestamo.
2. Confirmacion definitiva de `Ejecutado === true` como estado final requerido.
3. Que campo relaciona un `AbonoAPrestamo` con su `EmisionDeCheque` en una distribucion grupal.
4. Confirmacion contractual de que `ID` es estable entre consultas y representa de forma permanente la identidad de la emision. La implementacion exige que este presente y no se repita dentro de la respuesta.
