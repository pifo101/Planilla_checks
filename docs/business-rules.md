# Reglas de negocio pendientes

La consulta actual obtiene datos del Web Service. `Obtener datos` no guarda la solicitud. La asistente puede agregar solicitudes a un borrador temporal mantenido en memoria por el navegador; `Agregar a planilla` tampoco inserta ni envia datos. Al recargar la pagina, este borrador se pierde.

Antes de agregar, Planilla Checks consulta SQL Server para comprobar que el numero de solicitud y el numero de cheque no se hayan utilizado. Tambien evita duplicados dentro del borrador. El historial permanecera en SQL Server cuando se implemente el envio definitivo, que sigue pendiente para la siguiente fase.

Reglas del flujo:

1. El numero de solicitud no puede repetirse despues de haber sido enviado en una planilla.
2. El numero de cheque debe ser unico y nunca reutilizarse.
3. Las consultas de distribucion de desembolso no estan restringidas por agencia. Un usuario autorizado puede consultar cualquier numero de solicitud valido.
4. La agencia debe obtenerse del usuario autenticado para identificar la procedencia de una futura planilla enviada; nunca debe aceptarse un `agencia_id` arbitrario del navegador.
5. La fecha de extraccion debe utilizar la fecha y hora del sistema.
6. El monto aprobado depende de la informacion recibida del Web Service:
   - Sin cancelacion: `montoAprobado = descuentos + montoCheque`.
   - Con cancelacion: `montoAprobado = descuentos + montoCheque + montoCancelado`.
   - Para el proceso actual de Planilla Checks, el campo de descuentos utilizado es Gasto01. Los campos Gasto02-Gasto10 no forman parte del cálculo requerido.
7. La metodologia cuenta unicamente operaciones con `FormaDesembolso = 1`: una es `INDIVIDUAL` y dos o mas son `GRUPAL`.
8. Una planilla puede contener varias solicitudes.
9. Una vez enviada, la planilla debe conservarse historicamente.
10. Contabilidad puede recibir planillas de distintas agencias.
11. Los creditos procesados deben quedar bloqueados para evitar modificaciones accidentales.
12. Los totales del borrador se calculan en centavos enteros y se actualizan al agregar o eliminar solicitudes.
13. `Limpiar` elimina solamente la consulta activa y conserva las solicitudes agregadas al borrador.

## Pendientes de confirmacion del ingeniero

1. Como representar una distribucion que contiene unicamente Abono a prestamo. Actualmente se detecta como no soportada y no se guarda.
2. Confirmacion definitiva de que `Ejecutado === true` representa el estado final requerido. Por seguridad, actualmente se rechaza cualquier otro valor.
3. Como agregar los montos de una distribucion grupal. La metodologia se identifica, pero sus montos no se calculan ni se guardan.
