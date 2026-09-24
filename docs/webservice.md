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

## Campos utilizados

- `FormaDesembolso = 1`: Emision de cheque.
- `FormaDesembolso = 3`: Abono a prestamo.
- `NombreEnCheque`: nombre del cliente; todos los registros deben coincidir.
- `ValorNeto`: monto del cheque o del abono segun su forma.
- `Gasto01`: descuento usado para los escenarios actualmente confirmados.
- `NumeroCredito`: se conserva desde el abono.
- `OrdenPago`: se conserva desde la emision de cheque y no es el numero de cheque.
- `Ejecutado`: actualmente debe ser estrictamente `true`.

Para el proceso actual de Planilla Checks, el campo de descuentos utilizado es Gasto01. Los campos Gasto02-Gasto10 no forman parte del cálculo requerido.

No se utiliza `Monto`, porque los ejemplos reales lo devuelven en cero. `numeroCheque` sigue siendo un dato manual de Planilla Checks.

## Calculo conocido

Para una emision de cheque individual con cero o un abono:

```text
montoCancelado = ValorNeto del abono, o 0 si no existe
descuentos     = Gasto01 de la emision de cheque
montoCheque    = ValorNeto de la emision de cheque
montoAprobado  = montoCancelado + descuentos + montoCheque
```

Los importes se convierten a centavos enteros antes de sumarlos y se devuelven con dos decimales. La fecha de extraccion la genera Planilla Checks al recibir correctamente la respuesta.

`cantidadCheques` cuenta solo elementos con `FormaDesembolso = 1`. Una emision produce metodologia `INDIVIDUAL`; dos o mas producen `GRUPAL`. La suma financiera grupal no esta confirmada, por lo que esas respuestas no se calculan ni se guardan.

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

## Pendiente de confirmacion del ingeniero

1. Como procesar una distribucion que tenga unicamente Abono a prestamo.
2. Confirmacion definitiva de `Ejecutado === true` como estado final requerido.
3. Como agregar montos cuando existen varias emisiones de cheque.
