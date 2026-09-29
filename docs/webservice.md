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
- `ID`: correlativo tecnico del registro de Emision de cheque. Se conserva como `miembroId` para snapshots, persistencia y duplicados, pero no identifica funcionalmente a la persona ni relaciona un abono con una emision. Debe existir y ser unico entre las emisiones grupales de la respuesta.
- `NombreEnCheque`: nombre del cliente y unica clave funcional confirmada para relacionar un Abono a prestamo con su Emision de cheque.
- `ValorNeto`: monto del cheque o del abono segun su forma.
- `Gasto01`: se usa como descuento solamente cuando pertenece a una Emision de cheque; en un Abono a prestamo se ignora, incluso si es distinto de cero.
- `NumeroCredito`: se conserva desde el abono.
- `OrdenPago`: se conserva desde la emision de cheque y no es el numero de cheque.
- `Ejecutado`: debe ser estrictamente `true` en todos los registros de la distribucion. Cualquier otro valor bloquea la solicitud completa.

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

`Gasto01` del abono no se suma, no se trata como descuento y no invalida la distribucion. Los mismos calculos se aplican a cada emision grupal y a su posible abono asociado.

Los importes se convierten a centavos enteros antes de sumarlos y se devuelven con dos decimales. La fecha de extraccion la genera Planilla Checks al recibir correctamente la respuesta.

`cantidadCheques` cuenta solo elementos con `FormaDesembolso = 1`. Una emision produce metodologia `INDIVIDUAL`; dos o mas producen `GRUPAL`, y cada emision produce un miembro/cuadro. Cada miembro puede carecer de abono o tener exactamente uno asociado por `NombreEnCheque`; un miembro que tenga unicamente abono no es valido.

La clave de comparacion de `NombreEnCheque` se construye recortando espacios al inicio/final, colapsando cualquier secuencia de espacios a uno y convirtiendo a mayusculas. El nombre mostrado conserva sus caracteres y solo normaliza los espacios. No se eliminan acentos, puntuacion, palabras ni fragmentos, y no se usa similitud aproximada. Por ejemplo, `" MARIA   TOJORON "` coincide con `"Maria Tojoron"`, pero `"MARIA TOJORON"` no coincide con `"MARIA TOJ"`.

## Escenarios controlados

- Array vacio o JSON/formato invalido.
- Timeout, error de red y estado HTTP no exitoso.
- Operaciones con `Ejecutado !== true`; la operacion no se ignora y no se emite snapshot.
- Abono cuyo nombre normalizado no corresponde a ninguna emision.
- Dos emisiones con el mismo nombre normalizado o dos abonos para el mismo nombre.
- Solo abono a prestamo; la solicitud no procede porque no contiene una emision valida.
- Formas de desembolso desconocidas.

La API devuelve codigos diferenciados y mensajes aptos para interfaz sin exponer respuestas completas ni datos internos.

El endpoint institucional disponible actualmente usa HTTP sin cifrado. Planilla Checks no sigue redirecciones automaticas, pero la confidencialidad e integridad del transporte dependen del servidor externo. Debe migrarse `WEBSERVICE_BASE_URL` a HTTPS cuando el proveedor lo habilite.

## Consultas por numero de solicitud

Por definicion del proceso institucional, las consultas no estan restringidas por agencia. Un usuario autorizado puede consultar cualquier numero de solicitud valido. Al enviar, la agencia se obtiene del asistente autenticado para identificar la procedencia de la planilla; no autoriza ni restringe la consulta de una solicitud.

## Datos observados

Las muestras documentadas y fixtures existentes entregan `NombreEnCheque` como texto, habitualmente en mayusculas. No se conto con una muestra institucional real de solicitud grupal con abonos durante esta correccion; esa combinacion se valida con fixtures que conservan exactamente la estructura documentada del Web Service.
